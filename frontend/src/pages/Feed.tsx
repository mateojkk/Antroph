import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { apiGet } from "../lib/api";
import type { MarketGroup } from "../../../shared/types";
import Layout from "../components/Layout";
import MarketCard from "../components/MarketCard";
import PredictionModal from "../components/PredictionModal";

interface MatchFixture {
  id: string;
  home_team: string;
  away_team: string;
  home_code: string;
  away_code: string;
  kickoff: string;
  status: string;
  group?: string;
  matchday?: number;
  markets: Array<{ id: string; question: string; yes_price: number; no_price: number; volume: number }>;
}

function formatKickoff(iso: string): string {
  if (!iso) return "TBD";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "TBD";
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < -1) return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (days < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function deriveMatchStatus(kickoff: string): "TIMED" | "LIVE" | "FT" {
  if (!kickoff) return "TIMED";
  const d = new Date(kickoff);
  if (isNaN(d.getTime())) return "TIMED";
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff > 3 * 60 * 60 * 1000) return "FT";
  if (diff > 0) return "LIVE";
  return "TIMED";
}

export default function Feed() {
  const { user } = useAuth();
  const [selectedMarket, setSelectedMarket] = useState<MarketGroup | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const key = "vela_last_resolve";
    const last = localStorage.getItem(key);
    if (last && Date.now() - Number(last) < 600_000) return;
    localStorage.setItem(key, String(Date.now()));
    fetch("/api/resolve", { method: "POST" }).catch(() => {});
  }, []);

  const { data: credibility } = useQuery<{
    resolved_total: number | null;
    by_confidence: Array<{ bucket: string; total: number; correct: number; pct: number | null }>;
    top_users: Array<{ username: string; correct: number; total: number; accuracy: number }>;
    agent_memories: Array<{ text: string }>;
  }>({
    queryKey: ["credibility"],
    queryFn: () => apiGet("/credibility"),
  });

  const { data: markets = [] } = useQuery<MarketGroup[]>({
    queryKey: ["markets"],
    queryFn: () => apiGet("/markets"),
  });

  const { data: profile } = useQuery<{ recent_predictions: Array<{ external_id: string }> }>({
    queryKey: ["profile", user?.username],
    queryFn: () => apiGet(`/profile?username=${user?.username}`),
    enabled: !!user?.username,
  });

  const predictedMarketIds = useMemo(() => {
    if (!profile?.recent_predictions) return new Set<string>();
    return new Set(profile.recent_predictions.map(p => p.external_id));
  }, [profile]);

  const filteredMarkets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return markets;
    return markets.filter((g) => {
      if (g.question.toLowerCase().includes(q)) return true;
      if (g.match?.home.toLowerCase().includes(q)) return true;
      if (g.match?.away.toLowerCase().includes(q)) return true;
      return g.markets.some((m) => m.question.toLowerCase().includes(q));
    });
  }, [markets, search]);

  // Split into match groups (with .match) and pure prediction markets
  const matchGroups = useMemo(
    () => filteredMarkets.filter((g) => !!g.match),
    [filteredMarkets]
  );
  const predictionGroups = useMemo(
    () => filteredMarkets.filter((g) => !g.match),
    [filteredMarkets]
  );

  const trending = filteredMarkets.slice(0, 10);

  // Build fixtures view from match groups (hide matches that finished >3h ago).
  const fixtures: MatchFixture[] = useMemo(
    () =>
      matchGroups
        .filter((g) => g.match)
        .slice(0, 12)
        .map((g) => ({
          id: g.id,
          home_team: g.match!.home,
          away_team: g.match!.away,
          home_code: g.match!.home.slice(0, 3).toUpperCase(),
          away_code: g.match!.away.slice(0, 3).toUpperCase(),
          kickoff: g.markets[0]?.game_start_time || g.end_date || "",
          status: deriveMatchStatus(g.markets[0]?.game_start_time || g.end_date || ""),
          group: undefined,
          matchday: undefined,
          markets: g.markets,
        }))
        .filter((f) => f.status !== "FT"),
    [matchGroups]
  );

  return (
    <Layout showSearch searchValue={search} onSearchChange={setSearch}>
      {/* Trending Markets */}
      <section className="mb-6 md:mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Trending
          </h2>
          <span className="text-[10px] text-muted-foreground">
            {markets.length} markets
          </span>
        </div>

        {filteredMarkets.length === 0 && markets.length === 0 ? (
          <div className="rounded-md border border-border bg-card p-8 text-center">
            <div className="mb-2 text-3xl">⚽</div>
            <h3 className="text-sm font-semibold text-foreground">No markets</h3>
          </div>
        ) : filteredMarkets.length === 0 ? (
          <div className="rounded-md border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No match.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3">
            {trending.map((m) => (
              <MarketCard
                key={m.id}
                group={m}
                onClick={() => setSelectedMarket(m)}
                isPredicted={m.markets.some(market => predictedMarketIds.has(market.id))}
              />
            ))}
          </div>
        )}
      </section>

      {/* What Vela learned today — scorecard aggregate from the resolve cron */}
      {credibility && (credibility.resolved_total === null || credibility.resolved_total > 0) && (
        <section className="mb-6 md:mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              What Antroph learned
            </h2>
            {credibility.resolved_total !== null && (
              <span className="text-[10px] text-muted-foreground">
                {credibility.resolved_total} resolved picks on mainnet
              </span>
            )}
          </div>
          <div className="rounded-md border border-border bg-card p-4">
            {/* Confidence learning curve */}
            {credibility.by_confidence?.length > 0 && (
              <div className="mb-3 grid grid-cols-3 gap-2">
                {credibility.by_confidence
                  .map((b) => ({ ...b, label: b.bucket === "low" ? "Low conf" : b.bucket === "mid" ? "Mid conf" : "High conf" }))
                  .filter((b) => b.total > 0)
                  .map((b) => (
                    <div key={b.bucket} className="rounded p-2 border border-border">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{b.label}</div>
                      <div className="text-sm font-bold text-foreground font-mono">
                        {b.pct !== null ? `${b.pct}%` : "—"}
                      </div>
                      <div className="text-[9px] text-muted-foreground">{b.correct}/{b.total} correct</div>
                    </div>
                  ))}
              </div>
            )}
            {/* Lessons recalled from the Vela agent's Walrus Memory */}
            {credibility.agent_memories?.length > 0 && (
              <div className="space-y-1.5">
                {credibility.agent_memories.slice(0, 3).map((m, i) => (
                  <div key={i} className="text-xs text-muted-foreground leading-snug">
                    <span className="text-[10px] font-mono text-muted-foreground/60 mr-1.5">#</span>
                    {m.text}
                  </div>
                ))}
              </div>
            )}
            {credibility.by_confidence?.length === 0 && credibility.agent_memories?.length === 0 && (
              <div className="text-xs text-muted-foreground">
                No resolutions yet. Scorecards land here as matches finish.
              </div>
            )}
          </div>
        </section>
      )}

      {/* Fixtures from football-data.org */}
      {fixtures.length > 0 && (
        <section className="mb-6 md:mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Fixtures
            </h2>
            <span className="text-[10px] text-muted-foreground">
              {fixtures.length} matches
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {fixtures.map((f) => (
              <button
                key={f.id}
                onClick={f.markets.some(m => predictedMarketIds.has(m.id)) ? undefined : () => {
                  const group = matchGroups.find((g) => g.id === f.id);
                  if (group) setSelectedMarket(group);
                }}
                disabled={f.markets.some(m => predictedMarketIds.has(m.id))}
                className={`rounded-md border border-border p-3 text-left transition-colors ${
                  f.markets.some(m => predictedMarketIds.has(m.id))
                    ? "bg-card/50 cursor-not-allowed opacity-60"
                    : "bg-card hover:border-muted-foreground/40"
                }`}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span
                    className={`text-[10px] font-bold tracking-wider ${
                      f.markets.some(m => predictedMarketIds.has(m.id))
                        ? "text-primary"
                        : f.status === "LIVE"
                        ? "text-danger"
                        : "text-primary"
                    }`}
                  >
                    {f.markets.some(m => predictedMarketIds.has(m.id)) ? "PREDICTED ✓" : f.status === "LIVE" ? "LIVE" : "UPCOMING"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {f.kickoff ? formatKickoff(f.kickoff) : "TBD"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 text-right">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {f.home_team}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {f.home_code}
                    </div>
                  </div>
                  <div className="px-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    vs
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {f.away_team}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {f.away_code}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Pure prediction markets (e.g., "Will Brazil win the WC?") */}
      {predictionGroups.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Tournament Futures
            </h2>
            <span className="text-xs text-muted-foreground">View all</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {predictionGroups.slice(0, 8).map((m) => (
              <MarketCard
                key={m.id}
                group={m}
                onClick={() => setSelectedMarket(m)}
                isPredicted={m.markets.some(market => predictedMarketIds.has(market.id))}
              />
            ))}
          </div>
        </section>
      )}

      {markets.length === 0 && (
        <div className="py-16 text-center">
          <div className="mb-3 text-5xl">⚽</div>
          <h3 className="mb-1 text-lg font-semibold text-foreground">
            Tournament starts soon
          </h3>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            Once matches kick off, you'll find prediction markets and live fixtures here.
          </p>
        </div>
      )}

      {selectedMarket && user && (
        <PredictionModal
          marketGroup={selectedMarket}
          user={user}
          onClose={() => setSelectedMarket(null)}
        />
      )}
    </Layout>
  );
}
