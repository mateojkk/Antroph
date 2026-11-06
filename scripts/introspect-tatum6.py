"""Introspect Tatum Sui GraphQL: transaction fields, effects, object changes."""
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


for t in ("Transaction", "TransactionEffects", "TransactionEffectsStatus", "ObjectChange"):
    data = q('{ __type(name: "%s") { kind name fields { name type { kind name ofType { kind name ofType { name } } } } } }' % t)
    print(t, "=>", json.dumps(data.get("data", {}).get("__type"), indent=1)[:4000])
    print("---")

# Find Transaction fields
data = q('{ __type(name: "Query") { fields { name args { name type { kind name ofType { name } } } } } }')
for f in data["data"]["__type"]["fields"]:
    if f["name"] in ("transaction", "transactions", "object", "objects"):
        print(f["name"], "args:", json.dumps(f["args"]))
