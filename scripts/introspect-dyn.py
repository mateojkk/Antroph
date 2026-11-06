"""Introspect dynamic field query inputs."""
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


for t in ("DynamicFieldName", "DynamicField", "Object"):
    print(t, json.dumps(q('{ __type(name: "%s") { kind inputFields { name type { kind name ofType { name } } } fields { name args { name type { kind name ofType { name } } } type { kind name ofType { name } } } } }' % t), indent=1)[:3500])

fields = q('{ __type(name: "Query") { fields { name args { name type { kind name ofType { name } } } } } }')["data"]["__type"]["fields"]
for f in fields:
    if "dynamic" in f["name"].lower():
        print(f["name"], json.dumps(f["args"]))
