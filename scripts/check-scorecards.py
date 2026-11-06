"""Recall Vela agent scorecards from the running dev agentmem route."""
import json
import sys
import urllib.request

payload = {
    "op": "recall",
    "query": "scorecard resolution correct incorrect",
    "limit": 12,
}
req = urllib.request.Request(
    "http://localhost:3000/api/agentmem",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)
attempts = int(sys.argv[1]) if len(sys.argv) > 1 else 1
for i in range(attempts):
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            body = json.loads(r.read().decode("utf-8"))
        results = body.get("results", [])
        print(f"attempt {i+1}: {len(results)} memory(ies)")
        for m in results:
            print(" -", m.get("text", "")[:160])
        if results:
            break
    except Exception as e:
        print(f"attempt {i+1} failed: {e}")
    if i < attempts - 1:
        import time
        time.sleep(45)
