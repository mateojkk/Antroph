"""Inspect the known MemWalAccount object and whether type-only object filters work."""
import json
import os
import urllib.request

env = os.path.join(os.path.dirname(__file__), "..", ".env")
with open(env, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ[k.strip()] = v.strip()

url = "https://sui-mainnet.gateway.tatum.io/graphql"
key = os.environ["TATUM_API_KEY"]
PKG = "0xe7c16fbea0560e7057e2bf7422feaa4fb313749fc69c9e9092fac7a33b81d7f5"


def q(query, variables=None):
    req = urllib.request.Request(
        url,
        data=json.dumps({"query": query, "variables": variables or {}}).encode(),
        headers={"content-type": "application/json", "x-api-key": key},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode())


account = "0x93fa02c82969d34886e87c52f32395e57125e26e71f4a5072bee87c2dd709dbb"
obj = q(
    """query ($a: SuiAddress!) {
      object(address: $a) {
        address
        owner { __typename }
        asMoveObject { contents { type { repr } json } }
      }
    }""",
    {"a": account},
)
print("object:", json.dumps(obj, indent=1)[:2500])

by_type = q(
    """query ($t: String!) {
      objects(first: 5, filter: { type: $t }) {
        nodes { address asMoveObject { contents { json } } }
      }
    }""",
    {"t": f"{PKG}::account::MemWalAccount"},
)
print("type filter:", json.dumps(by_type, indent=1)[:2500])
