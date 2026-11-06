import type { MarketGroup } from "../../../shared/types";

interface MarketCardProps {
  group: MarketGroup;
  onClick?: () => void;
  isPredicted?: boolean;
}


function formatEndDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function MarketCard({ group, onClick, isPredicted }: MarketCardProps) {
  if (!group.markets || group.markets.length === 0) return null;

  const isStarted = group.markets.some((m) => {
    if (!m.game_start_time) return false;
    // eslint-disable-next-line react-hooks/purity
    return new Date(m.game_start_time).getTime() < Date.now();
  });
  const isClosed = group.markets.some((m) => m.closed || !m.active);
  const isLocked = isStarted || isClosed || isPredicted;

  return (
    <button
      onClick={isLocked ? undefined : onClick}
      disabled={isLocked}
      className={`group w-full rounded-md border border-border p-3 text-left transition-colors md:p-4 ${
        isLocked
          ? "bg-card/50 cursor-not-allowed opacity-60"
          : "bg-card active:scale-[0.99] hover:border-muted-foreground/40 hover:bg-accent"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-background md:h-14 md:w-14">
          {group.image ? (
            <img
              src={group.image}
              alt=""
              className={`h-full w-full object-cover ${isLocked ? "grayscale" : ""}`}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className={`flex h-full w-full items-center justify-center text-lg md:text-xl ${isLocked ? "grayscale opacity-50" : ""}`}>
              ⚽
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
            {group.question}
          </h3>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground md:text-xs">
            {group.end_date && (
              <span>{formatEndDate(group.end_date)}</span>
            )}
            {group.markets.length > 1 && (
              <>
                <span>·</span>
                <span>{group.markets.length} outcomes</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end">
        {isPredicted ? (
          <span className="rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary md:px-3 md:text-xs">
            Predicted ✓
          </span>
        ) : isLocked ? (
          <span className="rounded-md border border-border bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground md:px-3 md:text-xs">
            {isClosed ? "Closed" : "Started"}
          </span>
        ) : (
          <span className="rounded-md border border-border bg-background px-2.5 py-1 text-[10px] font-medium text-foreground transition-colors group-hover:border-muted-foreground/40 group-hover:bg-accent md:px-3 md:text-xs">
            Predict
          </span>
        )}
      </div>
    </button>
  );
}
