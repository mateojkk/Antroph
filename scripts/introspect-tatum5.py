"""Introspect ObjectFilter + ExecutionResult, and try finding a MemWalAccount by owner."""
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


print("ObjectFilter:", json.dumps(q('{ __type(name: "ObjectFilter") { inputFields { name type { kind name ofType { name } } } } }'), indent=1))
print("ExecutionResult:", json.dumps(q('{ __type(name: "ExecutionResult") { fields { name type { kind name ofType { name } } } } }'), indent=1))

# Query objects args
fields = q('{ __type(name: "Query") { fields { name args { name type { kind name ofType { name } } } } } }')["data"]["__type"]["fields"]
for f in fields:
    if f["name"] in ("objects", "objectVersions"):
        print(f["name"], "args:", json.dumps(f["args"]))

# Try the known agent owner
query = """
query ($owner: SuiAddress) {
  objects(first: 5, filter: { owner: $owner }) {
    nodes { address { address } asMoveObject { contents { type { repr } json } } }
  }
}
"""
print(json.dumps(q(query, {"owner": "0x8dc97a3946ecb60bb72a019d2f166e936e07ee4e87a968d3240b9e7b365d839c"}), indent=1)[:1800])
