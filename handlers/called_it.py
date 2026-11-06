from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from lib.common import get_supabase, send_json, require_auth_email, options, normalize_address, find_user_id


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        options(self)

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        user_email = normalize_address(params.get("email", [None])[0])
        pred_id = params.get("pred_id", [None])[0]

        if not user_email:
            send_json(self, 400, {"error": "Missing email"})
            return

        verified = require_auth_email(self, user_email)
        if not verified:
            return

        supabase = get_supabase()

        try:
            user_id = find_user_id(supabase, user_email)
            if not user_id:
                send_json(self, 404, {"error": "User not found"})
                return
            user_result = supabase.table("users").select("id, username").eq("id", user_id).execute()
            if not user_result.data:
                send_json(self, 404, {"error": "User not found"})
                return
            username = user_result.data[0]["username"]

            query = (
                supabase.table("predictions")
                .select("*")
                .eq("user_id", user_id)
                .eq("outcome", "correct")
                .order("created_at", desc=True)
            )

            if pred_id:
                query = query.eq("id", pred_id)

            preds = query.limit(5).execute()

            cards = []
            for p in preds.data:
                cards.append({
                    "id": p["id"],
                    "user_pick": p["user_pick"],
                    "type": p["type"],
                    "confidence": p.get("confidence", 5),
                    "created_at": p["created_at"],
                    "username": username,
                })

            lb = supabase.table("leaderboard").select("*").eq("user_id", user_id).execute()
            record = lb.data[0] if lb.data else None

            send_json(self, 200, {
                "cards": cards,
                "record": {
                    "correct": record["correct"] if record else 0,
                    "total": record["total_predictions"] if record else 0,
                    "accuracy": record["accuracy_pct"] if record else 0,
                } if record else None,
            })

        except Exception as e:
            send_json(self, 500, {"error": str(e)})
