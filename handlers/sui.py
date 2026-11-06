"""Sui mainnet onchain routes for the browser, backed by Tatum GraphQL.

Sui's public JSON-RPC fullnodes were sunset in July 2026 and never send CORS
headers, so the browser cannot talk to them. These routes provide the small
surface the Walrus Memory account flow needs, powered by Tatum's Sui mainnet
GraphQL gateway (the API key stays server-side):

GET /api/sui/account?address=<sui_address>&package=<package_id>
  Find the MemWalAccount object owned by a wallet. MemWalAccount is a shared
  object, so it has no `owner` in Sui's object index; we resolve it by the
  `account::AccountCreated` event sent by that wallet (bounded to the
  gateway's earliest available checkpoint). Returns
  {"found": bool, "account_id": "0x..." | null}. This replaces the old
  queryEvents() scan that hit the dead public fullnode.

GET /api/sui/tx?digest=<tx_digest>
  Fetch a transaction and return a JSON-RPC-shaped subset
  (digest, effects.status, objectChanges). The MemWal SDK polls this via its
  waitForTransaction() after the wallet signs.

POST /api/sui/execute
  Broadcast a wallet-signed transaction through Tatum:
  body {"bytes": "<base64 TransactionData>", "signature": "<base64 sig>"}
  (or {"transactionDataBcs": ..., "signatures": [...]}).
  Returns {"digest", "status", "objectChanges"}.

Every route is mainnet-only, matching the Walrus Memory deployment Vela uses.
"""

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from lib import tatum
from lib.common import options, read_json_body, send_json

ACCOUNT_TYPE_SUFFIX = "::account::MemWalAccount"

# Shared selection set for transaction effects. `objectChanges` gives the
# MemWal SDK the `created` entry holding the new account object id.
_EFFECTS_FIELDS = """
      digest
      status
      executionError { message }
      objectChanges(first: 50) {
        nodes {
          address
          idCreated
          idDeleted
          outputState { asMoveObject { contents { type { repr } } } }
          inputState { asMoveObject { contents { type { repr } } } }
        }
      }
"""

_TX_QUERY = """
query ($digest: String!) {
  transaction(digest: $digest) {
    digest
    effects {%s}
  }
}
""" % _EFFECTS_FIELDS

_EXECUTE_MUTATION = """
mutation ($tx: Base64!, $sigs: [String!]!) {
  executeTransaction(transactionDataBcs: $tx, signatures: $sigs) {
    effects {%s}
  }
}
""" % _EFFECTS_FIELDS

_ACCOUNT_QUERY = """
query ($owner: SuiAddress!, $type: String!) {
  objects(first: 5, filter: { owner: $owner, type: $type }) {
    nodes {
      address
      asMoveObject { contents { type { repr } } }
    }
  }
}
"""

_EARLIEST_QUERY = "{ checkpoints(first: 1) { nodes { sequenceNumber } } }"

_ACCOUNT_EVENT_QUERY = """
query ($sender: SuiAddress!, $type: String!, $after: UInt53) {
  events(first: 5, filter: { sender: $sender, type: $type, afterCheckpoint: $after }) {
    nodes { contents { type { repr } json } }
  }
}
"""


def _change_type(node: dict) -> str:
    if node.get("idCreated"):
        return "created"
    if node.get("idDeleted"):
        return "deleted"
    return "mutated"


def _object_type(node: dict) -> str | None:
    for state in ("outputState", "inputState"):
        contents = ((node.get(state) or {}).get("asMoveObject") or {}).get("contents")
        repr_ = ((contents or {}).get("type") or {}).get("repr")
        if repr_:
            return repr_
    return None


def _normalize_effects(effects: dict | None, digest: str | None = None) -> dict:
    """Convert Tatum's effects shape into the JSON-RPC-ish subset we expose."""
    effects = effects or {}
    nodes = ((effects.get("objectChanges") or {}).get("nodes")) or []
    object_changes = [
        {
            "type": _change_type(node),
            "objectId": node.get("address"),
            "objectType": _object_type(node),
        }
        for node in nodes
    ]

    status = str(effects.get("status") or "").upper()
    error = (effects.get("executionError") or {}).get("message")
    return {
        "digest": digest or effects.get("digest"),
        "objectChanges": object_changes,
        "effects": {
            "status": {
                "status": "success" if status == "SUCCESS" else "failure",
                **({"error": error} if error else {}),
            }
        },
    }


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        options(self)

    def do_GET(self):
        parsed = urlparse(self.path)
        route = parsed.path
        qs = parse_qs(parsed.query)

        if not tatum.is_configured():
            return send_json(self, 503, {"error": "Tatum is not configured"})

        if route.endswith("/account"):
            return self._account(qs)

        if route.endswith("/tx") or route.endswith("/transaction"):
            return self._transaction(qs)

        return send_json(self, 404, {"error": "Unknown sui route"})

    def do_POST(self):
        parsed = urlparse(self.path)

        if not parsed.path.endswith("/execute"):
            return send_json(self, 404, {"error": "Unknown sui route"})

        if not tatum.is_configured():
            return send_json(self, 503, {"error": "Tatum is not configured"})

        return self._execute()

    # ------------------------------------------------------------------ reads

    def _account(self, qs):
        address = (qs.get("address") or [""])[0].strip()
        package = (qs.get("package") or [""])[0].strip()
        if not address:
            return send_json(self, 400, {"error": "Missing address"})
        if not package:
            return send_json(self, 400, {"error": "Missing package"})
        base_package = package.split("::", 1)[0]

        account_id, error = self._find_account_event(address, base_package)
        if account_id:
            return send_json(
                self,
                200,
                {
                    "found": True,
                    "address": address,
                    "package": package,
                    "account_id": account_id,
                },
            )

        # Fallback for networks where the account is a regular owned object.
        try:
            resp = tatum.graphql(
                _ACCOUNT_QUERY,
                {"owner": address, "type": f"{base_package}{ACCOUNT_TYPE_SUFFIX}"},
            )
            nodes = (((resp or {}).get("data") or {}).get("objects") or {}).get("nodes") or []
            account_id = nodes[0].get("address") if nodes else None
        except Exception:
            account_id = None

        return send_json(
            self,
            200,
            {
                "found": bool(account_id),
                "address": address,
                "package": package,
                "account_id": account_id,
                **({"error": error} if error and not account_id else {}),
            },
        )

    def _find_account_event(self, address: str, package: str) -> tuple[str | None, str | None]:
        """Resolve a wallet's MemWalAccount via its AccountCreated event.

        Tatum only retains a rolling window of checkpoints, so the query starts
        at `checkpoints(first: 1)` (the gateway's earliest available) instead of
        genesis. If the window moves between calls, retry with the new floor.
        """
        try:
            probe = tatum.graphql(_EARLIEST_QUERY)
            nodes = (((probe or {}).get("data") or {}).get("checkpoints") or {}).get("nodes") or []
            earliest = nodes[0].get("sequenceNumber") if nodes else None
        except Exception as e:
            return None, f"checkpoint probe failed: {e}"

        if earliest is None:
            return None, "no checkpoints returned"

        event_type = f"{package}::account::AccountCreated"
        for attempt in range(2):
            try:
                resp = tatum.graphql(
                    _ACCOUNT_EVENT_QUERY,
                    {"sender": address, "type": event_type, "after": earliest},
                )
            except Exception as e:
                return None, str(e)

            errors = (resp or {}).get("errors") or []
            if errors:
                message = " ".join(str(e.get("message") or "") for e in errors)
                # The gateway may report a newer floor if the window rolled over.
                marker = "lowest available checkpoint is"
                if attempt == 0 and marker in message:
                    tail = message.split(marker, 1)[1].strip().rstrip(".")
                    digits = "".join(ch for ch in tail if ch.isdigit())
                    if digits:
                        earliest = int(digits)
                        continue
                return None, message

            nodes = (((resp or {}).get("data") or {}).get("events") or {}).get("nodes") or []
            for node in nodes:
                parsed = ((node.get("contents") or {}).get("json")) or {}
                if parsed.get("account_id"):
                    return parsed["account_id"], None
            return None, None

        return None, "could not resolve the event checkpoint window"

    def _transaction(self, qs):
        digest = (qs.get("digest") or [""])[0].strip()
        if not digest:
            return send_json(self, 400, {"error": "Missing digest"})

        try:
            resp = tatum.graphql(_TX_QUERY, {"digest": digest})
        except Exception as e:
            return send_json(self, 502, {"error": str(e)})

        tx = ((resp or {}).get("data") or {}).get("transaction")
        if not tx:
            return send_json(
                self,
                404,
                {
                    "error": "Transaction not found",
                    "digest": digest,
                    "details": (resp or {}).get("errors"),
                },
            )

        return send_json(
            self, 200, _normalize_effects(tx.get("effects"), tx.get("digest") or digest)
        )

    # ------------------------------------------------------------------ writes

    def _execute(self):
        body = read_json_body(self) or {}
        tx_bytes = (body.get("bytes") or body.get("transactionDataBcs") or "").strip()
        if not tx_bytes:
            return send_json(self, 400, {"error": "Missing transaction bytes"})

        signatures = body.get("signatures")
        if not signatures:
            signature = (body.get("signature") or "").strip()
            signatures = [signature] if signature else []
        signatures = [str(s).strip() for s in signatures if str(s).strip()]
        if not signatures:
            return send_json(self, 400, {"error": "Missing signature"})

        try:
            resp = tatum.graphql(
                _EXECUTE_MUTATION, {"tx": tx_bytes, "sigs": signatures}
            )
        except Exception as e:
            return send_json(self, 502, {"error": str(e)})

        errors = (resp or {}).get("errors")
        if errors:
            return send_json(self, 502, {"error": "Tatum rejected the transaction", "details": errors})

        effects = (((resp or {}).get("data") or {}).get("executeTransaction") or {}).get("effects")
        if not effects:
            return send_json(self, 502, {"error": "No execution effects returned"})

        payload = _normalize_effects(effects)
        status = payload["effects"]["status"]["status"]
        return send_json(
            self,
            200 if status == "success" else 502,
            {
                **payload,
                "status": status,
            },
        )
