"""
GET /api/markets
Fetches matches from football-data.org and formats them as MarketGroups.
Calls the API directly (same as livescores.py) to avoid any library issues.
"""

import os
import json
import urllib.request
from http.server import BaseHTTPRequestHandler
from lib.common import send_json, options


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        options(self)

    def do_GET(self):
        api_key = os.environ.get("FOOTBALL_DATA_API_KEY")
        if not api_key:
            send_json(self, 200, [])
            return

        try:
            req = urllib.request.Request(
                "https://api.football-data.org/v4/matches",
                headers={"X-Auth-Token": api_key},
            )
            with urllib.request.urlopen(req, timeout=8) as response:
                data = json.loads(response.read().decode())

            matches = data.get("matches", [])
        except Exception as e:
            print(f"[markets] API fetch failed: {e}")
            send_json(self, 200, [])
            return

        try:
            groups = []
            for m in matches:
                home = m.get("homeTeam", {}).get("name", "Home")
                away = m.get("awayTeam", {}).get("name", "Away")
                home_crest = m.get("homeTeam", {}).get("crest", "")
                mid = m.get("id")
                utc_date = m.get("utcDate", "")
                status = m.get("status", "SCHEDULED")

                slug = f"{home.lower().replace(' ', '-')}-vs-{away.lower().replace(' ', '-')}-match-{mid}"
                question = f"{home} vs {away}"

                sub_markets = [
                    {
                        "id": f"{mid}_home",
                        "question": f"{home} to Win",
                        "yes_price": 0.33,
                        "no_price": 0.67,
                        "volume": 0,
                        "game_start_time": utc_date,
                        "closed": status in ["FINISHED", "AWARDED"],
                        "active": status not in ["FINISHED", "AWARDED"],
                    },
                    {
                        "id": f"{mid}_draw",
                        "question": "Draw",
                        "yes_price": 0.33,
                        "no_price": 0.67,
                        "volume": 0,
                        "game_start_time": utc_date,
                        "closed": status in ["FINISHED", "AWARDED"],
                        "active": status not in ["FINISHED", "AWARDED"],
                    },
                    {
                        "id": f"{mid}_away",
                        "question": f"{away} to Win",
                        "yes_price": 0.33,
                        "no_price": 0.67,
                        "volume": 0,
                        "game_start_time": utc_date,
                        "closed": status in ["FINISHED", "AWARDED"],
                        "active": status not in ["FINISHED", "AWARDED"],
                    },
                ]

                group = {
                    "id": str(mid),
                    "question": question,
                    "slug": slug,
                    "image": home_crest,
                    "end_date": utc_date,
                    "volume": 0,
                    "match": {"home": home, "away": away},
                    "markets": sub_markets,
                }
                groups.append(group)

            send_json(self, 200, groups)
        except Exception as e:
            print(f"[markets] serialization failed: {e}")
            send_json(self, 200, [])
