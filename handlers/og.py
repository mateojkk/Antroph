"""
GET /api/og?type=market&id=<id>
GET /api/og?type=profile&username=<username>

Returns a minimal HTML page with Open Graph and Twitter Card meta tags so
that link previews (Twitter, iMessage, Slack, Discord, etc.) render nicely.
The page is also a real HTML doc with a meta refresh redirect to the SPA,
so the user lands on the right page if they click the link.
"""

import re
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from lib.common import get_supabase, send_json

APP_NAME = "Antroph"
APP_TAGLINE = "Your AI football rival, all season"


def _app_url(handler: BaseHTTPRequestHandler) -> str:
    host = handler.headers.get("Host", "")
    if host:
        proto = "https" if "vercel" in host else "http"
        return f"{proto}://{host}"
    return "https://vela-wc.vercel.app"


def _html(title: str, description: str, image: str | None, target_url: str) -> bytes:
    img_tag = f'<meta property="og:image" content="{image}" />' if image else ""
    tw_image = f'<meta name="twitter:image" content="{image}" />' if image else ""
    safe_title = title.replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    safe_desc = description.replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    body = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{safe_title} — {APP_NAME}</title>
<meta name="description" content="{safe_desc}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="{target_url}" />
<meta property="og:title" content="{safe_title}" />
<meta property="og:description" content="{safe_desc}" />
{img_tag}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{safe_title}" />
<meta name="twitter:description" content="{safe_desc}" />
{tw_image}
<link rel="icon" type="image/jpeg" href="/antroph.jpg" />
<style>
  body {{
    margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #0e0e0f; color: #f3f4f6;
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh; padding: 20px;
  }}
  .card {{
    max-width: 520px; text-align: center;
    background: #1a1a1b; border: 1px solid #2e2e2e; border-radius: 12px;
    padding: 32px;
  }}
  img.logo {{ width: 64px; height: 64px; border-radius: 12px; margin-bottom: 16px; }}
  h1 {{ font-size: 22px; margin: 0 0 8px; }}
  p {{ color: #9ca3af; font-size: 14px; line-height: 1.5; margin: 0 0 20px; }}
  a.btn {{
    display: inline-block; padding: 10px 18px; border-radius: 8px;
    background: #38bdf8; color: #0a0a0a; text-decoration: none; font-weight: 600; font-size: 14px;
  }}
  .meta {{ color: #64748b; font-size: 11px; margin-top: 20px; text-transform: uppercase; letter-spacing: 0.1em; }}
</style>
<meta http-equiv="refresh" content="2;url={target_url}" />
</head>
<body>
  <div class="card">
    <img class="logo" src="/antroph.jpg" alt="Antroph" />
    <h1>{safe_title}</h1>
    <p>{safe_desc}</p>
    <a class="btn" href="{target_url}">Open in Antroph →</a>
    <p class="meta">{APP_NAME} · {APP_TAGLINE}</p>
  </div>
</body>
</html>"""
    return body.encode("utf-8")


def _fetch_market(supabase, market_id: str) -> dict | None:
    try:
        r = supabase.table("predictions").select("question").eq("external_id", market_id).limit(1).execute()
        if r.data and r.data[0].get("question"):
            return {"title": r.data[0]["question"], "description": "A World Cup 2026 prediction on Antroph."}
    except Exception:
        pass
    return None


def _fetch_profile(supabase, username: str) -> dict | None:
    try:
        r = supabase.table("leaderboard").select("username, display_name, accuracy_pct, total_predictions, correct, rank").eq("username", username).execute()
        if r.data:
            row = r.data[0]
            name = row.get("display_name") or row.get("username")
            return {
                "title": f"@{username} on Antroph",
                "description": f"{name} is {row['correct']}/{row['total_predictions']} on World Cup predictions ({row['accuracy_pct']}% accuracy, rank #{row.get('rank', '—')}).",
            }
    except Exception:
        pass
    return None


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        og_type = (params.get("type") or [""])[0]
        target_id = (params.get("id") or [""])[0]
        target_username = (params.get("username") or [""])[0]

        supabase = get_supabase()
        meta: dict | None = None
        base_url = _app_url(self)

        if og_type == "market" and target_id:
            meta = _fetch_market(supabase, target_id)
            target_url = f"{base_url}/feed?market={target_id}"
        elif og_type == "profile" and target_username:
            meta = _fetch_profile(supabase, target_username)
            target_url = f"{base_url}/u/{target_username}"
        else:
            meta = {"title": APP_NAME, "description": APP_TAGLINE}
            target_url = base_url

        if not meta:
            meta = {"title": APP_NAME, "description": APP_TAGLINE}

        body = _html(
            title=meta["title"],
            description=meta["description"],
            image=f"{base_url}/antroph.jpg",
            target_url=target_url,
        )

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "public, max-age=300")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
