"""
POST /api/chat
  body: { action: "create", title?: string }
  → 201 { session_id, title }

  body: { action: "rename", session_id, title }
  → 200 { status: "ok" }

GET /api/chat
  → 200 { sessions: [...] } — user's sessions, newest first

GET /api/chat?session=<id>
  → 200 { session, messages } — full session + ordered messages
"""

import uuid
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from lib.common import get_supabase, send_json, read_json_body, get_auth_email, options, normalize_address, find_user_id


def _user_id(supabase, email: str) -> str | None:
    return find_user_id(supabase, email)


def _auto_title(text: str | None) -> str:
    if not text:
        return "New chat"
    t = str(text).strip().replace("\n", " ")
    if len(t) > 40:
        t = t[:37].rstrip() + "..."
    return t or "New chat"


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        options(self)

    def do_GET(self):
        email = get_auth_email(self)
        if not email:
            send_json(self, 401, {"error": "Unauthorized"})
            return

        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        session_id = params.get("session", [None])[0]

        supabase = get_supabase()
        user_id = _user_id(supabase, email)
        if not user_id:
            send_json(self, 200, {"sessions": []} if not session_id else {"error": "User not found"})
            return

        if session_id:
            session = (
                supabase.table("chat_sessions")
                .select("*")
                .eq("id", session_id)
                .eq("user_id", user_id)
                .execute()
            )
            if not session.data:
                send_json(self, 404, {"error": "Session not found"})
                return
            messages = (
                supabase.table("chat_messages")
                .select("*")
                .eq("session_id", session_id)
                .order("created_at")
                .execute()
            )
            send_json(self, 200, {
                "session": session.data[0],
                "messages": messages.data or [],
            })
            return

        sessions = (
            supabase.table("chat_sessions")
            .select("*")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .limit(50)
            .execute()
        )
        send_json(self, 200, {"sessions": sessions.data or []})

    def do_POST(self):
        email = get_auth_email(self)
        if not email:
            send_json(self, 401, {"error": "Unauthorized"})
            return

        body = read_json_body(self)
        if body is None:
            send_json(self, 400, {"error": "Invalid JSON body"})
            return

        action = body.get("action", "create")
        supabase = get_supabase()
        user_id = _user_id(supabase, email)
        if not user_id:
            send_json(self, 404, {"error": "User not found"})
            return

        if action == "create":
            title = body.get("title", "New chat")
            if isinstance(title, str) and len(title) > 60:
                title = title[:57] + "..."
            session_id = str(uuid.uuid4())
            supabase.table("chat_sessions").insert({
                "id": session_id,
                "user_id": user_id,
                "title": title,
            }).execute()
            send_json(self, 201, {"session_id": session_id, "title": title})
            return

        if action == "rename":
            session_id = body.get("session_id", "").strip()
            title = body.get("title", "").strip() or "New chat"
            if not session_id:
                send_json(self, 400, {"error": "Missing session_id"})
                return
            existing = (
                supabase.table("chat_sessions")
                .select("id")
                .eq("id", session_id)
                .eq("user_id", user_id)
                .execute()
            )
            if not existing.data:
                send_json(self, 404, {"error": "Session not found"})
                return
            supabase.table("chat_sessions").update({"title": title}).eq("id", session_id).execute()
            send_json(self, 200, {"status": "ok", "title": title})
            return

        send_json(self, 400, {"error": f"Unknown action: {action}"})


def auto_title(text: str) -> str:
    return _auto_title(text)
