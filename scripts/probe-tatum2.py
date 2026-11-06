"""Probe Tatum Sui gateway variants until one returns a JSON-RPC result."""
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

candidates = [
    ("POST", "https://sui-mainnet.gateway.tatum.io?x-api-key=" + key, {"content-type": "application/json"}),
    ("POST", "https://sui-mainnet.gateway.tatum.io/", {"content-type": "application/json", "x-api-key": key}),
    ("POST", "https://sui-mainnet.gateway.tatum.io/json-rpc", {"content-type": "application/json", "x-api-key": key}),
    ("POST", "https://sui-mainnet.gateway.tatum.io/v1", {"content-type": "application/json", "x-api-key": key}),
    ("POST", "https://sui-mainnet.gateway.tatum.io/rpc", {"content-type": "application/json", "x-api-key": key}),
    ("POST", "https://sui-mainnet.gateway.tatum.io/sui-mainnet", {"content-type": "application/json", "x-api-key": key}),
    ("POST", "https://sui-mainnet.gateway.tatum.io", {"content-type": "application/json", "authorization": "Bearer " + key}),
    ("GET", "https://sui-mainnet.gateway.tatum.io", {"x-api-key": key}),
]
for method, url, headers in candidates:
    req = urllib.request.Request(url, data=payload if method == "POST" else None, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            print(f"{method} {url[:70]} -> {r.status} {r.read().decode('utf-8','replace')[:140]}")
    except urllib.error.HTTPError as e:
        print(f"{method} {url[:70]} -> {e.code} {e.read().decode('utf-8','replace')[:140]}")
    except Exception as e:
        print(f"{method} {url[:70]} -> ERR {e}")
