import os
import asyncio
from lib.common import get_supabase
from handlers.resolve import _recalculate_leaderboard, _refresh_ranks

def run():
    supabase = get_supabase()
    
    # Mexico won
    supabase.table("predictions").update({"resolved": True, "outcome": "incorrect"}).eq("id", "pred_9a80b6f9896f").execute()
    supabase.table("predictions").update({"resolved": True, "outcome": "correct"}).eq("id", "pred_93460d6e35dc").execute()
    
    # Recalculate leaderboards for the users
    _recalculate_leaderboard(supabase, "5c317182-f3af-4f96-ab97-8875284d6409")
    _recalculate_leaderboard(supabase, "6dae64d2-7cf6-4774-a8b7-d0ae2588bfd9")
    _refresh_ranks(supabase)
    
    print("Done fixing.")

if __name__ == "__main__":
    run()
