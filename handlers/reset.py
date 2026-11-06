"""
POST /api/reset
Body: { "email": "<user email>", "confirm": true }

Wipes the user's chat history, predictions, and leaderboard record.
The user record (username, display_name, avatar_url) is preserved.
Returns a summary of what was deleted.
"""

from http.server import BaseHTTPRequestHandler

from lib.common import (
    get_supabase,
    send_json,
    require_auth_email,
    read_json_body,
    options,
    normalize_address,
    find_user_id,
)


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        options(self)

    def do_POST(self):
        body = read_json_body(self)
        if body is None:
            send_json(self, 400, {"error": "Invalid JSON body"})
            return

        email = normalize_address(body.get("email"))
        if not email:
            send_json(self, 400, {"error": "Missing email"})
            return

        if not body.get("confirm"):
            send_json(self, 400, {"error": "Confirmation required"})
            return

        verified = require_auth_email(self, email)
        if not verified:
            return

        supabase = get_supabase()
        try:
            user_id = find_user_id(supabase, email)
            if not user_id:
                send_json(self, 404, {"error": "User not found"})
                return
            user_result = supabase.table("users").select("id, username").eq("id", user_id).execute()
            user = user_result.data[0] if user_result.data else None
            if not user:
                send_json(self, 404, {"error": "User not found"})
                return
            username = user["username"]

            # 1. Delete all chat sessions (cascades to chat_messages)
            sessions = supabase.table("chat_sessions").select("id").eq("user_id", user_id).execute()
            sessions_count = len(sessions.data or [])
            if sessions_count > 0:
                supabase.table("chat_sessions").delete().eq("user_id", user_id).execute()

            # 2. Delete all predictions
            preds = supabase.table("predictions").select("id", count="exact").eq("user_id", user_id).execute()
            preds_count = len(preds.data or [])
            if preds_count > 0:
                supabase.table("predictions").delete().eq("user_id", user_id).execute()

            # 3. Reset leaderboard record
            supabase.table("leaderboard").update({
                "accuracy_pct": 0,
                "total_predictions": 0,
                "correct": 0,
                "rank": 999,
            }).eq("user_id", user_id).execute()

            send_json(self, 200, {
                "status": "reset",
                "deleted": {
                    "chat_sessions": sessions_count,
                    "predictions": preds_count,
                },
                "preserved": {
                    "user": {"id": user_id, "username": username},
                },
                "note": "Local data cleared. Walrus Memory blobs remain on-chain (immutable).",
            })
        except Exception as e:
            send_json(self, 500, {"error": str(e)})
