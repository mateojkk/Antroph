"""Introspect transactions() args and try atCheckpoint filtering."""
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


meta = q('{ __type(name: "Query") { fields { name args { name type { kind name ofType { name } } } } } }')
for f in meta["data"]["__type"]["fields"]:
    if f["name"] in ("transactions", "transaction"):
        print(f["name"], json.dumps(f["args"]))

cp = q("{ checkpoints(last: 1) { nodes { sequenceNumber } } }")["data"]["checkpoints"]["nodes"][-1]["sequenceNumber"]
print("checkpoint", cp)
print(q('{ transactions(last: 1, filter: { atCheckpoint: %s }) { nodes { digest } } }' % cp))
print(q('{ transactionEffects: transactions(last: 1, filter: { atCheckpoint: %s }) { nodes { digest effects { status } } } }' % cp))
