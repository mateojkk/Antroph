"""
GET /api/brief?email=<user>

Returns Vela's daily brief: today's matches, the user's record, and Vela's takes.
Matches are derived from the football-data.org v4 feed.
"""

import asyncio
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from lib.common import get_supabase, get_groq, send_json, require_auth_email, options, normalize_address, find_user_id


def get_todays_fixtures():
    """Get today's scheduled matches from football-data.org."""
    try:
        from lib.live_scores import get_upcoming_matches
        events = get_upcoming_matches()
        fixtures = []
        now_date = datetime.now(timezone.utc).date()
        for m in events:
            home = m.get("homeTeam", {}).get("name")
            away = m.get("awayTeam", {}).get("name")
            if not home or not away:
                continue
                
            kickoff = m.get("utcDate", "")
            if kickoff:
                try:
                    ts = datetime.fromisoformat(kickoff.replace("Z", "+00:00"))
                    if ts.date() != now_date:
                        continue
                except Exception:
                    continue
                    
            fixtures.append({
                "id": m.get("id", ""),
                "home": home,
                "away": away,
                "kickoff": kickoff,
                "status": m.get("status", "TIMED"),
                "group": "",
            })
        return fixtures
    except Exception:
        return []


async def _build_brief(user_email: str):
    supabase = get_supabase()
    groq = get_groq()

    fixtures = get_todays_fixtures()

    brief = {
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "matches": [],
        "vela_takes": [],
        "total_predictions": 0,
        "accuracy": 0,
        "rank": 0,
    }

    for m in fixtures:
        brief["matches"].append({
            "id": str(m["id"]),
            "home": m["home"],
            "away": m["away"],
            "kickoff": m.get("kickoff", ""),
            "group": m.get("group", ""),
            "status": m.get("status", ""),
        })

    user_id = find_user_id(supabase, user_email or "")
    if user_id:
        lb = supabase.table("leaderboard").select("*").eq("user_id", user_id).execute()
        if lb.data:
            record = lb.data[0]
            brief["total_predictions"] = record.get("total_predictions", 0)
            brief["accuracy"] = record.get("accuracy_pct", 0)
            brief["rank"] = record.get("rank", 0)

    if brief["matches"]:
        match_list = ", ".join(
            f"{m['home']} vs {m['away']}" for m in brief["matches"][:4]
        )

        history = (
            "No prediction history yet."
            if not brief["total_predictions"]
            else f"User has {brief['total_predictions']} predictions, {brief['accuracy']}% accuracy."
        )
        take_prompt = (
            f"Today's football has these matches: {match_list}. "
            f"{history} "
            f"You are Antroph, a football rival. Give 2-3 playful, friendly takes about today's matches. "
            f"Be specific — name teams, reference storylines. "
            f"Keep each take to 1 sentence. No intro, no outro."
        )
        try:
            response = groq.chat.completions.create(
                model=os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b"),
                messages=[{"role": "user", "content": take_prompt}],
                max_tokens=256,
                temperature=0.9,
            )
            takes_text = response.choices[0].message.content or ""
            lines = [t.strip() for t in takes_text.split("\n") if t.strip()]
            brief["vela_takes"] = [
                {"match": "all", "take": line}
                for line in lines[:3]
            ]
        except Exception as exc:
            print(f"[brief] groq call failed: {exc}")

    return brief


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        options(self)

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        user_email = normalize_address(params.get("email", [None])[0])

        if not user_email:
            send_json(self, 400, {"error": "email required"})
            return

        verified = require_auth_email(self, user_email)
        if not verified:
            return

        try:
            brief = asyncio.run(_build_brief(user_email))
            send_json(self, 200, brief)
        except Exception as e:
            send_json(self, 500, {"error": str(e)})
