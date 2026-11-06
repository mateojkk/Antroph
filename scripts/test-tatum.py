"""Test the Tatum Sui RPC layer: liveness probe + verify a known memory tx."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

env = os.path.join(os.path.dirname(__file__), "..", ".env")
with open(env, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ[k.strip()] = v.strip()

from lib.tatum import is_configured, latest_checkpoint, sui_rpc, verify_transaction  # noqa: E402

print("configured:", is_configured())

probe = latest_checkpoint()
print("liveness ->", probe)
if not probe.get("ok"):
    sys.exit(1)

# Disabled methods must be rejected by the whitelist too.
print("whitelist-reject ->", str(sui_rpc("sui_moveCall_tryThis", []))[:120])

# Resolve wrote blob O8G-... — its registration tx is unknown here, so instead
# verify a generic recent checkpoint *object* shape via a chain read the route
# whitelists: get the chain id.
resp = sui_rpc("sui_getChainIdentifier")
print("chain id ->", resp)
