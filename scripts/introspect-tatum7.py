"""Sample a recent transaction's effectsJson + objectChanges shape via Tatum GraphQL."""
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


latest = q("""{ transactions(first: 1, filter: { atCheckpoint: 237661232 }) { nodes { digest } } }""")
print("latest:", json.dumps(latest)[:400])
digest = latest["data"]["transactions"]["nodes"][0]["digest"]

tx = q(
    """query ($digest: String!) {
      transaction(digest: $digest) {
        digest
        effects {
          status
          executionError { message }
          effectsJson
          objectChanges(first: 10) {
            nodes {
              address
              idCreated
              idDeleted
              outputState { asMoveObject { contents { type { repr } json } } }
            }
          }
        }
      }
    }""",
    {"digest": digest},
)
print("tx:", json.dumps(tx, indent=1)[:6000])
