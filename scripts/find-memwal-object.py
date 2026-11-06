"""Find a MemWalAccount object by owner using Tatum GraphQL objects()."""
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


def q(query, variables=None):
    req = urllib.request.Request(
        url,
        data=json.dumps({"query": query, "variables": variables or {}}).encode(),
        headers={"content-type": "application/json", "x-api-key": key},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode())


query = """
query ($owner: SuiAddress) {
  objects(first: 20, filter: { owner: $owner }) {
    nodes {
      address
      asMoveObject { contents { type { repr } json } }
    }
  }
}
"""
owner = "0x8dc97a3946ecb60bb72a019d2f166e936e07ee4e87a968d3240b9e7b365d839c"
res = q(query, {"owner": owner})
print(json.dumps(res, indent=1)[:3000])
