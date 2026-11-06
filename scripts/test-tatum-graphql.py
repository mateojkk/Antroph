"""Test Tatum Sui GraphQL gateway."""
import json
import os
import urllib.error
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

tests = {
    "chainIdentifier": "{ chainIdentifier }",
    "latestCheckpoint": "{ checkpoints(last: 1) { nodes { sequenceNumber } } }",
    "events": '{ events(first: 2, filter: { module: { package: "0xe7c16fbea0560e7057e2bf7422feaa4fb313749fc69c9e9092fac7a33b81d7f5", name: "account" } }) { nodes { eventType } } }',
}
for label, query in tests.items():
    req = urllib.request.Request(
        url,
        data=json.dumps({"query": query}).encode(),
        headers={"content-type": "application/json", "x-api-key": key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print(f"{label}: HTTP {r.status} {r.read().decode('utf-8', 'replace')[:300]}")
    except urllib.error.HTTPError as e:
        print(f"{label}: HTTP {e.code} {e.read().decode('utf-8', 'replace')[:300]}")
    except Exception as e:
        print(f"{label}: ERR {e}")
