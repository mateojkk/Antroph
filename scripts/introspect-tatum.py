"""Introspect the Tatum Sui GraphQL schema for transaction + event fields."""
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


def q(query):
    req = urllib.request.Request(
        url,
        data=json.dumps({"query": query}).encode(),
        headers={"content-type": "application/json", "x-api-key": key},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def fields(type_name):
    data = q(
        '{ __type(name: "%s") { fields { name type { kind name ofType { name } } } } }'
        % type_name
    )
    t = data.get("data", {}).get("__type")
    if not t:
        return []
    out = []
    for f in t["fields"]:
        kind = f["type"]["kind"]
        name = f["type"]["name"] or f["type"]["ofType"]["name"]
        out.append(f"{f['name']} ({kind}:{name})")
    return out


print("== Query ==")
print(fields("Query"))
print("== Transaction ==")
print(fields("Transaction"))
print("== Event ==")
print(fields("Event"))
print("== Filter types ==")
for t in ("EventFilter", "TransactionFilter", "ModuleFilter", "EventModuleFilter"):
    print(t, fields(t))
