import { useState, useEffect } from "react";
import { apiPost } from "../lib/api";
import { useMemWal } from "../hooks/useMemWal";
import ShareButton from "./ShareButton";
import type { MarketGroup, MarketSubMarket } from "../../../shared/types";

interface Props {
  marketGroup: MarketGroup | null;
  user: { email: string };
  onClose: () => void;
}

interface OutcomeOption {
  id: string;
  label: string;
  subMarket: MarketSubMarket;
  side: "yes" | "no";
  probability: number;
}

function buildOptionsForGroup(group: MarketGroup): OutcomeOption[] {
  const out: OutcomeOption[] = [];
  const match = group.match;
  const subs = group.markets || [];

  if (match) {
    for (const m of subs) {
      // handlers/markets.py sets questions like "Home to Win", "Draw", "Away to Win"
      let label = m.question;
      if (label.endsWith(" to Win")) {
        label = label.slice(0, -7);
      }
      out.push({
        id: m.id,
        label,
        subMarket: m,
        side: "yes",
        probability: m.yes_price,
      });
    }
  }
  return out;
}

export default function PredictionModal({ marketGroup, user, onClose }: Props) {
  const { memwal, authorized, remember } = useMemWal();
  const [selected, setSelected] = useState<OutcomeOption | null>(null);
  const [confidence, setConfidence] = useState(5);
  const [take, setTake] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ pred_id: string } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!marketGroup) return null;

  const options = buildOptionsForGroup(marketGroup);
  const match = marketGroup.match;
  const isMatch = !!match;

  // Deduplicate by label for display (one entry per outcome)
  const seen = new Set<string>();
  const uniqueOptions = options.filter((o) => {
    if (seen.has(o.id)) return false;
    seen.add(o.id);
    return true;
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setLoading(true);
    try {
      const data = await apiPost<{
        prediction_id: string;
        memory_texts: {
          remember: string;
          analyze: string;
          vela_remember: string | null;
          vela_analyze: string | null;
        };
      }>("/predict", {
        user_email: user.email,
        type: "market",
        external_id: selected.subMarket.id,
        user_pick: selected.label,
        confidence,
        take: take || undefined,
        question: marketGroup!.question,
        market_id: marketGroup!.id,
        market_question: marketGroup!.question,
        side: selected.side,
        price_at_prediction: selected.probability,
        is_match: isMatch,
        home_team: match?.home,
        away_team: match?.away,
      });
      setResult({ pred_id: data.prediction_id });

      // Write prediction memories to Walrus from the frontend.
      if (memwal && authorized) {
        const { memory_texts } = data;
        const writes: Promise<unknown>[] = [
          remember(memory_texts.remember),
          remember(memory_texts.analyze),
        ];
        if (memory_texts.vela_remember) {
          writes.push(remember(memory_texts.vela_remember));
        }
        if (memory_texts.vela_analyze) {
          writes.push(remember(memory_texts.vela_analyze));
        }
        Promise.all(writes).catch((err) => {
          console.error("Prediction memory write failed:", err);
        });
      }
    } catch {
      setError("Something broke. Even predictions have off days. Try again.");
    }
    setLoading(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-md border border-border bg-card p-5 sm:rounded-md sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {result ? (
          <div className="py-8 text-center">
            <img
              src="/antroph.jpg"
              className="mx-auto mb-4 h-12 w-12 rounded-md object-cover"
              alt="Antroph"
            />
            <h3 className="mb-2 text-lg font-semibold text-foreground">
              Prediction locked in
            </h3>
            <p className="mb-3 text-sm text-muted-foreground">
              You picked{" "}
              <span className="font-semibold text-foreground">
                {selected?.label}
              </span>{" "}
              for{" "}
              <span className="font-semibold text-foreground">
                {marketGroup.question}
              </span>
              . Come back later to see if you were right.
            </p>
            <button
              onClick={onClose}
              className="rounded-md border border-border bg-background px-6 py-2 text-foreground hover:bg-accent"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Header */}
            <div className="mb-4 flex items-center gap-3">
              {marketGroup.image ? (
                <img
                  src={marketGroup.image}
                  className="h-10 w-10 shrink-0 rounded-md border border-border object-cover"
                  alt=""
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-background text-lg">
                  ⚽
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-semibold text-foreground">
                  {marketGroup.question}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {isMatch ? "Match prediction" : "Prediction market"}
                </p>
              </div>
              <ShareButton
                url={`${window.location.origin}/api/og?type=market&id=${encodeURIComponent(marketGroup.markets[0]?.id || marketGroup.id)}`}
                title={marketGroup.question}
                text={`${marketGroup.question} on Antroph.`}
              />
            </div>

            {/* Match-up display */}
            {isMatch && match && (
              <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-md border border-border bg-background p-4">
                <div className="text-center">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {match.home}
                  </div>
                </div>
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  vs
                </div>
                <div className="text-center">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {match.away}
                  </div>
                </div>
              </div>
            )}

            {/* Outcome options */}
            <div className="mb-4">
              <label className="mb-2 block text-sm text-muted-foreground">
                Your pick
              </label>
              {uniqueOptions.length === 0 ? (
                <div className="rounded-md border border-border bg-background p-3 text-center text-xs text-muted-foreground">
                  No outcomes available for this market yet.
                </div>
              ) : (
                <div className={`grid gap-2 ${isMatch && uniqueOptions.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                  {uniqueOptions.map((opt) => {
                    const isYes = opt.side === "yes";
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSelected(opt)}
                        className={`relative rounded-md border px-3 py-3 text-sm font-medium transition-colors ${
                          selected?.id === opt.id
                            ? isYes
                              ? "border-success/60 bg-success/10 text-foreground"
                              : "border-danger/60 bg-danger/10 text-foreground"
                            : "border-border bg-background text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                        }`}
                      >
                        <div className="truncate text-center">{opt.label}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>


            <div className="mb-4">
              <label className="mb-2 block text-sm text-muted-foreground">
                Confidence:{" "}
                <span className="font-medium text-foreground">
                  {confidence}/10
                </span>
              </label>
              <input
                type="range"
                min={1}
                max={10}
                value={confidence}
                onChange={(e) => setConfidence(Number(e.target.value))}
                className="w-full accent-sky-500"
              />
            </div>

            <div className="mb-6">
              <label className="mb-2 block text-sm text-muted-foreground">
                Hot take{" "}
                <span className="opacity-60">(optional)</span>
              </label>
              <textarea
                value={take}
                onChange={(e) => setTake(e.target.value)}
                placeholder="e.g. Mbappe is overrated at tournaments"
                rows={2}
                className="w-full resize-none rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-muted-foreground focus:outline-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-md border border-border bg-background py-3 text-muted-foreground hover:border-muted-foreground/40"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!selected || loading}
                className="flex-1 rounded-md border border-border bg-background py-3 font-medium text-foreground hover:border-muted-foreground/40 hover:bg-accent disabled:opacity-50"
              >
                {loading ? "Antroph is storing..." : "Lock it in"}
              </button>
            </div>
            {error && (
              <p className="mt-3 text-center text-sm text-danger">{error}</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
