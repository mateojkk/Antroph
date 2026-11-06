"""
GET /api/livescores
Proxies to football-data.org to get today's live matches and scores.
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
            send_json(self, 500, {"error": "FOOTBALL_DATA_API_KEY not configured."})
            return
            
        try:
            req = urllib.request.Request(
                "https://api.football-data.org/v4/matches",
                headers={"X-Auth-Token": api_key}
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                data = json.loads(response.read().decode())
            
            send_json(self, 200, data.get("matches", []))
        except Exception as e:
            print(f"[livescores] API fetch failed: {e}")
            send_json(self, 500, {"error": "Failed to fetch live scores."})
