"""Streaming agent endpoint — /api/agent_stream.

This is a dedicated Vercel Function (separate from api/index.py) so it can
write SSE chunks directly without going through the buffering _FakeSocket
dispatcher.

Protocol: text/event-stream, one chunk per Groq token.
  data: {"delta": "token text"}\n\n
  ...
  data: {"session_id": "…", "title": "…", "done": true}\n\n
"""

import os
import sys
import json
import uuid
import asyncio
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

from lib.common import (
    get_supabase,
    get_groq,
    require_auth_email,
    read_json_body,
    options,
    normalize_address,
)
from handlers.agent import (
    SYSTEM_PROMPT,
    build_context,
    auto_title,
    llm_settings,
    _session_exists,
)


def _sse(data: dict) -> bytes:
    return f"data: {json.dumps(data)}\n\n".encode()


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        options(self)

    def do_POST(self):
        body = read_json_body(self)
        if body is None:
            self._error(400, "Invalid JSON body")
            return

        user_email = normalize_address(body.get("user_email"))
        message = (body.get("message") or "").strip()
        session_id = body.get("session_id") or ""
        session_id = session_id.strip() if isinstance(session_id, str) else None
        client_history = body.get("conversation_history") or []
        memory_context = body.get("memory_context") or None

        if not user_email or not message:
            self._error(400, "Missing user_email or message")
            return

        verified = require_auth_email(self, user_email)
        if not verified:
            return

        try:
            asyncio.run(
                self._stream(user_email, message, session_id, client_history, memory_context)
            )
        except Exception as exc:
            print(f"[agent_stream] unhandled: {exc!r}")
            # Headers may already be sent; try sending an error event.
            try:
                self.wfile.write(_sse({"error": "Something went wrong. Try again?", "done": True}))
                self.wfile.flush()
            except Exception:
                pass

    async def _stream(
        self,
        user_email: str,
        message: str,
        session_id: str | None,
        client_history: list,
        memory_context: dict | None,
    ):
        supabase = get_supabase()

        # Resolve user.
        from lib.common import find_user_id
        user_id = find_user_id(supabase, user_email)
        if not user_id:
            self._error(404, "User not found")
            return

        # Session bookkeeping and the prompt context are independent.
        # The browser already sent the recent turns, so skip the history read.
        async def resolve_session():
            def _resolve():
                sid = session_id
                title = None
                if sid and not _session_exists(supabase, sid, user_id):
                    sid = None
                if not sid:
                    sid = str(uuid.uuid4())
                    title = auto_title(message)
                    supabase.table("chat_sessions").insert(
                        {"id": sid, "user_id": user_id, "title": title}
                    ).execute()
                return sid, title

            return await asyncio.to_thread(_resolve)

        async def load_context():
            try:
                return await build_context(
                    memory_context,
                    user_email,
                    (client_history or [])[-10:],
                    user_id=user_id,
                )
            except Exception as ctx_err:
                print(f"[agent_stream] context build failed: {ctx_err!r}")
                return (
                    f"The user is authenticated as {user_email}. "
                    "No additional context could be loaded."
                )

        (session_id, title), context_block = await asyncio.gather(
            resolve_session(),
            load_context(),
        )

        groq = get_groq()

        # Start SSE response headers.
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization, X-User-Email, X-Sui-Address",
        )
        self.end_headers()

        reply_parts: list[str] = []

        try:
            stream = await asyncio.to_thread(
                groq.chat.completions.create,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT + "\n\n" + context_block},
                    {"role": "user", "content": message},
                ],
                stream=True,
                **llm_settings(),
            )

            for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    reply_parts.append(delta)
                    self.wfile.write(_sse({"delta": delta}))
                    self.wfile.flush()

        except Exception as groq_err:
            print(f"[agent_stream] groq failed: {groq_err!r}")
            fallback = "Sorry, I lost my train of thought. Try again?"
            self.wfile.write(_sse({"delta": fallback}))
            reply_parts.append(fallback)

        reply = "".join(reply_parts).strip()
        if not reply:
            reply = "I zoned out for a second. Say that again?"
            self.wfile.write(_sse({"delta": reply}))
            self.wfile.flush()

        # Send done event with session metadata.
        self.wfile.write(_sse({"session_id": session_id, "title": title, "done": True}))
        self.wfile.flush()

        # Persist to DB (non-fatal, happens after stream is complete).
        try:
            now = datetime.now(timezone.utc)
            supabase.table("chat_messages").insert({
                "id": f"msg_{uuid.uuid4().hex[:12]}",
                "session_id": session_id,
                "role": "user",
                "content": message.strip(),
            }).execute()
            supabase.table("chat_messages").insert({
                "id": f"msg_{uuid.uuid4().hex[:12]}",
                "session_id": session_id,
                "role": "assistant",
                "content": reply,
            }).execute()
            supabase.table("chat_sessions").update(
                {"updated_at": now.isoformat()}
            ).eq("id", session_id).execute()
        except Exception as db_err:
            print(f"[agent_stream] db persist failed: {db_err!r}")

    def _error(self, status: int, message: str):
        body = json.dumps({"error": message}).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
