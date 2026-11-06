"""
GET /api/react?email=<user>

Returns the user's recently resolved predictions so the Chat page
can show a "how did you do?" panel with Vela's commentary.
"""

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from lib.common import get_supabase, get_groq, send_json, require_auth_email, normalize_address, find_user_id


class handler(BaseHTTPRequestHandler):
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
            supabase = get_supabase()
            user_id = find_user_id(supabase, user_email)
            if not user_id:
                send_json(self, 200, {"results": [], "user_predictions": [], "vela_commentary": ""})
                return
            user_result = supabase.table("users").select("id, username").eq("id", user_id).execute()
            user = user_result.data[0] if user_result.data else None
            if not user:
                send_json(self, 200, {"results": [], "user_predictions": [], "vela_commentary": ""})
                return
            username = user["username"]

            preds = (
                supabase.table("predictions")
                .select("id, type, external_id, user_pick, outcome, question, home_team, away_team, created_at")
                .eq("user_id", user_id)
                .eq("resolved", True)
                .order("created_at", desc=True)
                .limit(10)
                .execute()
            )
            resolved = preds.data or []

            results = [
                {
                    "id": p["id"],
                    "pick": p.get("user_pick", ""),
                    "outcome": p.get("outcome", ""),
                    "question": p.get("question") or f"{p.get('home_team', '')} vs {p.get('away_team', '')}",
                }
                for p in resolved
            ]

            correct = sum(1 for p in resolved if p.get("outcome") == "correct")
            total = len(resolved)

            commentary = ""
            if total > 0 and correct == total:
                commentary = f"Perfect record on your last {total}. I hate to admit it, but you're on fire, @{username}."
            elif total > 0 and correct == 0:
                commentary = f"0 for {total}. That's impressively bad, @{username}. Even a coin flip would've done better."
            elif total > 0:
                pct = round(correct / total * 100)
                commentary = f"{correct}/{total} correct ({pct}%). Not bad, @{username}, but I'm still ahead."

            send_json(self, 200, {
                "results": results,
                "user_predictions": resolved,
                "vela_commentary": commentary,
            })
        except Exception as e:
            send_json(self, 500, {"error": str(e)})
