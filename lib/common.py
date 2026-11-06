"""Shared helpers for Vela Python API handlers.

Avoids module-level client creation (which crashes imports when .env is empty)
and centralizes auth/CORS/body parsing so every endpoint behaves consistently.
"""

import os
import json
from functools import lru_cache
from http.server import BaseHTTPRequestHandler

from supabase import create_client, Client
from groq import Groq


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )


@lru_cache(maxsize=1)
def get_groq() -> Groq:
    return Groq(api_key=os.environ["GROQ_API_KEY"])


def send_json(
    handler: BaseHTTPRequestHandler,
    status: int,
    payload: dict,
    cors: bool = True,
):
    body = json.dumps(payload).encode()
    handler.send_response(status)
    if cors:
        handler.send_header("Access-Control-Allow-Origin", "*")
        handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        handler.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization, X-User-Email, X-Sui-Address",
        )
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def read_json_body(handler: BaseHTTPRequestHandler) -> dict | None:
    length = int(handler.headers.get("Content-Length", 0))
    if length == 0:
        return None
    try:
        return json.loads(handler.rfile.read(length))
    except json.JSONDecodeError:
        return None


def normalize_address(value: str | None) -> str | None:
    """Normalize a Sui wallet address / legacy email identifier.

    Sui addresses are case-insensitive, but Postgres `text` comparisons are not.
    We lowercase and strip so lookups work regardless of how the wallet casing
    was stored originally.
    """
    if not value:
        return None
    cleaned = str(value).strip().lower()
    return cleaned or None


def address_variants(address: str | None) -> list[str]:
    """Return possible casings/prefix variants of a Sui address for lookup.

    Handles legacy rows stored with or without the 0x prefix and mixed case."""
    if not address:
        return []
    lower = address.lower().strip()
    variants = {lower}
    if lower.startswith("0x"):
        variants.add(lower[2:])
    else:
        variants.add(f"0x{lower}")
    return list(variants)


def find_user_id(supabase, email: str) -> str | None:
    """Look up a user id by email/wallet address, case-insensitively and
    across 0x-prefix variants."""
    variants = address_variants(email)
    if not variants:
        return None
    q = supabase.table("users").select("id")
    if len(variants) == 1:
        q = q.ilike("email", variants[0])
    else:
        q = q.or_(",".join(f"email.ilike.{v}" for v in variants))
    r = q.limit(1).execute()
    return r.data[0]["id"] if r.data else None


def get_auth_email(handler: BaseHTTPRequestHandler) -> str | None:
    raw = handler.headers.get("X-User-Email", "")
    if isinstance(raw, str):
        return normalize_address(raw)
    return None


def require_auth_email(
    handler: BaseHTTPRequestHandler,
    claimed_email: str | None = None,
) -> str | None:
    """Return the authenticated email, or send an error response and return None.

    If claimed_email is provided, the header must match it.
    """
    email = get_auth_email(handler)
    if not email:
        send_json(handler, 401, {"error": "Unauthorized"})
        return None
    if claimed_email is not None and email != normalize_address(claimed_email):
        send_json(handler, 403, {"error": "Email mismatch"})
        return None
    return email


def options(handler: BaseHTTPRequestHandler):
    handler.send_response(204)
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-User-Email, X-Sui-Address",
    )
    handler.end_headers()
