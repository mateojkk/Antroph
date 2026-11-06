"""Try event-based MemWal account discovery on Tatum GraphQL (recent window)."""
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
OWNER = "0x8dc97a3946ecb60bb72a019d2f166e936e07ee4e87a968d3240b9e7b365d839c"


def q(query, variables=None):
    req = urllib.request.Request(
        url,
        data=json.dumps({"query": query, "variables": variables or {}}).encode(),
        headers={"content-type": "application/json", "x-api-key": key},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


print("checkpoint:", json.dumps(q("{ checkpoints(last: 1) { nodes { sequenceNumber } } }")))

res = q(
    """query ($sender: SuiAddress) {
      events(first: 20, filter: { sender: $sender, afterCheckpoint: 237661232 }) {
        nodes {
          contents { type { repr } json }
          transaction { digest }
        }
      }
    }""",
    {"sender": OWNER},
)
print("events:", json.dumps(res, indent=1)[:4000])
