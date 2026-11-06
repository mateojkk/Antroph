"""Introspect Tatum Sui GraphQL: events filters + executeTransaction mutation."""
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


# events() args
fields = q('{ __type(name: "Query") { fields { name args { name type { kind name ofType { name } } } } } }')["data"]["__type"]["fields"]
for f in fields:
    if f["name"] == "events":
        print("events args:", json.dumps(f["args"], indent=1))

# Input object types we may need
for t in ("EventFilter", "TransactionFilter", "ExecutionStatus"):
    data = q('{ __type(name: "%s") { kind name inputFields { name type { kind name ofType { name } } } enumValues { name } } }' % t)
    print(t, json.dumps(data.get("data", {}).get("__type"), indent=1)[:1800])

# Mutation type
mut = q('{ __type(name: "Mutation") { fields { name args { name type { kind name ofType { name } } } } } }')
print("MUTATIONS:", json.dumps(mut.get("data", {}).get("__type"), indent=1)[:2500])
