"""Call the zz_debug endpoint through the dev server, like test-end2end does."""
import json
import urllib.request

def call(url, payload, headers):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", **headers},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8")

body = call(
    "http://localhost:3000/api/zz_debug",
    {"user_email": "testuser@vela.dev"},
    {"X-User-Email": "testuser@vela.dev"},
)
print(body)
