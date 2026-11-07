"""Who counts as a public player.

Antroph is the house account (user id ``vela``). Test runs create accounts
like ``testuser`` / ``@vela.dev``. Neither belongs on the public leaderboard.
Their prediction rows stay; only the board hides them.
"""

_HOUSE_IDS = {"vela"}
_HIDDEN_USERNAMES = {"antroph", "vela", "testuser"}


def is_real_player(
    user_id: str | None,
    username: str | None = None,
    email: str | None = None,
) -> bool:
    if (user_id or "").strip().lower() in _HOUSE_IDS:
        return False
    name = (username or "").strip().lower()
    if name in _HIDDEN_USERNAMES or name.startswith("test"):
        return False
    mail = (email or "").strip().lower()
    if mail.endswith("@vela.ai") or mail.endswith("@vela.dev"):
        return False
    return True


def public_players(rows: list[dict], emails_by_id: dict | None = None) -> list[dict]:
    emails = emails_by_id or {}
    return [
        row
        for row in rows
        if is_real_player(
            row.get("user_id"),
            row.get("username"),
            emails.get(row.get("user_id")),
        )
    ]
