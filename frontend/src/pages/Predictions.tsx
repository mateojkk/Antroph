import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import { getDisplayName } from "../lib/displayName";

interface ProfileData {
  user: {
    id?: string;
    username: string;
    display_name?: string | null;
    avatar_url?: string | null;
    created_at: string;
  };
  record: { accuracy_pct: number; total_predictions: number; correct: number; rank: number };
  recent_predictions: Array<{
    id: string;
    type: string;
    user_pick: string;
    home_team: string | null;
    away_team: string | null;
    question: string | null;
    take: string | null;
    outcome: string | null;
    resolved: boolean;
    created_at: string;
    confidence: number;
  }>;
  recent_chats: unknown[];
}

type Filter = "all" | "correct" | "incorrect" | "pending" | "match" | "market";

function HitRateChart({ data }: { data: { correct: number; incorrect: number; pending: number } }) {
  const total = data.correct + data.incorrect + data.pending;
  if (total === 0) return null;
  const correctPct = (data.correct / total) * 100;
  const incorrectPct = (data.incorrect / total) * 100;
  const pendingPct = (data.pending / total) * 100;
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Hit rate
        </h3>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {data.correct}/{data.correct + data.incorrect} settled
        </span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-border">
        <div
          className="bg-success transition-all"
          style={{ width: `${correctPct}%` }}
          title={`${data.correct} correct`}
        />
        <div
          className="bg-danger transition-all"
          style={{ width: `${incorrectPct}%` }}
          title={`${data.incorrect} incorrect`}
        />
        <div
          className="bg-muted-foreground/40 transition-all"
          style={{ width: `${pendingPct}%` }}
          title={`${data.pending} pending`}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px]">
        <span className="text-success">● Hit {data.correct}</span>
        <span className="text-danger">● Miss {data.incorrect}</span>
        <span className="text-muted-foreground">● Open {data.pending}</span>
      </div>
    </div>
  );
}

function outcomeColor(o: string | null): string {
  if (o === "correct") return "text-success";
  if (o === "incorrect") return "text-danger";
  return "text-muted-foreground";
}

function outcomeLabel(o: string | null): string {
  if (o === "correct") return "Hit";
  if (o === "incorrect") return "Miss";
  return "Pending";
}

export default function Predictions() {
  const { username } = useParams<{ username: string }>();
  const [filter, setFilter] = useState<Filter>("all");

  const { data, isLoading } = useQuery<ProfileData>({
    queryKey: ["profile", username],
    queryFn: () => apiGet(`/profile?username=${username}`),
    enabled: !!username,
  });

  const all = useMemo(() => data?.recent_predictions ?? [], [data]);
  // The /profile endpoint returns the most recent 20 predictions — enough for
  // this view; deeper history can be paginated later.

  const counts = useMemo(() => {
    const c = { all: all.length, correct: 0, incorrect: 0, pending: 0, match: 0, market: 0 };
    for (const p of all) {
      if (p.outcome === "correct") c.correct++;
      else if (p.outcome === "incorrect") c.incorrect++;
      else c.pending++;
      if (p.type === "match") c.match++;
      else c.market++;
    }
    return c;
  }, [all]);

  const filtered = useMemo(() => {
    return all.filter((p) => {
      if (filter === "correct") return p.outcome === "correct";
      if (filter === "incorrect") return p.outcome === "incorrect";
      if (filter === "pending") return !p.resolved;
      if (filter === "match") return p.type === "match";
      if (filter === "market") return p.type === "market";
      return true;
    });
  }, [all, filter]);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="text-sm text-muted-foreground">Loading predictions...</div>
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <div className="py-20 text-center">
          <h1 className="mb-2 text-2xl font-bold">User not found</h1>
          <Link to="/" className="text-sm text-primary hover:underline">
            Go back to Antroph
          </Link>
        </div>
      </Layout>
    );
  }

  const u = data.user;
  const title = getDisplayName(u.display_name, u.username);
  const accuracy = data.record.accuracy_pct;
  const accuracyColor =
    accuracy >= 60 ? "text-success" : accuracy >= 40 ? "text-warning" : accuracy > 0 ? "text-danger" : "text-muted-foreground";

  return (
    <Layout>
      <section className="mb-6">
        <div className="mb-4 flex items-center gap-3">
          <Avatar
            src={u.avatar_url}
            username={u.username}
            displayName={u.display_name}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold text-foreground">
              {title}'s Predictions
            </h1>
            <p className="text-sm text-muted-foreground">
              {counts.all === 0
                ? "No predictions yet"
                : `${counts.all} total · ${counts.correct} hit · ${counts.incorrect} miss`}
            </p>
          </div>
        </div>

        {/* Stat row */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md border border-border bg-card p-4 text-center">
            <div className={`text-2xl font-bold tabular-nums ${accuracyColor}`}>
              {data.record.accuracy_pct.toFixed(1)}%
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Accuracy
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-4 text-center">
            <div className="text-2xl font-bold tabular-nums text-foreground">
              #{data.record.rank || "—"}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Rank
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-4 text-center">
            <div className="text-2xl font-bold tabular-nums text-success">
              {counts.correct}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Hits
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-4 text-center">
            <div className="text-2xl font-bold tabular-nums text-danger">
              {counts.incorrect}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Misses
            </div>
          </div>
        </div>

        {/* Hit rate bar */}
        {counts.all > 0 && (
          <div className="mb-5">
            <HitRateChart data={counts} />
          </div>
        )}

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          {([
            { k: "all", label: "All", n: counts.all },
            { k: "correct", label: "Hits", n: counts.correct },
            { k: "incorrect", label: "Misses", n: counts.incorrect },
            { k: "pending", label: "Open", n: counts.pending },
            { k: "match", label: "Matches", n: counts.match },
            { k: "market", label: "Markets", n: counts.market },
          ] as { k: Filter; label: string; n: number }[]).map((opt) => (
            <button
              key={opt.k}
              onClick={() => setFilter(opt.k)}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === opt.k
                  ? "border-muted-foreground/40 bg-accent text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
              }`}
            >
              {opt.label}
              <span className="font-mono tabular-nums text-muted-foreground">
                {opt.n}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Predictions list */}
      {filtered.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-10 text-center">
          <div className="mb-2 text-3xl">🎯</div>
          <h3 className="mb-1 text-sm font-semibold text-foreground">
            No predictions {filter === "all" ? "yet" : `in this filter`}
          </h3>
          <p className="text-xs text-muted-foreground">
            {filter === "all"
              ? "Chat with Antroph and lock in a call to get started."
              : "Try a different filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => {
            const context =
              p.type === "match" && p.home_team && p.away_team
                ? `${p.home_team} vs ${p.away_team}`
                : p.question || (p.type === "match" ? "Match" : "Market");
            return (
              <div
                key={p.id}
                className="rounded-md border border-border bg-card p-4 hover:border-muted-foreground/40"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-widest ${
                          p.type === "match" ? "text-primary" : "text-chalk-yellow"
                        }`}
                      >
                        {p.type}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        ·{" "}
                        {new Date(p.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-sm font-medium text-foreground">
                      {context}
                    </div>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold ${outcomeColor(p.outcome)}`}>
                    {outcomeLabel(p.outcome)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    Picked{" "}
                    <span className="font-semibold text-foreground">{p.user_pick}</span>
                  </span>
                  {p.confidence != null && (
                    <span className="rounded border border-border px-1.5 py-0.5 font-mono tabular-nums">
                      {p.confidence}/10
                    </span>
                  )}
                </div>
                {p.take && (
                  <p className="mt-2 border-t border-border pt-2 text-xs italic text-muted-foreground">
                    "{p.take}"
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-right text-[10px] text-muted-foreground">
        Predictions resolve within minutes of the event closing;
        the leaderboard refreshes hourly.
      </p>
    </Layout>
  );
}
