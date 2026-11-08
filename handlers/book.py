"""People Book-style memory calls.

The browser never holds a delegate private key. It asks for this app's public
key, and the wallet grants that key with the MemWal SDK. Reads and writes are
signed here, with the same key, against the user's own account.
"""

import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse

from lib.common import (
    agentmem_headers,
    agentmem_request_url,
    get_auth_email,
    get_supabase,
    read_json_body,
    send_json,
)


def _agentmem(payload: dict) -> tuple[int, dict]:
    req = urllib.request.Request(
        agentmem_request_url(),
        data=json.dumps(payload).encode("utf-8"),
        headers=agentmem_headers(),
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8") or "{}"
            return resp.status, json.loads(raw)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8") or "{}"
        try:
            body = json.loads(raw)
        except json.JSONDecodeError:
            body = {"error": raw or exc.reason}
        return exc.code, body


def _owner_account(address: str) -> tuple[str | None, str | None]:
    supabase = get_supabase()
    res = (
        supabase.table("users")
        .select("memwal_account_id,email")
        .ilike("email", address)
        .limit(1)
        .execute()
    )
    row = (res.data or [None])[0]
    if not row:
        return None, None
    return row.get("memwal_account_id"), row.get("email") or address


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        from lib.common import options
        options(self)

    def do_GET(self):
        path = urlparse(self.path).path
        if path.rstrip("/") == "/api/book/status":
            address = get_auth_email(self)
            if not address:
                send_json(self, 401, {"error": "Sign in first"})
                return
            account_id, namespace = _owner_account(address)
            if not account_id:
                send_json(self, 200, {"accountId": None, "hasDelegate": False})
                return
            status, body = _agentmem({
                "op": "userStatus", "accountId": account_id, "namespace": namespace,
            })
            send_json(self, status, {**body, "accountId": account_id})
            return
        if path.rstrip("/") == "/api/book/deployment":
            server_url = os.environ.get("MEMWAL_SERVER_URL", "https://relayer.memory.walrus.xyz").rstrip("/")
            try:
                with urllib.request.urlopen(f"{server_url}/config", timeout=10) as resp:
                    config = json.loads(resp.read())
                package_id = os.environ.get("MEMWAL_PACKAGE_ID") or config.get("packageId")
                registry_id = os.environ.get("MEMWAL_REGISTRY_ID") or os.environ.get("VITE_MEMWAL_REGISTRY_ID")
                if not package_id or not registry_id:
                    raise ValueError("Set MEMWAL_REGISTRY_ID and ensure the relayer reports packageId")
                send_json(self, 200, {"packageId": package_id, "registryId": registry_id})
            except (OSError, ValueError) as exc:
                send_json(self, 503, {"error": f"Memory deployment unavailable: {exc}"})
            return
        if path.rstrip("/") != "/api/book/delegate-key":
            send_json(self, 404, {"error": "Not found"})
            return
        status, body = _agentmem({"op": "delegatePublic"})
        if status >= 400:
            send_json(self, status, body)
            return
        send_json(self, 200, {"publicKey": body.get("publicKey")})

    def do_POST(self):
        path = urlparse(self.path).path.rstrip("/")
        address = get_auth_email(self)
        body = read_json_body(self) or {}
        if path == "/api/book/remember":
            if not address:
                send_json(self, 401, {"error": "Sign in first"})
                return
            account_id, namespace = _owner_account(address)
            if not account_id:
                send_json(self, 400, {"error": "Authorize memory before writing"})
                return
            status, result = _agentmem(
                {
                    "op": "userRemember",
                    "accountId": account_id,
                    "namespace": namespace,
                    "text": body.get("text") or "",
                }
            )
            send_json(self, status, result)
            return

        if path == "/api/book/recall":
            account_id = None
            namespace = None
            username = (body.get("username") or "").strip().lower()
            if username:
                supabase = get_supabase()
                res = (
                    supabase.table("users")
                    .select("memwal_account_id,email,memory_public")
                    .eq("username", username)
                    .limit(1)
                    .execute()
                )
                row = (res.data or [None])[0]
                if not row or not row.get("memory_public") or not row.get("memwal_account_id"):
                    send_json(self, 404, {"error": "That book is not public"})
                    return
                account_id = row["memwal_account_id"]
                namespace = row.get("email")
            else:
                if not address:
                    send_json(self, 401, {"error": "Sign in first"})
                    return
                account_id, namespace = _owner_account(address)
                if not account_id:
                    send_json(self, 400, {"error": "Authorize memory before reading"})
                    return
            status, result = _agentmem(
                {
                    "op": "userRecall",
                    "accountId": account_id,
                    "namespace": namespace,
                    "query": body.get("query") or "",
                    "limit": body.get("limit") or 10,
                }
            )
            send_json(self, status, result)
            return

        send_json(self, 404, {"error": "Not found"})
