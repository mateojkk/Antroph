import uuid
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from lib.common import get_supabase, send_json, require_auth_email, read_json_body, normalize_address, address_variants


def _column_missing_error(exc: Exception, column: str) -> bool:
    """Detect Postgres/SQLAlchemy 'column does not exist' errors."""
    msg = str(exc)
    return column in msg or "42703" in msg


def _insert_user_robustly(supabase, user_row: dict) -> None:
    """Insert a users row, dropping optional columns one-by-one if the live
    DB hasn't been migrated yet."""
    optional = ["display_name", "avatar_url", "memwal_account_id"]
    attempt = dict(user_row)
    attempts = 0
    while attempts < 5:
        attempts += 1
        try:
            supabase.table("users").insert(attempt).execute()
            return
        except Exception as exc:
            msg = str(exc)
            dropped = False
            for col in list(optional):
                if col in attempt and (col in msg or "42703" in msg):
                    attempt.pop(col, None)
                    optional.remove(col)
                    dropped = True
                    break
            if not dropped:
                raise


def _sync_leaderboard(supabase, user: dict):
    """Keep the leaderboard row in sync with the users table's display fields.
    Gracefully no-ops if the leaderboard doesn't have those columns yet."""
    try:
        supabase.table("leaderboard").update({
            "username": user.get("username"),
            "display_name": user.get("display_name"),
            "avatar_url": user.get("avatar_url"),
        }).eq("user_id", user["id"]).execute()
    except Exception as exc:
        msg = str(exc)
        if "display_name" in msg or "avatar_url" in msg or "42703" in msg:
            try:
                supabase.table("leaderboard").update({
                    "username": user.get("username"),
                }).eq("user_id", user["id"]).execute()
            except Exception:
                pass
        else:
            print(f"[profile] Could not sync leaderboard: {exc}")


def _select_user(supabase, *, by_email: str | None = None, by_username: str | None = None) -> dict | None:
    """Fetch a user with display_name/avatar_url, falling back to a basic
    select if the live DB hasn't been migrated yet.

    Email lookup is case-insensitive because Sui addresses are, and also
    tries with/without the 0x prefix to handle legacy rows."""
    cols = "id, email, username, display_name, avatar_url, memwal_account_id, memory_public, memory_share_key, created_at"
    fallback_cols = "id, email, username, created_at"
    emails = address_variants(normalize_address(by_email))
    username = by_username.strip().lower() if by_username else None

    def _try_select(email_variants: list[str], use_cols: str) -> dict | None:
        q = supabase.table("users").select(use_cols)
        filters = []
        if email_variants:
            # Build an OR chain of ilike filters for each address variant.
            q = q.or_(",".join(f"email.ilike.{ev}" for ev in email_variants))
        if username is not None:
            q = q.ilike("username", username)
        result = q.limit(1).execute()
        if result.data:
            return result.data[0]
        return None

    try:
        row = _try_select(emails, cols)
        if row:
            return row
    except Exception as e:
        msg = str(e)
        if any(col in msg for col in ("display_name", "avatar_url", "memwal_account_id", "memory_public", "memory_share_key")) or "42703" in msg:
            try:
                row = _try_select(emails, fallback_cols)
                if row:
                    row.setdefault("display_name", None)
                    row.setdefault("avatar_url", None)
                    row.setdefault("memwal_account_id", None)
                    row.setdefault("memory_public", False)
                    row.setdefault("memory_share_key", None)
                    return row
            except Exception:
                return None
        else:
            raise
    return None


def _select_leaderboard(supabase, user_id: str) -> dict | None:
    """Fetch a leaderboard row, falling back to a basic select if the live
    DB hasn't been migrated to include display_name/avatar_url yet."""
    try:
        r = (
            supabase.table("leaderboard")
            .select("*")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if r.data:
            return r.data[0]
    except Exception as e:
        msg = str(e)
        if "display_name" in msg or "avatar_url" in msg or "42703" in msg:
            r = (
                supabase.table("leaderboard")
                .select("user_id, username, accuracy_pct, total_predictions, correct, rank")
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
            if r.data:
                row = r.data[0]
                row.setdefault("display_name", None)
                row.setdefault("avatar_url", None)
                return row
        else:
            raise
    return None


def _select_recent_chats(supabase, user_id: str, *, limit: int = 6) -> list[dict]:
    """Fetch recent chat exchanges from Supabase chat sessions."""
    try:
        sessions = (
            supabase.table("chat_sessions")
            .select("id")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .limit(3)
            .execute()
        )
        chats: list[dict] = []
        for s in (sessions.data or []):
            msgs = (
                supabase.table("chat_messages")
                .select("role, content")
                .eq("session_id", s["id"])
                .order("created_at", desc=True)
                .limit(2)
                .execute()
            )
            rows = msgs.data or []
            if len(rows) == 2:
                user_msg = next((m for m in rows if m["role"] == "user"), None)
                agent_msg = next((m for m in rows if m["role"] == "assistant"), None)
                if user_msg and agent_msg:
                    chats.append({"message": user_msg["content"], "reply": agent_msg["content"]})
            if len(chats) >= limit:
                break
        return chats
    except Exception as exc:
        print(f"[profile] Error fetching recent chats: {exc}")
        return []


def _select_predictions(supabase, user_id: str, *, limit: int = 20) -> list[dict]:
    """Fetch recent predictions, falling back if home_team/away_team/question/
    take/confidence columns don't exist yet."""
    full_cols = (
        "id, type, external_id, user_pick, confidence, home_team, away_team, "
        "question, take, resolved, outcome, created_at"
    )
    basic_cols = "id, type, external_id, user_pick, resolved, outcome, created_at"
    try:
        r = (
            supabase.table("predictions")
            .select(full_cols)
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return r.data or []
    except Exception as e:
        msg = str(e)
        missing = any(
            col in msg
            for col in ("home_team", "away_team", "question", "take", "confidence")
        )
        if missing and "42703" in msg:
            r = (
                supabase.table("predictions")
                .select(basic_cols)
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            rows = r.data or []
            for row in rows:
                row.setdefault("home_team", None)
                row.setdefault("away_team", None)
                row.setdefault("question", None)
                row.setdefault("take", None)
                row.setdefault("confidence", 5)
            return rows
        raise


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        email = params.get("email", [None])[0]
        username = params.get("username", [None])[0]

        supabase = get_supabase()

        try:
            if email:
                verified = require_auth_email(self, email)
                if not verified:
                    return

                user = _select_user(supabase, by_email=email)
                print(f"[profile] GET by email={email} -> user={user is not None}")
                if not user:
                    send_json(self, 200, {"user": None})
                    return

                record = _select_leaderboard(supabase, user["id"])
                if record is None:
                    record = {
                        "accuracy_pct": 0,
                        "total_predictions": 0,
                        "correct": 0,
                        "rank": 0,
                    }

                preds = _select_predictions(supabase, user["id"], limit=20)
                recent_chats = _select_recent_chats(supabase, user["id"], limit=6)

                send_json(self, 200, {
                    "user": user,
                    "record": record,
                    "recent_predictions": preds,
                    "recent_chats": recent_chats,
                })

            elif username:
                user = _select_user(supabase, by_username=username)
                if not user:
                    send_json(self, 404, {"error": "User not found"})
                    return

                record = _select_leaderboard(supabase, user["id"])
                if record is None:
                    record = {
                        "accuracy_pct": 0,
                        "total_predictions": 0,
                        "correct": 0,
                        "rank": 0,
                    }

                preds = _select_predictions(supabase, user["id"], limit=20)

                safe_user = {k: v for k, v in user.items() if k != "email"}

                if not user.get("memory_public"):
                    safe_user.pop("memory_share_key", None)
                    safe_user.pop("memwal_account_id", None)
                else:
                    if not user.get("memory_share_key") or not user.get("memwal_account_id"):
                        safe_user.pop("memory_share_key", None)
                        safe_user.pop("memwal_account_id", None)
                    else:
                        safe_user["memory_namespace"] = user.get("email", "")

                send_json(self, 200, {
                    "user": safe_user,
                    "record": record,
                    "recent_predictions": preds,
                    "recent_chats": [],
                })

            else:
                send_json(self, 400, {"error": "Missing email or username"})

        except Exception as e:
            send_json(self, 500, {"error": str(e)})

    def do_POST(self):
        body = read_json_body(self)
        if body is None:
            send_json(self, 400, {"error": "Invalid JSON body"})
            return

        email = normalize_address(body.get("email"))
        username = (body.get("username") or "").strip().lower()
        display_name = (body.get("display_name") or "").strip() or None
        avatar_url = (body.get("avatar_url") or "").strip() or None
        memwal_account_id = (body.get("memwal_account_id") or "").strip() or None

        if display_name and len(display_name) > 8:
            send_json(self, 400, {"error": "Display name too long (max 8)"})
            return
        if avatar_url and not (
            avatar_url.startswith("http://")
            or avatar_url.startswith("https://")
            or avatar_url.startswith("data:image/")
            or avatar_url.startswith("emoji:")
        ):
            send_json(self, 400, {"error": "Avatar must be a URL, data:image, or emoji:"})
            return
        if memwal_account_id and not memwal_account_id.startswith("0x"):
            send_json(self, 400, {"error": "Invalid MemWal account ID"})
            return

        verified = require_auth_email(self, email)
        if not verified:
            return

        if not email or not username:
            send_json(self, 400, {"error": "Missing email or username"})
            return

        supabase = get_supabase()

        try:
            taken = (
                supabase.table("users")
                .select("id, username")
                .ilike("username", username)
                .execute()
            )
            existing = _select_user(supabase, by_email=email)

            if existing:
                if taken.data and taken.data[0]["id"] != existing["id"]:
                    send_json(self, 409, {"error": "Username already taken"})
                    return
                update = {"username": username}
                if display_name is not None:
                    update["display_name"] = display_name
                if avatar_url is not None:
                    update["avatar_url"] = avatar_url
                if memwal_account_id is not None:
                    update["memwal_account_id"] = memwal_account_id
                try:
                    supabase.table("users").update(update).eq("id", existing["id"]).execute()
                except Exception as exc:
                    if _column_missing_error(exc, "memwal_account_id") and "memwal_account_id" in update:
                        update.pop("memwal_account_id")
                        if update:
                            supabase.table("users").update(update).eq("id", existing["id"]).execute()
                    else:
                        raise
                _sync_leaderboard(supabase, {**existing, **update})
                send_json(self, 200, {"status": "updated"})
                return

            if taken.data:
                send_json(self, 409, {"error": "Username already taken"})
                return

            user_id = str(uuid.uuid4())
            user_row = {
                "id": user_id,
                "email": email,
                "username": username,
                "display_name": display_name,
                "avatar_url": avatar_url,
                "memwal_account_id": memwal_account_id,
            }
            _insert_user_robustly(supabase, user_row)
            try:
                supabase.table("leaderboard").insert({
                    "user_id": user_id,
                    "username": username,
                    "display_name": display_name,
                    "avatar_url": avatar_url,
                    "accuracy_pct": 0,
                    "total_predictions": 0,
                    "correct": 0,
                    "rank": 999,
                }).execute()
            except Exception as exc:
                # Don't fail profile creation just because the leaderboard
                # table isn't fully migrated yet.
                print(f"[profile] Could not create leaderboard row: {exc}")

            send_json(self, 201, {"status": "created"})

        except Exception as e:
            send_json(self, 500, {"error": str(e)})

    def do_PATCH(self):
        body = read_json_body(self)
        if body is None:
            send_json(self, 400, {"error": "Invalid JSON body"})
            return

        email = normalize_address(body.get("email"))
        if not email:
            send_json(self, 400, {"error": "Missing email"})
            return

        verified = require_auth_email(self, email)
        if not verified:
            return

        updates: dict = {}
        if "display_name" in body:
            dn = (body.get("display_name") or "").strip()
            if len(dn) > 8:
                send_json(self, 400, {"error": "Display name too long (max 8)"})
                return
            updates["display_name"] = dn or None
        if "avatar_url" in body:
            au = (body.get("avatar_url") or "").strip()
            if au and not (
                au.startswith("http://")
                or au.startswith("https://")
                or au.startswith("data:image/")
                or au.startswith("emoji:")
            ):
                send_json(self, 400, {"error": "Avatar must be an http(s) URL, data:image, or emoji:"})
                return
            if len(au) > 2_000_000:
                send_json(self, 400, {"error": "Avatar too large"})
                return
            updates["avatar_url"] = au or None
        if "memwal_account_id" in body:
            mw = (body.get("memwal_account_id") or "").strip()
            if mw and not mw.startswith("0x"):
                send_json(self, 400, {"error": "Invalid MemWal account ID"})
                return
            updates["memwal_account_id"] = mw or None
        if "memory_public" in body:
            updates["memory_public"] = bool(body.get("memory_public"))
        if "memory_share_key" in body:
            updates["memory_share_key"] = (body.get("memory_share_key") or "").strip() or None

        if not updates:
            send_json(self, 400, {"error": "No fields to update"})
            return

        supabase = get_supabase()
        try:
            existing = _select_user(supabase, by_email=email)
            if not existing:
                send_json(self, 404, {"error": "User not found"})
                return

            try:
                result = supabase.table("users").update(updates).eq("id", existing["id"]).execute()
            except Exception as exc:
                if _column_missing_error(exc, "memwal_account_id") and "memwal_account_id" in updates:
                    updates.pop("memwal_account_id")
                    if not updates:
                        send_json(self, 400, {"error": "No fields to update"})
                        return
                    result = supabase.table("users").update(updates).eq("id", existing["id"]).execute()
                elif _column_missing_error(exc, "memory_public") or _column_missing_error(exc, "memory_share_key"):
                    updates.pop("memory_public", None)
                    updates.pop("memory_share_key", None)
                    if not updates:
                        send_json(self, 400, {"error": "No fields to update — run the memory_public migration"})
                        return
                    result = supabase.table("users").update(updates).eq("id", existing["id"]).execute()
                else:
                    raise
            if not result.data:
                send_json(self, 404, {"error": "User not found"})
                return
            user = result.data[0]
            _sync_leaderboard(supabase, user)
            send_json(self, 200, {"status": "updated", "user": user})
        except Exception as e:
            send_json(self, 500, {"error": str(e)})
