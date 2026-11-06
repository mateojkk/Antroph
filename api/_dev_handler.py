#!/usr/bin/env python3
"""
Local dev handler — loads an API module, runs its handler, returns response.
Called by dev.mjs for each /api/* request.

Usage: python3 _dev_handler.py <script_name> <method> <query_string>
Body is read from stdin as JSON.
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

# Load .env from project root
_project_root = project_root
_env_path = os.path.join(_project_root, ".env")
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if not _line or _line.startswith("#"):
                continue
            _eq = _line.index("=") if "=" in _line else -1
            if _eq > 0:
                _val = _line[_eq + 1:].strip()
                # Strip surrounding quotes (single or double)
                if len(_val) >= 2 and _val[0] == _val[-1] and _val[0] in ('"', "'"):
                    _val = _val[1:-1]
                os.environ[_line[:_eq].strip()] = _val


class _FakeSocket:
    """Minimal socket-like object for BaseHTTPRequestHandler.

    All output (headers via sendall, body via wfile) goes to a single stream
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

    def getvalue(self):
        val = self._output.getvalue()
        # Strip the HTTP response line + headers that flush_headers writes
        # They look like: HTTP/1.0 200 OK\r\nServer: ...\r\n...\r\n\r\n
        header_end = val.find(b"\r\n\r\n")
        if header_end != -1:
            return val[header_end + 4:]
        return val


def main():
    if len(sys.argv) < 4:
        print("Usage: _dev_handler.py <script_name> <method> <query>", file=sys.stderr)
        sys.exit(1)

    script_name = sys.argv[1]
    method = sys.argv[2]
    query_string = sys.argv[3]
    extra_headers = {}
    if len(sys.argv) >= 5:
        try:
            extra_headers = json.loads(sys.argv[4])
        except Exception:
            pass

    # argv[5]: full original path + query (e.g. /api/memwal/remember?x=1).
    # Falls back to reconstructing /api/{script_name} for backward compat.
    full_path_and_query = sys.argv[5] if len(sys.argv) >= 6 and sys.argv[5] else ""

    # Read body from stdin
    body_bytes = b""
    try:
        stdin_data = sys.stdin.read()
        if stdin_data:
            body_bytes = stdin_data.encode()
    except Exception:
        pass

    # Load the API module
    script_path = os.path.join(
        project_root, "handlers", f"{script_name}.py"
    )
    if not os.path.exists(script_path):
        result = {"status": 404, "headers": {"Content-Type": "application/json"}}
        print(json.dumps(result))
        print("__SPLIT__")
        print(json.dumps({"error": f"Not found: {script_name}"}))
        sys.exit(0)

    spec = importlib.util.spec_from_file_location(script_name, script_path)
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception as e:
        result = {"status": 500, "headers": {"Content-Type": "application/json"}}
        print(json.dumps(result))
        print("__SPLIT__")
        print(json.dumps({"error": f"Failed to load {script_name}: {str(e)}"}))
        sys.exit(0)

    if not hasattr(module, "handler"):
        result = {"status": 500, "headers": {"Content-Type": "application/json"}}
        print(json.dumps(result))
        print("__SPLIT__")
        print(json.dumps({"error": f"No 'handler' class in {script_name}.py"}))
        sys.exit(0)

    # Build the full path for the handler.  Use the original full path (argv[5])
    # when available so sub-path handlers (e.g. memwal at /api/memwal/remember)
    # see the complete path.  Fall back to reconstructing from script_name.
    if full_path_and_query:
        path = full_path_and_query
    else:
        path = f"/api/{script_name}"
        if query_string:
            path += query_string

    method_upper = method.upper()

    # Create a mock request line + headers
    request_line = f"{method_upper} {path} HTTP/1.1\r\n".encode()
    header_bytes = b"Host: localhost\r\n"
    # Inject forwarded headers (Authorization, X-User-Email, etc.)
    for hkey, hval in extra_headers.items():
        header_bytes += f"{hkey}: {hval}\r\n".encode()
    if body_bytes:
        header_bytes += f"Content-Length: {len(body_bytes)}\r\n".encode()
        header_bytes += b"Content-Type: application/json\r\n"
    header_bytes += b"\r\n"
    raw_request = request_line + header_bytes + body_bytes

    # Create socket and handler
    fake_socket = _FakeSocket(raw_request)
    client_address = ("127.0.0.1", 12345)

    # Suppress the handler's stdout so debug print() calls don't corrupt
    # the status/body protocol on the wire.  Restore before our own output.
    _real_stdout = sys.stdout
    sys.stdout = io.StringIO()
    try:
        handler_instance = module.handler(fake_socket, client_address, None)
    except Exception as e:
        sys.stdout = _real_stdout
        import traceback
        result = {"status": 500, "headers": {"Content-Type": "application/json"}}
        print(json.dumps(result))
        print("__SPLIT__")
        print(json.dumps({"error": str(e), "trace": traceback.format_exc()}))
        sys.exit(0)
    sys.stdout = _real_stdout

    # Capture response
    raw_response = fake_socket._output.getvalue()
    status_code = 200
    response_headers = {}
    response_body = ""

    header_end = raw_response.find(b"\r\n\r\n")
    if header_end != -1:
        header_part = raw_response[:header_end].decode("utf-8", errors="replace")
        body_part = raw_response[header_end + 4:].decode("utf-8", errors="replace")

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

    result = {"status": status_code, "headers": response_headers}
    print(json.dumps(result))
    print("__SPLIT__")
    print(response_body)


if __name__ == "__main__":
    main()
