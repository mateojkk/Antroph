"""
GET /api/credibility

The learning loop, exposed. Aggregates Vela agent state for the Feed:

  - confidence performance: how picks do by confidence bucket (1-3 low,
    4-7 mid, 8-10 high) across ALL users — a real, visible learning signal
  - top record holders: leaderboard top 3
  - agent lessons: recall from Vela's project-agent Walrus Memory
    (scorecards the resolve cron wrote on mainnet)

Returns 200 with graceful degradation: missing pieces render as empty
sections rather than failing the request.
"""

import asyncio
import json
import os
import urllib.request
from http.server import BaseHTTPRequestHandler

from lib.common import get_supabase, send_json, options


def _buckets() -> list:
    supabase = get_supabase()
    rows = (
        supabase.table("predictions")
        .select("confidence, outcome")
        .eq("resolved", True)
        .limit(5000)
        .execute()
    ).data or []
    rules = [
        ("low", lambda c: c is not None and 1 <= int(c) <= 3),
        ("mid", lambda c: c is not None and 4 <= int(c) <= 7),
        ("high", lambda c: c is not None and 8 <= int(c) <= 10),
    ]
    out = []
    for name, match in rules:
        picks = [r for r in rows if match(r.get("confidence"))]
        correct = sum(1 for r in picks if r.get("outcome") == "correct")
        total = len(picks)
        out.append({
            "bucket": name,
            "total": total,
            "correct": correct,
            "pct": round(correct / total * 100, 1) if total else None,
        })
    return out


def _top_users() -> list:
    supabase = get_supabase()
    rows = (
        supabase.table("leaderboard")
        .select("user_id, username, display_name, correct, total_predictions, accuracy_pct, rank")
        .gt("total_predictions", 0)
        .order("rank_score", desc=True)
        .limit(3)
        .execute()
    ).data or []
    return [
        {
            "username": r.get("username") or r.get("user_id"),
            "display_name": r.get("display_name"),
            "correct": r.get("correct", 0),
            "total": r.get("total_predictions", 0),
            "accuracy": r.get("accuracy_pct", 0),
        }
        for r in rows
    ]


def _agent_lessons() -> list:
    """Recall from the Vela project agent's Walrus Memory (scorecards).

    Best-effort: agent memory being unavailable must not trip the endpoint.
    """
    base = (os.environ.get("AGENTMEM_URL") or "http://localhost:3000/api/agentmem").rstrip("/")
    payload = json.dumps({
        "op": "recall",
        "query": "scorecard prediction correct incorrect result",
        "limit": 6,
    }).encode("utf-8")
    req = urllib.request.Request(
        base,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = json.loads(resp.read().decode("utf-8") or "{}")
        results = (body or {}).get("results") or []
        return [{"text": r.get("text", "")} for r in results if r.get("text")]
    except Exception as e:
        print(f"[credibility] agent recall unavailable: {e}")
        return []


async def _build():
    supabase = get_supabase()
    try:
        lb = (
            supabase.table("predictions")
            .select("id", count="exact")
            .eq("resolved", True)
            .execute()
        )
        resolved_total = lb.count if lb.count is not None else None
    except Exception:
        resolved_total = None

    try:
        buckets = _buckets()
    except Exception as e:
        print(f"[credibility] buckets failed: {e}")
        buckets = {"error": str(e)}
        buckets = []

    try:
        top = _top_users()
    except Exception as e:
        print(f"[credibility] top users failed: {e}")
        top = []

    # Agent memory recall runs off the event loop (plain urllib).
    lessons = await asyncio.to_thread(_agent_lessons)

    return {
        "resolved_total": resolved_total,
        "by_confidence": buckets,
        "top_users": top,
        "agent_memories": lessons,
    }


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        options(self)

    def do_GET(self):
        try:
            result = asyncio.run(_build())
            send_json(self, 200, result)
        except Exception as e:
            send_json(self, 500, {"error": str(e)})
