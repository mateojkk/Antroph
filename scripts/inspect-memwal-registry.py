"""Inspect the MemWal registry object + dynamic fields for an owner->account map."""
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
REGISTRY = "0x8bf82c9e09e36b8d1c38298f68b7cb68e7b8762887e7592add9986d5e9cf199f"


def q(query, variables=None):
    req = urllib.request.Request(
        url,
        data=json.dumps({"query": query, "variables": variables or {}}).encode(),
        headers={"content-type": "application/json", "x-api-key": key},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode())


obj = q(
    """query ($a: SuiAddress!) {
      object(address: $a) {
        address
        owner { __typename }
        asMoveObject { contents { type { repr } json } }
      }
    }""",
    {"a": REGISTRY},
)
print("registry:", json.dumps(obj, indent=1)[:3000])

dyn = q(
    """query ($a: SuiAddress!) {
      object(address: $a) {
        dynamicFields(first: 10) { nodes { name { type { repr } json } } }
      }
    }""",
    {"a": REGISTRY},
)
print("dynamicFields:", json.dumps(dyn, indent=1)[:2000])
