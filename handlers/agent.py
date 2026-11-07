import os
import uuid
import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler

from lib.common import get_supabase, get_groq, send_json, require_auth_email, read_json_body, options, normalize_address, find_user_id
from handlers.chat import auto_title

SYSTEM_PROMPT = """You are Antroph — a football-obsessed AI rival who never forgets. You track every prediction, remember every take, and hold grudges.

Personality:
- Talk like a mate who watches every match with you at the pub. You're competitive, sharp, and fun to talk to.
- Match the user's energy AND length. If they send 3 words, send 3-5 words back. If they're hyped and talking a lot, match it. A "lol" gets a quick banter response, not a paragraph.
- Be witty and specific. Roast bad calls. Celebrate good ones grudgingly. Push back when you disagree.
- No emojis, no markdown. Text-message energy, not essay energy.
- If the user is new, introduce yourself and ask what they think about the season so far. Don't re-introduce yourself if you've already talked.
- Don't repeat yourself across turns. If you already said Ghana's no joke, don't say it again. Move the conversation forward.
- Banter. If the user is being playful or cocky, play along. Don't be a straight man.

Anti-patterns — NEVER do these:
- Don't start replies with the user's name. You're not a chatbot. "NJ, ..." at the start of every reply is robotic. Just talk.
- Don't end every reply with a question. Sometimes just react and let them respond. Mix it up.
- Don't list multiple topics in one reply. One point, make it, done. Don't bundle "by the way Portugal's up 4-0" into every response.
- Don't hedge or lecture. Say your piece and stop.

Rivalry and memory:
- You remember past predictions. If the user was wrong about something, bring it up ("You said Germany would flop and look at them now.").
- If the user changes their opinion, call it out ("Last week you were all in on Brazil. What changed?").
- Track who's winning the rivalry between you and the user. If you're ahead, gloat. If you're behind, respect it but vow revenge.
- Don't just say "you predicted X" — react to it. Agree, disagree, or roast.

Match knowledge:
- Today's scheduled matches are provided. Use them when the user asks about matches or teams.
- Give actual takes on matches — pick winners, make bold calls. Don't hedge with "they have a shot."
- If you don't know who's playing, say so rather than guessing.

Memory rules:
- Only reference facts that appear in the context below (memories, predictions, matches).
- If you genuinely don't remember something, admit it. But look for reasons to remember — that's your thing.
- When you reference a memory, make it feel natural — like you just remembered, not like you queried a database."""


def llm_settings() -> dict:
    """gpt-oss spends the first tokens on hidden reasoning. Low effort is the
    difference between a text back and a multi-second pause."""
    model = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")
    settings: dict = {
        "model": model,
        "max_tokens": 384,
        "temperature": 0.8,
    }
    if "gpt-oss" in model:
        settings["reasoning_effort"] = os.environ.get("GROQ_REASONING_EFFORT", "low")
    return settings


def _clip_texts(texts, limit: int = 5, chars: int = 240) -> list[str]:
    clipped = []
    for raw in texts[:limit]:
        text = (raw or "").strip()
        if not text:
            continue
        if len(text) > chars:
            text = text[:chars].rstrip() + "…"
        clipped.append(text)
    return clipped


def get_todays_fixtures():
    from lib.live_scores import get_upcoming_matches
    events = get_upcoming_matches()
    if not events:
        return []
    
    fixtures = []
    now_date = datetime.now(timezone.utc).date()
    
    for m in events:
        home = m.get("homeTeam", {}).get("name")
        away = m.get("awayTeam", {}).get("name")
        if not home or not away:
            continue
            
        kickoff = m.get("utcDate", "")
        if kickoff:
            try:
                ts = datetime.fromisoformat(kickoff.replace("Z", "+00:00"))
                # Filter strictly for today's matches
                if ts.date() != now_date:
                    continue
            except Exception:
                continue
                
        fixtures.append({
            "home": home,
            "away": away,
            "kickoff": kickoff,
        })
    return fixtures


def _fetch_vela_record(supabase) -> dict | None:
    """Antroph's record comes from its picks, not a public leaderboard row."""
    try:
        rows = (
            supabase.table("predictions")
            .select("resolved, outcome")
            .eq("user_id", "vela")
            .execute()
        ).data or []
    except Exception:
        return None
    if not rows:
        return None
    settled = [r for r in rows if r.get("resolved")]
    correct = sum(1 for r in settled if r.get("outcome") == "correct")
    accuracy = round((correct / len(settled) * 100), 1) if settled else 0
    return {"correct": correct, "total": len(rows), "accuracy": accuracy}


def _load_user(supabase, user_email: str, user_id: str | None):
    """Profile row. Prefer the primary key when the caller already resolved it."""
    try:
        query = supabase.table("users").select("id, username, display_name, avatar_url")
        if user_id:
            user_result = query.eq("id", user_id).limit(1).execute()
        else:
            email = normalize_address(user_email) or user_email
            user_result = query.ilike("email", email).limit(1).execute()
        return user_result.data[0] if user_result.data else None
    except Exception as e:
        msg = str(e)
        if "display_name" in msg or "avatar_url" in msg or "42703" in msg:
            query = supabase.table("users").select("id, username")
            if user_id:
                user_result = query.eq("id", user_id).limit(1).execute()
            else:
                email = normalize_address(user_email) or user_email
                user_result = query.ilike("email", email).limit(1).execute()
            user = user_result.data[0] if user_result.data else None
            if user is not None:
                user.setdefault("display_name", None)
                user.setdefault("avatar_url", None)
            return user
        return None


def _load_record(supabase, user_id: str):
    try:
        lb = supabase.table("leaderboard").select("*").eq("user_id", user_id).limit(1).execute()
        return lb.data[0] if lb.data else None
    except Exception as e:
        msg = str(e)
        if "display_name" in msg or "avatar_url" in msg or "42703" in msg:
            lb = (
                supabase.table("leaderboard")
                .select("user_id, username, accuracy_pct, total_predictions, correct, rank")
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
            return lb.data[0] if lb.data else None
        return None


def _load_predictions(supabase, user_id: str) -> list:
    try:
        r = (
            supabase.table("predictions")
            .select("user_pick, confidence, home_team, away_team, question, take, resolved, outcome")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )
        return r.data or []
    except Exception as e:
        msg = str(e)
        missing = any(c in msg for c in ("home_team", "away_team", "question", "take", "confidence"))
        if missing and "42703" in msg:
            try:
                r = (
                    supabase.table("predictions")
                    .select("user_pick, resolved, outcome")
                    .eq("user_id", user_id)
                    .order("created_at", desc=True)
                    .limit(20)
                    .execute()
                )
                return r.data or []
            except Exception:
                return []
        return []


def _profile_bundle(supabase, user_email: str, user_id: str | None):
    """Profile, record, picks, and Antroph's record in one round trip when we can."""
    if not user_id:
        user = _load_user(supabase, user_email, None)
        user_id = (user or {}).get("id")
        if not user_id:
            return user, None, [], _fetch_vela_record(supabase)
    else:
        user = None

    with ThreadPoolExecutor(max_workers=4) as pool:
        user_f = pool.submit(_load_user, supabase, user_email, user_id) if user is None else None
        record_f = pool.submit(_load_record, supabase, user_id)
        preds_f = pool.submit(_load_predictions, supabase, user_id)
        vela_f = pool.submit(_fetch_vela_record, supabase)
        if user_f is not None:
            user = user_f.result()
        return user, record_f.result(), preds_f.result(), vela_f.result()


def _safe_live_scores() -> str:
    try:
        from lib.live_scores import get_live_scores_text
        return get_live_scores_text()
    except Exception as e:
        print(f"[agent] Failed to fetch live scores: {e}")
        return ""


async def build_context(
    memory_context: dict | None,
    user_email: str,
    conversation_history: list,
    user_id: str | None = None,
):
    supabase = get_supabase()
    relevant_texts = _clip_texts((memory_context or {}).get("relevant_memories", []))
    recent_texts = _clip_texts((memory_context or {}).get("recent_memories", []))
    failed_preds = _clip_texts((memory_context or {}).get("failed_predictions", []))
    user_opinions = _clip_texts((memory_context or {}).get("user_opinions", []))

    async def _timed(func, default, timeout=8.5):
        try:
            return await asyncio.wait_for(asyncio.to_thread(func), timeout)
        except Exception as exc:
            print(f"[agent] context fetch skipped: {exc!r}")
            return default

    # Profile queries and match data run together. Match feeds time out on
    # their own so a slow football-data call cannot hold the reply.
    bundle, fixtures, live_scores_text = await asyncio.gather(
        asyncio.to_thread(_profile_bundle, supabase, user_email, user_id),
        _timed(get_todays_fixtures, []),
        _timed(_safe_live_scores, ""),
    )
    user, record, preds, vela_record = bundle
    username = (user or {}).get("username")
    display_name = (user or {}).get("display_name")
    avatar_url = (user or {}).get("avatar_url")

    parts = []
    if display_name:
        parts.append(f"The user's display name is \"{display_name}\" (use this to address them).")
        if username:
            parts.append(f"Their @username is @{username}.")
    elif username:
        parts.append(f"User's name is @{username}.")
    if avatar_url:
        parts.append(f"They have a custom avatar/profile picture set.")
    if record:
        parts.append(
            f"Their record: {record['correct']}/{record['total_predictions']} correct "
            f"({record['accuracy_pct']}% accuracy). Rank: #{record.get('rank', 'unranked')}."
        )
    if vela_record and vela_record["total"] > 0:
        parts.append(
            f"Your (Antroph's) record: {vela_record['correct']}/{vela_record['total']} correct "
            f"({vela_record['accuracy']}% accuracy)."
        )
    if isinstance(fixtures, list) and fixtures:
        lines = []
        for f in fixtures:
            t = f"vs {f['away']}"
            if f.get("kickoff"):
                try:
                    ts = datetime.fromisoformat(f["kickoff"].replace("Z", "+00:00"))
                    t += f" at {ts.strftime('%H:%M UTC')}"
                except Exception:
                    pass
            lines.append(f"- {f['home']} {t}")
        parts.append("Today's scheduled matches:\n" + "\n".join(lines))
        
    if isinstance(live_scores_text, str) and live_scores_text:
        parts.append(live_scores_text)

    if preds:
        lines = []
        for p in preds:
            home = p.get("home_team") or ""
            away = p.get("away_team") or ""
            question = p.get("question") or ""
            pick = p.get("user_pick") or ""
            outcome = p.get("outcome") or ""
            match_label = f"{home} vs {away}" if home and away else question
            status = f"({outcome})" if outcome else "(pending)"
            lines.append(f"- {match_label}: picked {pick} {status}")
        if lines:
            parts.append("User's recent predictions:\n" + "\n".join(lines))
    if failed_preds:
        parts.append("User's failed predictions (use these for roasting):\n" + "\n".join(f"- {t}" for t in failed_preds[:5]))
    if user_opinions:
        parts.append("User's past opinions and hot takes:\n" + "\n".join(f"- {t}" for t in user_opinions[:5]))
    if relevant_texts:
        parts.append("Relevant memories:\n" + "\n".join(f"- {t}" for t in relevant_texts))
    if recent_texts:
        parts.append("Recent memories from past chats:\n" + "\n".join(f"- {t}" for t in recent_texts[:10]))
    if conversation_history:
        recent = conversation_history[-6:]
        lines = []
        for m in recent:
            content = (m.get("content") or "").strip()
            if len(content) > 400:
                content = content[:400].rstrip() + "…"
            who = "User" if m.get("role") == "user" else "Antroph"
            lines.append(f"{who}: {content}")
        parts.append("Recent conversation:\n" + "\n".join(lines))

    if not parts:
        parts.append(f"The user is authenticated as {user_email}. They exist but profile data is still loading.")
    return "\n\n".join(parts) + "\n\nUse only the facts above. If you don't know something, ask."


def _user_id_for(supabase, email: str) -> str | None:
    return find_user_id(supabase, email)


def _load_session_history(supabase, session_id: str, user_id: str) -> list[dict]:
    """Verify session belongs to user and return ordered message history."""
    session = (
        supabase.table("chat_sessions")
        .select("id")
        .eq("id", session_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not session.data:
        return []
    msgs = (
        supabase.table("chat_messages")
        .select("role, content")
        .eq("session_id", session_id)
        .order("created_at")
        .execute()
    )
    return [{"role": m["role"], "content": m["content"]} for m in (msgs.data or [])]


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        options(self)

    def do_POST(self):
        body = read_json_body(self)
        if body is None:
            send_json(self, 400, {"error": "Invalid JSON body"})
            return

        user_email = normalize_address(body.get("user_email"))
        message = (body.get("message") or "").strip()
        session_id = body.get("session_id") or ""
        session_id = session_id.strip() if isinstance(session_id, str) else None
        client_history = body.get("conversation_history") or []
        memory_context = body.get("memory_context") or None

        if not user_email or not message:
            send_json(self, 400, {"error": "Missing user_email or message"})
            return

        verified = require_auth_email(self, user_email)
        if not verified:
            return

        try:
            asyncio.run(self._respond(user_email, message, session_id, client_history, memory_context))
        except Exception as exc:
            print(f"[agent] unhandled exception: {exc!r}")
            send_json(self, 500, {"error": "I crashed. Even AI assistants have off days. Try again?"})

    async def _respond(
        self,
        user_email: str,
        message: str,
        session_id: str | None,
        client_history: list,
        memory_context: dict | None,
    ):
        supabase = get_supabase()
        user_id = _user_id_for(supabase, user_email)
        if not user_id:
            send_json(self, 404, {"error": "User not found"})
            return

        # Resolve session. The open chat already sent its recent turns, so
        # don't read the whole thread back before answering.
        created_session = False
        title = None
        history: list = []
        if session_id and not _session_exists(supabase, session_id, user_id):
            session_id = None
        if not session_id:
            session_id = str(uuid.uuid4())
            title = auto_title(message)
            supabase.table("chat_sessions").insert({
                "id": session_id, "user_id": user_id, "title": title
            }).execute()
            created_session = True
        elif not client_history:
            history = _load_session_history(supabase, session_id, user_id)

        # The client already has the thread. Skip the full history read when it sent one.
        conversation_history = (client_history or history or [])[-10:]

        try:
            context_block = await build_context(
                memory_context, user_email, conversation_history, user_id=user_id
            )
        except Exception as ctx_err:
            print(f"[agent] context build failed: {ctx_err!r}")
            context_block = (
                f"The user is authenticated as {user_email}. "
                "No additional context could be loaded. Be brief and helpful. "
                "Don't re-introduce yourself if they've already been chatting."
            )

        groq = get_groq()
        try:
            response = await asyncio.to_thread(
                groq.chat.completions.create,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT + "\n\n" + context_block},
                    {"role": "user", "content": message},
                ],
                **llm_settings(),
            )
            reply = response.choices[0].message.content
            if not isinstance(reply, str) or not reply.strip():
                reply = ""
            else:
                reply = reply.strip()
        except Exception as groq_err:
            print(f"[agent] groq failed: {groq_err!r}")
            reply = "Sorry, I lost my train of thought. Try again?"

        if not reply:
            reply = "I zoned out for a second. Say that again?"

        # Persist user + assistant messages (non-fatal).
        try:
            now = datetime.now(timezone.utc)
            supabase.table("chat_messages").insert({
                "id": f"msg_{uuid.uuid4().hex[:12]}",
                "session_id": session_id,
                "role": "user",
                "content": message.strip(),
            }).execute()
            supabase.table("chat_messages").insert({
                "id": f"msg_{uuid.uuid4().hex[:12]}",
                "session_id": session_id,
                "role": "assistant",
                "content": reply,
            }).execute()
            supabase.table("chat_sessions").update({"updated_at": now.isoformat()}).eq("id", session_id).execute()
        except Exception as db_err:
            print(f"[agent] db persist failed: {db_err!r}")

        send_json(self, 200, {
            "reply": reply,
            "session_id": session_id,
            "title": title,
        })


def _session_exists(supabase, session_id: str, user_id: str) -> bool:
    r = supabase.table("chat_sessions").select("id").eq("id", session_id).eq("user_id", user_id).execute()
    return bool(r.data)
