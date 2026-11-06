"""Debug transactions query shape on Tatum Sui GraphQL."""
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

queries = {
    "last1": "{ transactions(last: 1) { nodes { digest } } }",
    "first1": "{ transactions(first: 1) { nodes { digest } } }",
    "first1-desc": "{ transactions(first: 1) { nodes { digest } pageInfo { hasNextPage } } }",
    "checkpoints-first": "{ checkpoints(first: 1) { nodes { sequenceNumber } } }",
}
for label, q in queries.items():
    req = urllib.request.Request(
        url,
        data=json.dumps({"query": q}).encode(),
        headers={"content-type": "application/json", "x-api-key": key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print(label, "->", r.read().decode()[:260])
    except Exception as e:
        print(label, "ERR", e)
