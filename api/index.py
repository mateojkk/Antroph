"""Single Vercel Function entry point for all /api/* routes.

The Hobby plan limits deployments to 12 Serverless Functions, but this project
has more API endpoints. This module bundles every endpoint into one function:
Vercel invokes api/index.py for all /api/* requests, and we dispatch to the
existing BaseHTTPRequestHandler classes defined in the sibling modules.

Vercel's /api/*.py convention requires a top-level class named `handler` that
inherits from BaseHTTPRequestHandler, so this file exposes that rather than a
function-based handler.
"""

import os
import sys
import json
from io import BytesIO
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse

# Ensure project root is on sys.path so we can import handlers/ and lib/.
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

# Static imports guarantee Vercel bundles every handler file into this function.
from handlers import agent
from handlers import brief
from handlers import called_it
from handlers import chat
from handlers import health
from handlers import journey
from handlers import leaderboard
from handlers import markets
from handlers import memwal
from handlers import og
from handlers import predict
from handlers import profile
from handlers import react
from handlers import reset
from handlers import resolve
from handlers import livescores
from handlers import sui
from handlers import tatum
from handlers import credibility


HANDLERS = {
    "agent": agent.handler,
    "brief": brief.handler,
    "called_it": called_it.handler,
    "chat": chat.handler,
    "credibility": credibility.handler,
    "health": health.handler,
    "journey": journey.handler,
    "leaderboard": leaderboard.handler,
    "markets": markets.handler,
    "memwal": memwal.handler,
    "og": og.handler,
    "predict": predict.handler,
    "profile": profile.handler,
    "react": react.handler,
    "reset": reset.handler,
    "resolve": resolve.handler,
    "livescores": livescores.handler,
    "sui": sui.handler,
    "tatum": tatum.handler,
}


class _FakeSocket:
    """Minimal socket-like object for BaseHTTPRequestHandler.

    All output (headers via wfile, body via wfile) goes to a single stream
    so we can capture the full HTTP response cleanly.
    """

    def __init__(self, data=b""):
        self._input = BytesIO(data)
        self._output = BytesIO()

    def makefile(self, mode, *args, **kwargs):
        if "w" in mode:
            return self._output
        return self._input

    def sendall(self, data):
        self._output.write(data)


class handler(BaseHTTPRequestHandler):
    def _read_body(self) -> bytes:
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return b""
        return self.rfile.read(length)

    def _build_request_bytes(self, method: str, path: str, headers, body: bytes) -> bytes:
        request_line = f"{method} {path} HTTP/1.1\r\n".encode()
        header_bytes = b"Host: localhost\r\n"
        for key, value in headers.items():
            header_bytes += f"{key}: {value}\r\n".encode()
        if body:
            header_bytes += f"Content-Length: {len(body)}\r\n".encode()
            if "content-type" not in {k.lower() for k in headers}:
                header_bytes += b"Content-Type: application/json\r\n"
        header_bytes += b"\r\n"
        return request_line + header_bytes + body

    def _parse_response(self, raw_response: bytes):
        status_code = 200
        response_headers = {}
        response_body = ""

        header_end = raw_response.find(b"\r\n\r\n")
        if header_end != -1:
            header_part = raw_response[:header_end].decode("utf-8", errors="replace")
            body_part = raw_response[header_end + 4 :].decode("utf-8", errors="replace")

            lines = header_part.split("\r\n")
            if lines:
                status_line = lines[0]
                parts = status_line.split(" ", 2)
                if len(parts) >= 2:
                    try:
                        status_code = int(parts[1])
                    except ValueError:
                        pass
                for line in lines[1:]:
                    if ":" in line:
                        key, val = line.split(":", 1)
                        response_headers[key.strip()] = val.strip()
            response_body = body_part
        else:
            response_body = raw_response.decode("utf-8", errors="replace")

        return status_code, response_headers, response_body

    def _dispatch(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if not path.startswith("/api/"):
            self.send_response(404)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error": "Not found"}')
            return

        handler_name = path[len("/api/") :].split("/")[0]
        handler_class = HANDLERS.get(handler_name)
        if not handler_class:
            self.send_response(404)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                json.dumps({"error": f"Unknown endpoint: {handler_name}"}).encode()
            )
            return

        # Reconstruct the request path as the downstream handlers expect it,
        # e.g. /api/health or /api/chat?session=123.
        request_path = parsed.path
        if parsed.query:
            request_path += "?" + parsed.query

        headers = {key: self.headers.get(key) for key in self.headers.keys()}
        body = self._read_body()

        raw_request = self._build_request_bytes(
            self.command, request_path, headers, body
        )

        fake_socket = _FakeSocket(raw_request)
        try:
            handler_class(fake_socket, self.client_address, self.server)
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                json.dumps({"error": f"Handler error: {str(e)}"}).encode()
            )
            return

        status_code, response_headers, response_body = self._parse_response(
            fake_socket._output.getvalue()
        )

        self.send_response(status_code)
        for key, value in response_headers.items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(response_body.encode("utf-8"))

    def do_OPTIONS(self):
        self._dispatch()

    def do_GET(self):
        self._dispatch()

    def do_POST(self):
        self._dispatch()

    def do_PATCH(self):
        self._dispatch()
