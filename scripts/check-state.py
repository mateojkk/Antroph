"""Check predictions resolution + leaderboard state."""
import os

env = os.path.join(os.path.dirname(__file__), "..", ".env")
with open(env, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ[k.strip()] = v.strip()

from supabase import create_client  # noqa: E402

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
rows = (
    sb.table("predictions")
    .select("id,external_id,user_pick,confidence,resolved,outcome,question")
    .order("created_at")
    .execute()
    .data
)
for r in rows:
    q = (r.get("question") or "")[:40]
    print(f"{r['id'][:18]:18} | {q:40} | pick={r['user_pick']:14} conf={r['confidence']} resolved={r['resolved']} outcome={r['outcome']}")
lb = (
    sb.table("leaderboard")
    .select("username,accuracy_pct,correct,total_predictions,rank")
    .execute()
    .data
)
print("leaderboard:", lb)
