"""Introspect TransactionEffects fields + events() args."""
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


print(q('{ __type(name: "TransactionEffects") { fields { name type { kind name ofType { name } } } } }'))
print(q('{ __type(name: "Query") { fields { name args { name type { kind name ofType { name } } } } } }')["data"]["__type"]["fields"][12:20])
