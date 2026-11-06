import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiGet } from "../lib/api";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import type { LeaderboardEntry } from "../../../shared/types";

export default function Leaderboard() {
  const { data: entries = [], isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["leaderboard"],
    queryFn: () => apiGet("/leaderboard"),
  });

  return (
    <Layout>
      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground md:text-2xl">Leaderboard</h1>
          <span className="text-[10px] text-muted-foreground">
            {entries.length} players
          </span>
        </div>
      </section>

      {isLoading ? (
        <div className="rounded-md border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-8 text-center">
          <div className="mb-2 text-3xl">🏆</div>
          <h3 className="mb-1 text-sm font-semibold text-foreground">No predictions</h3>
          <Link
            to="/feed"
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            Browse
          </Link>
        </div>
      ) : (
          <div className="overflow-hidden rounded-md border border-border bg-card">
          <div className="hidden grid-cols-[60px_1fr_100px_100px] border-b border-border px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground md:grid">
            <span>Rank</span>
            <span>Player</span>
            <span className="text-right">Record</span>
            <span className="text-right">Accuracy</span>
          </div>
          {entries.map((e) => (
            <Link
              key={e.user_id}
              to={`/u/${e.username}`}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-accent md:grid-cols-[60px_1fr_100px_100px] md:gap-0"
            >
              <span
                className={`text-sm font-bold tabular-nums md:w-[60px] ${
                  e.rank === 1
                    ? "text-chalk-yellow"
                    : e.rank === 2
                    ? "text-foreground"
                    : e.rank === 3
                    ? "text-chalk-orange"
                    : "text-muted-foreground"
                }`}
              >
                #{e.rank}
              </span>
              <div className="flex min-w-0 items-center gap-2">
                <Avatar
                  src={e.avatar_url}
                  username={e.username}
                  displayName={e.display_name}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  {e.display_name && (
                    <div className="truncate text-sm font-medium text-foreground">
                      {e.display_name}
                    </div>
                  )}
                  <div
                    className={`truncate ${
                      e.display_name
                        ? "text-[10px] text-muted-foreground"
                        : "text-sm font-medium text-foreground"
                    }`}
                  >
                    @{e.username}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5 md:contents">
                <span className="text-right text-sm tabular-nums text-muted-foreground">
                  {e.correct}/{e.total_predictions}
                </span>
                <span className="text-right text-sm font-bold tabular-nums text-success">
                  {e.accuracy_pct.toFixed(1)}%
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  );
}
