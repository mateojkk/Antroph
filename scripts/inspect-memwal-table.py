"""Inspect the MemWal AccountRegistry.accounts table."""
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
TABLE = "0xcfe04623a8c72ede45fc02babcb9711625df8549e53d3107d507efa696d5efde"
OWNER = "0x8dc97a3946ecb60bb72a019d2f166e936e07ee4e87a968d3240b9e7b365d839c"


def q(query, variables=None):
    req = urllib.request.Request(
        url,
        data=json.dumps({"query": query, "variables": variables or {}}).encode(),
        headers={"content-type": "application/json", "x-api-key": key},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode())


obj = q(
    """query ($a: SuiAddress!) {
      object(address: $a) {
        address
        owner { __typename }
        asMoveObject { contents { type { repr } json } }
      }
    }""",
    {"a": TABLE},
)
print("table:", json.dumps(obj, indent=1)[:2000])

dyn = q(
    """query ($a: SuiAddress!) {
      object(address: $a) {
        dynamicFields(first: 5) {
          nodes {
            name { type { repr } json }
            value { __typename ... on MoveValue { type { repr } json } }
          }
        }
      }
    }""",
    {"a": TABLE},
)
print("dyn:", json.dumps(dyn, indent=1)[:4000])

for name_type in ("address",):
    lookup = q(
        """query ($a: SuiAddress!, $name: DynamicFieldName!) {
          object(address: $a) {
            dynamicField(name: $name) {
              name { type { repr } json }
              value { __typename ... on MoveValue { type { repr } json } }
            }
          }
        }""",
        {"a": TABLE, "name": {"type": name_type, "bcs": ""}},
    )
    print("lookup(address):", json.dumps(lookup, indent=1)[:1500])
