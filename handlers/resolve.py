"""
GET/POST /api/resolve
Vercel cron entry point (hourly) and manual trigger.

For every unresolved prediction in Supabase, we look up its match on
football-data.org. If that match has finished, we
mark the prediction correct/incorrect and update the leaderboard.
"""

import asyncio
import math
from http.server import BaseHTTPRequestHandler

from lib.common import get_supabase, send_json


def _wilson_score(correct: int, total: int, z: float = 1.96) -> float:
    """Lower bound of the Wilson score interval for a Bernoulli process.

    Use z=1.96 for a 95% confidence interval. This is the standard way to
    rank by success rate when sample sizes differ: 15/20 correctly beats
    1/1, and 1/1 beats 0/1."""
    if total == 0:
        return 0.0
    p = correct / total
    denom = 1 + z * z / total
    centre = p + z * z / (2 * total)
    margin = z * math.sqrt((p * (1 - p) + z * z / (4 * total)) / total)
    return (centre - margin) / denom


async def _resolve():
    supabase = get_supabase()

    # 1. Gather all unresolved predictions
    unresolved = (
        supabase.table("predictions")
        .select("id, user_id, type, external_id, user_pick, question, home_team, away_team")
        .eq("resolved", False)
        .limit(500)
        .execute()
    )
    if not unresolved.data:
        return {"resolved": 0, "checked": 0}
        
    resolved_count = 0
    affected_users: set[str] = set()
    scorecards: list[dict] = []

    try:
        from lib.live_scores import get_finished_matches, _normalize_team
        finished_matches = get_finished_matches()
    except Exception:
        finished_matches = {}

    for pred in unresolved.data:
        if pred.get("home_team") and pred.get("away_team"):
            from lib.live_scores import _normalize_team
            h_norm = _normalize_team(pred["home_team"])
            a_norm = _normalize_team(pred["away_team"])
            match_key = (h_norm, a_norm)
            
            if match_key in finished_matches:
                outcome = finished_matches[match_key]
                pick = pred.get("user_pick", "")
                
                # Compare pick to outcome
                correct = False
                if outcome == "home" and pick == pred["home_team"]:
                    correct = True
                elif outcome == "away" and pick == pred["away_team"]:
                    correct = True
                elif outcome == "draw" and pick.lower() == "draw":
                    correct = True
                    
                db_outcome = "correct" if correct else "incorrect"
                supabase.table("predictions").update({
                    "resolved": True,
                    "outcome": db_outcome,
                }).eq("id", pred["id"]).execute()
                
                affected_users.add(pred["user_id"])
                resolved_count += 1
                scorecards.append({
                    "pick": pick,
                    "home": pred.get("home_team") or "",
                    "away": pred.get("away_team") or "",
                    "question": pred.get("question") or "",
                    "confidence": pred.get("confidence"),
                    "user_id": pred.get("user_id") or "",
                    "correct": correct,
                })

    # 5. Update each affected user's leaderboard row
    for user_id in affected_users:
        _recalculate_leaderboard(supabase, user_id)

    # 6. Agent scorecard memories on Walrus mainnet (Vela project agent).
    # Best-effort and non-blocking: the DB update above is the source of truth;
    # this is the learning layer the app is judged on.
    try:
        _write_scorecards(scorecards)
    except Exception as e:
        print(f"[resolve] agent memory write failed: {e}")

    return {"resolved": resolved_count, "checked": len(unresolved.data)}


def _recalculate_leaderboard(supabase, user_id: str):
    """Recompute correct count, accuracy, and Wilson rank score for one user."""
    preds = (
        supabase.table("predictions")
        .select("outcome")
        .eq("user_id", user_id)
        .eq("resolved", True)
        .execute()
    )
    rows = preds.data or []
    correct = sum(1 for r in rows if r.get("outcome") == "correct")
    total = len(rows)
    accuracy = round((correct / total * 100) if total else 0, 1)
    score = _wilson_score(correct, total)
    supabase.table("leaderboard").update({
        "correct": correct,
        "accuracy_pct": accuracy,
        "rank_score": score,
    }).eq("user_id", user_id).execute()


def _scorecard_text(s: dict) -> str:
    """One structured, recall-friendly scorecard memory."""
    subject = f"{s.get('home', '?')} vs {s.get('away', '?')}"
    if not s.get("home"):
        subject = s.get("question") or "unknown market"
    verdict = "correct" if s.get("correct") else "incorrect"
    conf = s.get("confidence")
    conf_part = f" (confidence {conf}/10)" if isinstance(conf, int) else ""
    return f"Scorecard: user predicted {s.get('pick', '?')} in {subject}{conf_part}. Result: {verdict}."


def _write_scorecards(scorecards: list[dict]) -> dict:
    """Push resolution scorecards to the Vela project agent (Walrus mainnet).

    Capped and fire-and-forget: chunked into a single batched remember call per
    batch of 20 (max the relayer accepts), accepted jobs are NOT awaited — the
    relayer takes ~45s per memory and this cron runs daily.
    """
    if not scorecards:
        return {"wrote": 0}

    import os
    import json
    import urllib.request

    base = (os.environ.get("AGENTMEM_URL") or "http://localhost:3000/api/agentmem").rstrip("/")
    max_memories = int(os.environ.get("AGENTMEM_MAX_WRITES", "10"))
    texts = [_scorecard_text(s) for s in scorecards[:max_memories]]
    if not texts:
        return {"wrote": 0}

    payload = json.dumps({"op": "rememberBatch", "texts": texts}).encode("utf-8")
    req = urllib.request.Request(
        base,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            body = json.loads(resp.read().decode("utf-8") or "{}")
        return {"wrote": len(texts), "accepted": body}
    except Exception as e:
        # 503 = agent not configured (dev without agent keys) — quiet, expected.
        print(f"[resolve] agentmem unreachable: {e}")
        return {"wrote": 0, "error": str(e)}


def _refresh_ranks(supabase):
    """Re-rank all leaderboard rows by Wilson score desc, ties broken by
    total_predictions desc (more skin in the game wins)."""
    rows = (
        supabase.table("leaderboard")
        .select("user_id, rank_score, total_predictions")
        .order("rank_score", desc=True)
        .order("total_predictions", desc=True)
        .execute()
    )
    for i, entry in enumerate(rows.data or []):
        supabase.table("leaderboard").update({"rank": i + 1}).eq("user_id", entry["user_id"]).execute()


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Vercel cron hits this hourly."""
        self._run()

    def do_POST(self):
        self._run()

    def _run(self):
        try:
            result = asyncio.run(_resolve())
            supabase = get_supabase()
            try:
                _refresh_ranks(supabase)
            except Exception as e:
                print(f"[resolve] rank refresh failed: {e}")
            send_json(self, 200, result)
        except Exception as e:
            send_json(self, 500, {"error": str(e)})
