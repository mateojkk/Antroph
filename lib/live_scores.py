import os
import urllib.request
import json

def get_live_scores_text() -> str:
    api_key = os.environ.get("FOOTBALL_DATA_API_KEY")
    if not api_key:
        return ""
    
    try:
        req = urllib.request.Request(
            "https://api.football-data.org/v4/matches",
            headers={"X-Auth-Token": api_key}
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode())
        
        matches = data.get("matches", [])
        if not matches:
            return ""
            
        lines = []
        for m in matches:
            home = m.get("homeTeam", {}).get("name", "Home")
            away = m.get("awayTeam", {}).get("name", "Away")
            status = m.get("status", "SCHEDULED")
            
            if status in ["IN_PLAY", "PAUSED"]:
                score_home = m.get("score", {}).get("fullTime", {}).get("home", 0)
                score_away = m.get("score", {}).get("fullTime", {}).get("away", 0)
                minute = m.get("minute", "Live")
                lines.append(f"{home} {score_home}-{score_away} {away} ({minute}')")
            elif status == "FINISHED":
                score_home = m.get("score", {}).get("fullTime", {}).get("home", 0)
                score_away = m.get("score", {}).get("fullTime", {}).get("away", 0)
                lines.append(f"{home} {score_home}-{score_away} {away} (FT)")
            
        if not lines:
            return ""
        
        return "Live Match Updates & Scores (Use this to answer questions about ongoing/finished games):\n" + "\n".join(lines)
    except Exception as e:
        return ""

def _normalize_team(name: str) -> str:
    import re
    norm = re.sub(r'[^a-z0-9]', '', name.lower().replace('and', '').replace('republic', '').replace('the', ''))
    if norm in ["korea", "southkorea", "korearepublic"]:
        return "southkorea"
    if norm in ["usa", "unitedstates", "unitedstatesofamerica"]:
        return "usa"
    if norm in ["bosnia", "bosniah", "bosniaherzegovina"]:
        return "bosniaherzegovina"
    return norm
def get_finished_matches() -> dict:
    """Returns a dict of {(norm_home, norm_away): 'home' | 'away' | 'draw'} for matches finished in the last 7 days."""
    api_key = os.environ.get("FOOTBALL_DATA_API_KEY")
    if not api_key:
        return {}
    
    import datetime
    today = datetime.date.today()
    start = today - datetime.timedelta(days=7)
    end = today + datetime.timedelta(days=1)
    
    try:
        url = f"https://api.football-data.org/v4/matches?dateFrom={start.isoformat()}&dateTo={end.isoformat()}"
        req = urllib.request.Request(
            url,
            headers={"X-Auth-Token": api_key}
        )
        with urllib.request.urlopen(req, timeout=8) as response:
            data = json.loads(response.read().decode())
        
        finished = {}
        for m in data.get("matches", []):
            if m.get("status") in ["FINISHED", "AWARDED"]:
                home = m.get("homeTeam", {}).get("name", "")
                away = m.get("awayTeam", {}).get("name", "")
                home_short = m.get("homeTeam", {}).get("shortName", "") or home
                away_short = m.get("awayTeam", {}).get("shortName", "") or away
                score_h = m.get("score", {}).get("fullTime", {}).get("home", 0)
                score_a = m.get("score", {}).get("fullTime", {}).get("away", 0)
                
                if score_h > score_a:
                    outcome = "home"
                elif score_a > score_h:
                    outcome = "away"
                else:
                    outcome = "draw"
                
                # Index by all name variants (name, shortName) so normalization
                # always finds a hit regardless of what the frontend stored.
                for h in set([home, home_short]):
                    for a in set([away, away_short]):
                        n_home = _normalize_team(h)
                        n_away = _normalize_team(a)
                        finished[(n_home, n_away)] = outcome
                
        return finished
    except Exception as e:
        print(f"[live_scores] get_finished_matches failed: {e}")
        return {}

def get_upcoming_matches() -> list:
    """Returns a list of raw match objects for the next 7 days from football-data.org."""
    api_key = os.environ.get("FOOTBALL_DATA_API_KEY")
    if not api_key:
        return []

    import datetime
    today = datetime.date.today()
    end = today + datetime.timedelta(days=7)

    try:
        url = f"https://api.football-data.org/v4/matches?dateFrom={today.isoformat()}&dateTo={end.isoformat()}"
        req = urllib.request.Request(
            url,
            headers={"X-Auth-Token": api_key}
        )
        with urllib.request.urlopen(req, timeout=8) as response:
            data = json.loads(response.read().decode())

        matches = data.get("matches", [])
        if matches:
            return matches
    except Exception as e:
        print(f"[live_scores] get_upcoming_matches date range failed: {e}")

    try:
        req = urllib.request.Request(
            "https://api.football-data.org/v4/matches",
            headers={"X-Auth-Token": api_key}
        )
        with urllib.request.urlopen(req, timeout=8) as response:
            data = json.loads(response.read().decode())
        return data.get("matches", [])
    except Exception as e:
        print(f"[live_scores] get_upcoming_matches fallback failed: {e}")
        return []
