"""Introspect executeTransaction return type and MoveValue fields."""
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
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode())


print("executeTransaction type:", json.dumps(q('{ __type(name: "Mutation") { fields { name type { kind name ofType { name } } } } }'), indent=1))
print("MoveValue:", json.dumps(q('{ __type(name: "MoveValue") { fields { name type { kind name ofType { name } } } } }'), indent=1)[:1200])
print("Event sample:", json.dumps(q('{ events(first: 2) { nodes { contents { __typename } } } }'))[:400])
