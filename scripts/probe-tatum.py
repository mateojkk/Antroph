"""Probe Tatum Sui gateway URL paths to find the working JSON-RPC entry."""
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

key = os.environ["TATUM_API_KEY"]
payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "sui_getLatestCheckpointSequenceNumber", "params": []}).encode()

paths = [
    "",
    "/",
    "/v3",
    "/v3/",
    "/api/v3",
    "/v3/rpc",
    "/sui",
    "/sui-mainnet",
    "/jsonrpc",
]
for p in paths:
    url = "https://sui-mainnet.gateway.tatum.io" + p
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json", "x-api-key": key}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read().decode("utf-8", "replace")[:160]
            print(f"{url} -> {r.status} {body}")
    except urllib.error.HTTPError as e:
        print(f"{url} -> {e.code} {e.read().decode('utf-8', 'replace')[:160]}")
    except Exception as e:
        print(f"{url} -> ERR {e}")
