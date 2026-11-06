import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

interface CalledItCard {
  id: string;
  user_pick: string;
  type: string;
  confidence: number;
  created_at: string;
  username: string;
}

interface CalledItData {
  cards: CalledItCard[];
  record: { correct: number; total: number; accuracy: number } | null;
}

export default function CalledIt() {
  const { user } = useAuth();

  const { data } = useQuery<CalledItData>({
    queryKey: ["called_it", user?.email],
    queryFn: () => apiGet(`/called_it?email=${encodeURIComponent(user?.email || "")}`),
    enabled: !!user?.email,
  });

  if (!data || data.cards.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-400">Called It</h3>
      {data.cards.map((card) => (
        <div
          key={card.id}
          className="bg-gradient-to-br from-sky-600/20 to-cyan-600/20 border border-sky-500/30 rounded-2xl p-5"
        >
          <div className="flex items-center gap-3 mb-3">
            <img src="/antroph.jpg" className="w-10 h-10 rounded-full object-cover shadow-md shadow-sky-500/10" alt="Antroph" />
            <div>
              <div className="text-sm font-semibold">@{card.username}</div>
              <div className="text-xs text-slate-500">Called it</div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-lg font-bold text-green-400">✓</div>
              <div className="text-xs text-slate-500">{card.confidence}/10</div>
            </div>
          </div>
          <div className="text-lg font-bold text-white mb-1">{card.user_pick}</div>
          <div className="text-xs text-slate-500">
            {card.type === "match" ? "Match prediction" : "Market prediction"} ·{" "}
            {new Date(card.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </div>
          {data.record && (
            <div className="mt-3 pt-3 border-t border-sky-500/20 text-xs text-slate-400">
              {data.record.correct}/{data.record.total} correct · {data.record.accuracy}% accuracy
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
