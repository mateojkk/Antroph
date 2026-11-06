"""GET /api/journey?username=newjersey

Returns a day-by-day timeline of the user's prediction and chat history,
sourced from Supabase (predictions.created_at + chat_messages.created_at).
No Walrus dependency — this is the timestamped layer Walrus recall lacks.

Response:
{
  "days": [
    {
      "date": "2026-06-15",
      "day_number": 1,
      "predictions": [{...}],
      "chats": [{...}],
      "accuracy_so_far": {"correct": 0, "total": 0, "pct": 0.0}
    },
    ...
  ],
  "summary": {
    "first_day": "2026-06-15",
    "last_day": "2026-06-23",
    "total_days": 9,
    "first_prediction": {...} | null,
    "latest_prediction": {...} | null,
    "accuracy_then": 0.0,
    "accuracy_now": 0.0
  }
}
"""

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timezone

from lib.common import get_supabase, send_json
from handlers.profile import _select_user, _select_predictions


def _select_all_predictions(supabase, user_id: str) -> list[dict]:
    """Fetch ALL predictions for the user, ordered oldest first."""
    full_cols = (
        "id, type, external_id, user_pick, confidence, home_team, away_team, "
        "question, take, resolved, outcome, created_at"
    )
    basic_cols = "id, type, external_id, user_pick, resolved, outcome, created_at"
    try:
        r = (
            supabase.table("predictions")
            .select(full_cols)
            .eq("user_id", user_id)
            .order("created_at", desc=False)
            .limit(500)
            .execute()
        )
        return r.data or []
    except Exception as e:
        msg = str(e)
        missing = any(
            col in msg
            for col in ("home_team", "away_team", "question", "take", "confidence")
        )
        if missing and "42703" in msg:
            r = (
                supabase.table("predictions")
                .select(basic_cols)
                .eq("user_id", user_id)
                .order("created_at", desc=False)
                .limit(500)
                .execute()
            )
            rows = r.data or []
            for row in rows:
                row.setdefault("home_team", None)
                row.setdefault("away_team", None)
                row.setdefault("question", None)
                row.setdefault("take", None)
                row.setdefault("confidence", 5)
            return rows
        raise


def _select_all_chats(supabase, user_id: str) -> list[dict]:
    """Fetch all chat messages across all sessions, ordered oldest first."""
    try:
        sessions = (
            supabase.table("chat_sessions")
            .select("id")
            .eq("user_id", user_id)
            .execute()
        )
        session_ids = [s["id"] for s in (sessions.data or [])]
        if not session_ids:
            return []
        msgs = (
            supabase.table("chat_messages")
            .select("session_id, role, content, created_at")
            .in_("session_id", session_ids)
            .order("created_at", desc=False)
            .limit(500)
            .execute()
        )
        return msgs.data or []
    except Exception as e:
        print(f"[journey] chat fetch failed: {e}")
        return []


def _date_key(iso: str) -> str:
    """Extract YYYY-MM-DD from an ISO timestamp."""
    if not iso:
        return ""
    try:
        return iso[:10]
    except Exception:
        return ""


def _build_timeline(predictions: list[dict], chats: list[dict]) -> dict:
    """Group predictions and chats by day, compute running accuracy."""
    by_day: dict[str, dict] = {}

    for p in predictions:
        dk = _date_key(p.get("created_at", ""))
        if not dk:
            continue
        if dk not in by_day:
            by_day[dk] = {"date": dk, "predictions": [], "chats": []}
        by_day[dk]["predictions"].append({
            "pick": p.get("user_pick", ""),
            "home_team": p.get("home_team"),
            "away_team": p.get("away_team"),
            "question": p.get("question"),
            "confidence": p.get("confidence", 5),
            "take": p.get("take"),
            "resolved": p.get("resolved", False),
            "outcome": p.get("outcome"),
            "created_at": p.get("created_at", ""),
        })

    for c in chats:
        dk = _date_key(c.get("created_at", ""))
        if not dk:
            continue
        if dk not in by_day:
            by_day[dk] = {"date": dk, "predictions": [], "chats": []}
        by_day[dk]["chats"].append({
            "role": c.get("role", ""),
            "content": c.get("content", ""),
            "created_at": c.get("created_at", ""),
        })

    days = sorted(by_day.values(), key=lambda d: d["date"])

    # Compute running accuracy after each day
    correct = 0
    total = 0
    first_date = days[0]["date"] if days else ""
    for d in days:
        for p in d["predictions"]:
            if p["resolved"]:
                total += 1
                if p["outcome"] == "correct":
                    correct += 1
        d["accuracy_so_far"] = {
            "correct": correct,
            "total": total,
            "pct": round((correct / total * 100) if total else 0, 1),
        }
        d["day_number"] = (
            (datetime.strptime(d["date"], "%Y-%m-%d").date()
             - datetime.strptime(first_date, "%Y-%m-%d").date()).days + 1
            if first_date else 1
        )

    # Summary: first vs latest
    first_pred = predictions[0] if predictions else None
    latest_pred = predictions[-1] if predictions else None

    # Accuracy at end of day 1 vs now
    day1_correct = 0
    day1_total = 0
    if days:
        day1_correct = days[0]["accuracy_so_far"]["correct"]
        day1_total = days[0]["accuracy_so_far"]["total"]
    now_correct = days[-1]["accuracy_so_far"]["correct"] if days else 0
    now_total = days[-1]["accuracy_so_far"]["total"] if days else 0

    def _pred_summary(p):
        if not p:
            return None
        return {
            "pick": p.get("user_pick", ""),
            "home_team": p.get("home_team"),
            "away_team": p.get("away_team"),
            "question": p.get("question"),
            "confidence": p.get("confidence", 5),
            "take": p.get("take"),
            "outcome": p.get("outcome"),
            "created_at": p.get("created_at", ""),
        }

    summary = {
        "first_day": first_date,
        "last_day": days[-1]["date"] if days else "",
        "total_days": len(days),
        "total_predictions": len(predictions),
        "total_chats": len(chats),
        "first_prediction": _pred_summary(first_pred),
        "latest_prediction": _pred_summary(latest_pred),
        "accuracy_then": round((day1_correct / day1_total * 100) if day1_total else 0, 1),
        "accuracy_now": round((now_correct / now_total * 100) if now_total else 0, 1),
    }

    return {"days": days, "summary": summary}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        username = (params.get("username", [None])[0] or "").strip().lower()

        if not username:
            send_json(self, 400, {"error": "Missing username"})
            return

        try:
            supabase = get_supabase()
            user = _select_user(supabase, by_username=username)
            if not user:
                send_json(self, 404, {"error": "User not found"})
                return

            preds = _select_all_predictions(supabase, user["id"])
            chats = _select_all_chats(supabase, user["id"])
            result = _build_timeline(preds, chats)
            send_json(self, 200, result)
        except Exception as e:
            print(f"[journey] error: {e}")
            send_json(self, 500, {"error": str(e)})
