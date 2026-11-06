from http.server import BaseHTTPRequestHandler

from lib.common import get_supabase, send_json


def _safe_select(supabase) -> list[dict]:
    """Try the rich select first; fall back to the basic one if the live DB
    hasn't been migrated to include display_name/avatar_url yet."""
    try:
        result = (
            supabase.table("leaderboard")
            .select("user_id, username, display_name, avatar_url, accuracy_pct, total_predictions, correct, rank")
            .gte("total_predictions", 1)
            .order("rank", desc=False)
            .limit(500)
            .execute()
        )
        return result.data or []
    except Exception as e:
        msg = str(e)
        # If the live DB doesn't have display_name/avatar_url yet, fall back.
        if "display_name" in msg or "avatar_url" in msg or "42703" in msg:
            result = (
                supabase.table("leaderboard")
                .select("user_id, username, accuracy_pct, total_predictions, correct, rank")
                .gte("total_predictions", 1)
                .order("rank", desc=False)
                .limit(500)
                .execute()
            )
            rows = result.data or []
            for r in rows:
                r.setdefault("display_name", None)
                r.setdefault("avatar_url", None)
            return rows
        raise


def _enrich_with_users(supabase, rows: list[dict]) -> list[dict]:
    """If display_name/avatar_url weren't selected from leaderboard, fill
    them in from the users table. Skips silently on any error."""
    if not rows:
        return rows
    needs_dn = any(not r.get("display_name") for r in rows)
    needs_av = any(not r.get("avatar_url") for r in rows)
    if not needs_dn and not needs_av:
        return rows

    try:
        ids = [r["user_id"] for r in rows if r.get("user_id")]
        if not ids:
            return rows
        result = (
            supabase.table("users")
            .select("id, display_name, avatar_url")
            .in_("id", ids)
            .execute()
        )
        by_id = {u["id"]: u for u in (result.data or [])}
        for r in rows:
            u = by_id.get(r.get("user_id"))
            if u:
                r.setdefault("display_name", u.get("display_name"))
                r.setdefault("avatar_url", u.get("avatar_url"))
    except Exception as e:
        msg = str(e)
        # If the users columns aren't there yet either, just leave them null.
        if "display_name" in msg or "avatar_url" in msg or "42703" in msg:
            pass
        else:
            print(f"[leaderboard] enrich failed: {e}")
    return rows


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            supabase = get_supabase()
            rows = _safe_select(supabase)
            rows = _enrich_with_users(supabase, rows)
            send_json(self, 200, rows)
        except Exception as e:
            send_json(self, 500, {"error": str(e)})
