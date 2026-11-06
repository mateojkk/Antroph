"""End-to-end pipeline test: user + picks on finished matches, then resolve runs."""
import os
import json
import urllib.error
import urllib.request

env = os.path.join(os.path.dirname(__file__), "..", ".env")
with open(env, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ[k.strip()] = v.strip()

from supabase import create_client  # noqa: E402

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

USER_EMAIL = "testuser@vela.dev"

# 1. Ensure test user exists (matching the app's onboarding shape).
existing = sb.table("users").select("id").ilike("email", USER_EMAIL).execute()
if not existing.data:
    uid = "user_" + os.urandom(8).hex()
    sb.table("users").insert({
        "id": uid,
        "email": USER_EMAIL,
        "username": "testuser",
        "display_name": "Test User",
        "memwal_account_id": os.environ.get("MEMWAL_AGENT_ACCOUNT_ID", ""),
        "memory_public": True,
    }).execute()
    print("user created:", uid)
else:
    uid = existing.data[0]["id"]
    print("user exists:", uid)

# 2. Make picks on the two matches that FINISHED tonight (via the real API path).
def post_predict(payload):
    req = urllib.request.Request(
        "http://localhost:3000/api/predict",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-User-Email": USER_EMAIL},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode("utf-8")[:600]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")[:600]
    except Exception as e:
        return "ERR", str(e)

match1 = post_predict({
    "user_email": USER_EMAIL,
    "type": "match",
    "user_pick": "Botafogo",
    "confidence": 7,
    "take": "Botafogo at home is a fortress; Mineiro travels badly midweek.",
    "home_team": "Botafogo FR",
    "away_team": "CA Mineiro",
    "question": "Botafogo FR vs CA Mineiro — who wins?",
})
match2 = post_predict({
    "user_email": USER_EMAIL,
    "type": "match",
    "user_pick": "São Paulo FC",
    "confidence": 4,
    "take": "Derby fever: Corinthians shock at Morumbi.",
    "home_team": "São Paulo FC",
    "away_team": "SC Corinthians Paulista",
    "question": "São Paulo FC vs SC Corinthians Paulista — who wins?",
})
print("predict Botafogo ->", match1)
print("predict Sau Paulo ->", match2)
