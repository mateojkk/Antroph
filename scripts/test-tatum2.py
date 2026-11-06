"""Test the Tatum layer end to end: checkpoint, latest tx, verify, whitelist."""
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

from lib import tatum  # noqa: E402

print("configured:", tatum.is_configured())
print("checkpoint:", tatum.latest_checkpoint())

digest = tatum.latest_transaction_digest()
print("latest digest:", digest)
if digest:
    print("verify:", tatum.verify_transaction(digest))
    print("verify(bad):", tatum.verify_transaction("0x" + "0" * 63))
