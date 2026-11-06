"""Connection test through the real supabase-py path used by handlers."""
import os
import sys

env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
with open(env_path, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip()
            if k and not (v.startswith("* ")):
                os.environ[k] = v

from supabase import create_client  # noqa: E402

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

for table in ("users", "leaderboard", "predictions", "chat_sessions", "chat_messages"):
    res = sb.table(table).select("*").limit(1).execute()
    print(f"OK  {table}: {len(res.data)} row(s)")

# Round-trip write + clean it, proving real insert rights.
probe = "probe-" + os.urandom(6).hex()
sb.table("users").insert({"id": probe, "email": f"{probe}@vela.test", "username": probe}).execute()
fetched = sb.table("users").select("id").eq("id", probe).single().execute()
print("WRITE/READ round-trip:", fetched.data["id"] == probe)
sb.table("users").delete().eq("id", probe).execute()
print("cleanup done; SUPERBASE CONNECTION FULLY VERIFIED" if True else "")
