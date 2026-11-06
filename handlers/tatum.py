"""
Tatum routes.

POST /api/tatum/graphql
  Read-only GraphQL proxy to Tatum's Sui mainnet gateway. Mutations are
  rejected. The API key lives only on the server; the frontend gets an
  authenticated onchain read path without ever seeing Tatum credentials.

POST /api/tatum/rpc
  Whitelisted JSON-RPC proxy. Tatum's Sui gateway is GraphQL-first now
  (Sui sunset JSON-RPC in July 2026), so this is kept for other providers.

GET /api/tatum/status
  Configuration + liveness (latest checkpoint through Tatum).

GET /api/tatum/verify?digest=<tx_digest>
  Verify one transaction block landed and succeeded on Sui mainnet.
"""

import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from lib.common import send_json, options
from lib import tatum


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        options(self)

    def do_GET(self):
        parsed = urlparse(self.path)
        route = parsed.path  # e.g. /api/tatum/status after prefix dispatch

        if route.endswith("/status"):
            configured = tatum.is_configured()
            result = {"tatumRpcPath": "ok", "configured": configured}
            if configured:
                try:
                    result.update(tatum.latest_checkpoint())
                except Exception as e:
                    return send_json(self, 200, {
                        **result,
                        "ok": False,
                        "error": str(e),
                    })
            return send_json(self, 200, result)

        if route.endswith("/verify"):
            qs = parse_qs(parsed.query)
            digest = (qs.get("digest") or [""])[0].strip()
            if not digest:
                return send_json(self, 400, {"error": "Missing digest"})
            if not tatum.is_configured():
                return send_json(self, 503, {"error": "Tatum RPC not configured"})
            try:
                return send_json(self, 200, tatum.verify_transaction(digest))
            except Exception as e:
                return send_json(self, 502, {"error": str(e)})

        return send_json(self, 404, {"error": "Unknown tatum route"})

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path.endswith("/graphql"):
            return self._graphql()

        if not parsed.path.endswith("/rpc"):
            return send_json(self, 404, {"error": "Unknown tatum route"})

        if not tatum.is_configured():
            return send_json(self, 503, {
                "error": "Tatum RPC not configured. Set TATUM_API_KEY and SUI_MAINNET_RPC.",
            })

        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
        except Exception:
            return send_json(self, 400, {"error": "Invalid JSON body"})

        method = body.get("method") or ""
        if method.startswith("unsafe_") or method.startswith("suix_subscribe"):
            return send_json(self, 400, {"error": f"Method not allowed: {method}"})
        if method not in tatum.ALLOWED_METHODS:
            return send_json(self, 400, {"error": f"Method not whitelisted: {method}"})

        params = body.get("params") or []
        try:
            resp = tatum.sui_rpc(method, params)
        except Exception as e:
            return send_json(self, 502, {"error": str(e)})

        return send_json(self, 200, resp)

    def _graphql(self):
        """Read-only GraphQL proxy: reject mutations, forward queries."""
        if not tatum.is_configured():
            return send_json(self, 503, {
                "error": "Tatum not configured. Set TATUM_API_KEY and SUI_MAINNET_RPC.",
            })

        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
        except Exception:
            return send_json(self, 400, {"error": "Invalid JSON body"})

        query = (body.get("query") or "").strip()
        variables = body.get("variables") or {}
        if not query:
            return send_json(self, 400, {"error": "Missing GraphQL query"})

        lowered = query.lower()
        if "mutation" in lowered or "subscription" in lowered:
            return send_json(self, 400, {"error": "Only read-only GraphQL queries are allowed"})

        try:
            resp = tatum.graphql(query, variables)
        except Exception as e:
            return send_json(self, 502, {"error": str(e)})
        return send_json(self, 200, resp)
