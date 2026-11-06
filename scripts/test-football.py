"""Quick football-data.org key test: list matches in the next 3 days."""
import os
import json
import urllib.request

env = os.path.join(os.path.dirname(__file__), "..", ".env")
with open(env, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ[k.strip()] = v.strip()

today = "2026-11-05"
req = urllib.request.Request(
    f"https://api.football-data.org/v4/matches?dateFrom={today}&dateTo=2026-11-07",
    headers={"X-Auth-Token": os.environ["FOOTBALL_DATA_API_KEY"]},
)
with urllib.request.urlopen(req, timeout=30) as r:
    data = json.loads(r.read().decode("utf-8"))

matches = data.get("matches", [])
print("HTTP OK; total matches next 3 days:", len(matches))
for m in matches[:10]:
    d = m.get("utcDate", "")[5:16]
    comp = m.get("competition", {}).get("code", "?")
    home = m.get("homeTeam", {}).get("name", "?")
    away = m.get("awayTeam", {}).get("name", "?")
    print(f"  {d}  {comp:5}  {home} vs {away}  [{m.get('status')}]")
