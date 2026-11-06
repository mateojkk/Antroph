"""MemWal reverse-proxy handler.

The Walrus Memory relayer (https://relayer.memory.walrus.xyz) does not return
an Access-Control-Allow-Origin header on its CORS preflight responses, which
causes browsers to block every request from the Vela frontend with
"Failed to fetch".

This handler proxies /api/memwal/* to the upstream relayer server-side, where
there is no same-origin restriction.  The browser talks to /api/memwal (same
origin as the app) and this handler forwards the signed MemWal headers
unchanged so the relayer can still verify the request.
"""

import os
import json
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse

from lib.common import options as cors_options

# MemWal auth / signing headers forwarded verbatim to the upstream relayer.
_FORWARD_HEADERS = {
    "content-type",
    "x-public-key",
    "x-signature",
    "x-timestamp",
    "x-nonce",
    "x-account-id",
    "x-delegate-key",
    "x-seal-session",
    "x-memwal-account-id",
    "x-memwal-namespace",
}

_UPSTREAM = (os.environ.get("MEMWAL_SERVER_URL") or "https://relayer.memory.walrus.xyz").rstrip("/")


def _proxy(handler: BaseHTTPRequestHandler, method: str):
    """Forward the request to the upstream MemWal relayer and stream the response back."""
    # Strip /api/memwal prefix to get the upstream path.
    parsed = urlparse(handler.path)
    prefix = "/api/memwal"
    upstream_path = parsed.path[len(prefix):] or "/"
    if parsed.query:
        upstream_path += "?" + parsed.query

    upstream_url = _UPSTREAM + upstream_path

    # Read request body.
    body = b""
    if method in ("POST", "PATCH", "PUT"):
        length = int(handler.headers.get("Content-Length", 0))
        if length:
            body = handler.rfile.read(length)

    # Build upstream request with forwarded MemWal headers.
    req = urllib.request.Request(upstream_url, data=body or None, method=method)
    for key, val in handler.headers.items():
        if key.lower() in _FORWARD_HEADERS:
            req.add_header(key, val)
    if body and "Content-Type" not in req.headers:
        req.add_header("Content-Type", "application/json")

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp_body = resp.read()
            status = resp.status
            content_type = resp.headers.get("Content-Type", "application/json")
    except urllib.error.HTTPError as e:
        resp_body = e.read()
        status = e.code
        content_type = e.headers.get("Content-Type", "application/json")
    except Exception as e:
        handler.send_response(502)
        handler.send_header("Access-Control-Allow-Origin", "*")
        handler.send_header("Content-Type", "application/json")
        handler.end_headers()
        handler.wfile.write(json.dumps({"error": f"Upstream error: {str(e)}"}).encode())
        return

    handler.send_response(status)
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header(
        "Access-Control-Allow-Headers",
        "Content-Type, x-public-key, x-signature, x-timestamp, x-nonce, "
        "x-account-id, x-delegate-key, x-seal-session, x-memwal-account-id, x-memwal-namespace",
    )
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(resp_body)))
    handler.end_headers()
    handler.wfile.write(resp_body)


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        cors_options(self)

    def do_GET(self):
        _proxy(self, "GET")

    def do_POST(self):
        _proxy(self, "POST")
