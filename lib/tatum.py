"""
Tatum Sui client.

All Vela onchain reads and verifications go through Tatum's Sui mainnet
gateway. The key stays server-side; the browser never sees Tatum credentials.

Tatum's Sui gateway is now GraphQL-first: JSON-RPC was sunset when Sui disabled
JSON-RPC on public fullnodes (July 2026). The gateway discovery endpoint
(/_methods) advertises only `sui-mainnet-graphql` at <gateway>/graphql, so
`graphql()` is the primary transport. `sui_rpc()` is kept for chains/endpoints
that still speak JSON-RPC.

Config (env):
  TATUM_API_KEY    - API key from dashboard.tatum.io
  SUI_MAINNET_RPC  - Tatum Sui mainnet gateway URL
                     (https://sui-mainnet.gateway.tatum.io)
  SUI_RPC_URL      - optional override for local/dev testing
"""

import os
import json
import urllib.request
import urllib.error

# Methods the proxy route is allowed to forward. Everything else gets 400.
# Read-only methods only: the backend never broadcasts transactions through this
# route, and unsafe_* methods are not supported on Tatum Sui nodes anyway.
ALLOWED_METHODS = {
    "sui_getTransactionBlock",
    "sui_multiGetTransactionBlocks",
    "sui_getCheckpoint",
    "sui_getLatestCheckpointSequenceNumber",
    "sui_queryTransactionBlocks",
    "sui_clientState",
    "sui_getChainIdentifier",
    "sui_getTotalTransactionBlocks",
    "sui_getProtocolConfig",
    "suix_getBalance",
    "suix_getAllBalances",
    "suix_getTotalSupply",
    "suix_queryEvents",
    "suix_getOwnedObjects",
    "suix_getObject",
    "suix_multiGetObjects",
    "suix_getDynamicFields",
    "suix_getDynamicFieldObject",
    "suix_getCoinMetadata",
    "suix_subscribeEvent",  # rejected below; listed to make the intent explicit
    "sui_tryGetPastObject",
    "sui_devInspectTransactionBlock",
    "suix_name_display_address",
}


class TatumConfigError(RuntimeError):
    pass


def _endpoint() -> str:
    url = os.environ.get("SUI_MAINNET_RPC") or os.environ.get("SUI_RPC_URL") or ""
    return url.rstrip("/")


def _tatum_api_key() -> str:
    return os.environ.get("TATUM_API_KEY") or ""


def is_configured() -> bool:
    """True only when both the endpoint and the key are present."""
    return bool(_endpoint()) and bool(_tatum_api_key())


def _graphql_url() -> str:
    base = _endpoint()
    if not base:
        return ""
    return base if base.endswith("/graphql") else f"{base}/graphql"


def _headers() -> dict:
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    api_key = _tatum_api_key()
    if api_key:
        # Tatum RPC Gateway auth: x-api-key header.
        headers["x-api-key"] = api_key
        headers.setdefault("api-key", api_key)
    return headers


def graphql(query: str, variables: dict | None = None, timeout: int = 25) -> dict:
    """POST a GraphQL query to the Tatum Sui gateway.

    Returns the raw GraphQL response ({"data": ...} or {"errors": [...]}).
    Raises TatumConfigError when unconfigured, RuntimeError on transport/HTTP.
    """
    url = _graphql_url()
    if not url:
        raise TatumConfigError("SUI_MAINNET_RPC is not configured")

    payload = {"query": query, "variables": variables or {}}
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=_headers(),
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        raise RuntimeError(f"Tatum GraphQL HTTP {e.code}: {body[:200]}") from e
    except Exception as e:
        raise RuntimeError(f"Tatum GraphQL request failed: {e}") from e


def sui_rpc(method: str, params: list | None = None, timeout: int = 25) -> dict:
    """Send a JSON-RPC 2.0 request to the Tatum Sui mainnet endpoint.

    Returns the raw JSON-RPC response (containing "result" or "error").
    Raises TatumConfigError when the integration is not configured and
    RuntimeError on transport failure.
    """
    if not _endpoint():
        raise TatumConfigError("SUI_MAINNET_RPC is not configured")

    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params or [],
    }

    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    api_key = _tatum_api_key()
    if api_key:
        # Tatum RPC Gateway auth: x-api-key header (same as Trainyard).
        headers["x-api-key"] = api_key
        headers.setdefault("api-key", api_key)

    req = urllib.request.Request(
        _endpoint(),
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        raise RuntimeError(f"Tatum RPC HTTP {e.code}: {body[:200]}") from e
    except Exception as e:
        raise RuntimeError(f"Tatum RPC request failed: {e}") from e


def verify_transaction(digest: str, expect_success: bool = True) -> dict:
    """Fetch a transaction block and derive its status/sender via Tatum GraphQL.

    Used to verify that a Walrus Memory write (or any Sui tx) actually landed on
    mainnet before we trust or reflect it in the product. Returns a dict:
      { verified, status, sender, digest }
    """
    resp = graphql(
        """
        query ($digest: String!) {
          transaction(digest: $digest) {
            digest
            effects { status }
            sender { address }
          }
        }
        """,
        {"digest": digest},
    )
    tx = ((resp or {}).get("data") or {}).get("transaction")
    if not tx:
        return {
            "verified": False,
            "digest": digest,
            "error": (resp or {}).get("errors") or "transaction not found",
        }

    status = (tx.get("effects") or {}).get("status")
    sender = (tx.get("sender") or {}).get("address", "")
    succeeded = str(status).upper() == "SUCCESS"
    return {
        "verified": succeeded if expect_success else status is not None,
        "status": status,
        "sender": sender,
        "digest": tx.get("digest") or digest,
    }


def latest_checkpoint() -> dict:
    """Cheap liveness probe: the latest checkpoint sequence number via Tatum."""
    resp = graphql("{ checkpoints(last: 1) { nodes { sequenceNumber } } }")
    nodes = (((resp or {}).get("data") or {}).get("checkpoints") or {}).get("nodes") or []
    if nodes:
        return {"ok": True, "checkpoint": nodes[-1].get("sequenceNumber")}
    return {"ok": False, "error": (resp or {}).get("errors") or "no checkpoints"}


def latest_transaction_digest() -> str | None:
    """Most recent transaction digest on mainnet (useful for self-checks).

    Tatum's gateway only serves recent history, so transactions must be
    filtered by the latest checkpoint rather than scanned from genesis.
    """
    probe = latest_checkpoint()
    checkpoint = probe.get("checkpoint") if probe.get("ok") else None
    if checkpoint is None:
        return None
    resp = graphql(
        """
        query ($checkpoint: UInt53) {
          transactions(last: 1, filter: { atCheckpoint: $checkpoint }) {
            nodes { digest }
          }
        }
        """,
        {"checkpoint": checkpoint},
    )
    nodes = (((resp or {}).get("data") or {}).get("transactions") or {}).get("nodes") or []
    return nodes[-1].get("digest") if nodes else None
