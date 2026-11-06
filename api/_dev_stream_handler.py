#!/usr/bin/env python3
"""
Local dev streaming handler — loads a streaming API module, runs its handler,
and writes its output directly to stdout (which dev.mjs pipes to the HTTP response).

Unlike _dev_handler.py, this does NOT buffer the response — it lets the handler
write SSE chunks to its wfile (BytesIO) and flushes them to stdout in real time
by monkeypatching wfile.write to forward to sys.stdout.buffer immediately.

Usage: python3 _dev_stream_handler.py <script_path> <method> <query> <headers_json>
Body is read from stdin as raw bytes.
"""

import sys
import os
import io
import json
import importlib.util
from io import BytesIO
from http.server import BaseHTTPRequestHandler

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

# Load .env
_env_path = os.path.join(project_root, ".env")
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if not _line or _line.startswith("#"):
                continue
            _eq = _line.index("=") if "=" in _line else -1
            if _eq > 0:
                _val = _line[_eq + 1:].strip()
                if len(_val) >= 2 and _val[0] == _val[-1] and _val[0] in ('"', "'"):
                    _val = _val[1:-1]
                os.environ[_line[:_eq].strip()] = _val


class _StreamingSocket:
    """
    Fake socket that forwards wfile.write() calls directly to stdout in real time.
    The HTTP response line and headers written by BaseHTTPRequestHandler are swallowed
    (they would corrupt the SSE stream); only data written after end_headers() is forwarded.

    `output` is the real stdout buffer, captured before stdout is redirected. Writing
    through sys.stdout after that redirect hits a StringIO with no .buffer, and every
    token is dropped — the chat then shows an empty reply.
    """

    def __init__(self, output, data: bytes = b""):
        self._output = output
        self._input = BytesIO(data)
        self._headers_done = False
        self._header_buf = bytearray()

    def makefile(self, mode, *args, **kwargs):
        if "w" in mode:
            return _ForwardingWriter(self)
        return self._input

    def sendall(self, data: bytes):
        # sendall is used by BaseHTTPRequestHandler for the initial status line.
        self._absorb_headers(data)

    def _absorb_headers(self, data: bytes):
        """Buffer until we see the blank line ending the HTTP headers, then discard."""
        if self._headers_done:
            self._output.write(data)
            self._output.flush()
            return
        self._header_buf.extend(data)
        sep = self._header_buf.find(b"\r\n\r\n")
        if sep != -1:
            self._headers_done = True
            remainder = bytes(self._header_buf[sep + 4:])
            self._header_buf.clear()
            if remainder:
                self._output.write(remainder)
                self._output.flush()


class _ForwardingWriter(io.RawIOBase):
    """Wraps _StreamingSocket and forwards writes to it."""

    def __init__(self, sock: _StreamingSocket):
        self._sock = sock

    def write(self, data):
        if isinstance(data, str):
            data = data.encode()
        self._sock._absorb_headers(data)
        return len(data)

    def flush(self):
        self._sock._output.flush()

    def writable(self):
        return True


def main():
    if len(sys.argv) < 4:
        print("Usage: _dev_stream_handler.py <script_path> <method> <query> [headers_json]",
              file=sys.stderr)
        sys.exit(1)

    script_path = sys.argv[1]
    method = sys.argv[2].upper()
    query_string = sys.argv[3]
    extra_headers = {}
    if len(sys.argv) >= 5:
        try:
            extra_headers = json.loads(sys.argv[4])
        except Exception:
            pass

    # Read body from stdin
    body_bytes = sys.stdin.buffer.read()

    if not os.path.exists(script_path):
        err = json.dumps({"error": f"Not found: {script_path}"})
        sys.stdout.write(f"data: {err}\n\n")
        sys.stdout.flush()
        sys.exit(0)

    spec = importlib.util.spec_from_file_location("streaming_handler", script_path)
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception as e:
        err = json.dumps({"error": f"Failed to load handler: {e}", "done": True})
        sys.stdout.write(f"data: {err}\n\n")
        sys.stdout.flush()
        sys.exit(0)

    if not hasattr(module, "handler"):
        err = json.dumps({"error": "No handler class found", "done": True})
        sys.stdout.write(f"data: {err}\n\n")
        sys.stdout.flush()
        sys.exit(0)

    # Build HTTP request bytes for the fake socket.
    script_name = os.path.splitext(os.path.basename(script_path))[0]
    path = f"/api/{script_name}"
    if query_string:
        path += query_string

    request_line = f"{method} {path} HTTP/1.1\r\n".encode()
    header_bytes = b"Host: localhost\r\n"
    for hkey, hval in extra_headers.items():
        header_bytes += f"{hkey}: {hval}\r\n".encode()
    if body_bytes:
        header_bytes += f"Content-Length: {len(body_bytes)}\r\n".encode()
        header_bytes += b"Content-Type: application/json\r\n"
    header_bytes += b"\r\n"
    raw_request = request_line + header_bytes + body_bytes

    # Capture the real stdout buffer before redirecting. Handler prints must not
    # land in the SSE stream, but the stream itself has to keep using this buffer.
    output = sys.stdout.buffer
    fake_socket = _StreamingSocket(output, raw_request)
    client_address = ("127.0.0.1", 12345)

    _real_stdout = sys.stdout
    sys.stdout = io.StringIO()
    try:
        module.handler(fake_socket, client_address, None)
    except Exception as e:
        sys.stdout = _real_stdout
        err = json.dumps({"error": str(e), "done": True})
        sys.stdout.buffer.write(f"data: {err}\n\n".encode())
        sys.stdout.buffer.flush()
        return
    sys.stdout = _real_stdout


if __name__ == "__main__":
    main()
