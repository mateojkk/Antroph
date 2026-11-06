from http.server import BaseHTTPRequestHandler

from lib.common import get_supabase, send_json


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            supabase = get_supabase()
            supabase.table("users").select("count", count="exact").limit(1).execute()
            send_json(self, 200, {"status": "ok", "supabase": "connected"})
        except Exception as e:
            send_json(self, 500, {"status": "error", "error": str(e)})
