import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api";
import Layout from "../components/Layout";

interface Team {
  name: string;
  crest: string;
}

interface Score {
  home: number | null;
  away: number | null;
}

interface Match {
  id: number;
  status: string;
  minute?: number | string;
  homeTeam: Team;
  awayTeam: Team;
  score: {
    fullTime: Score;
    halfTime: Score;
  };
  utcDate: string;
}

export default function LiveScores() {
  const { data: matches = [], isLoading } = useQuery({
    queryKey: ["livescores"],
    queryFn: () => apiGet<Match[]>("/livescores"),
    refetchInterval: 60000, // Poll every minute
  });

  return (
    <Layout>
      <div className="flex flex-col gap-4 pb-20">
        <header className="mb-2">
          <h1 className="text-2xl font-bold tracking-tight">Live Scores</h1>
          <p className="text-sm text-muted-foreground">Real-time match updates</p>
        </header>

        {isLoading ? (
          <div className="flex justify-center p-8 text-muted-foreground">
            Loading matches...
          </div>
        ) : matches.length === 0 ? (
          <div className="rounded-xl border border-border/50 bg-card/30 p-8 text-center text-muted-foreground backdrop-blur-md">
            No matches scheduled for today.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {matches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

function MatchCard({ match }: { match: Match }) {
  const isLive = match.status === "IN_PLAY" || match.status === "PAUSED";
  const isFinished = match.status === "FINISHED" || match.status === "AWARDED";
  
  let statusText = "Upcoming";
  if (isLive) {
    statusText = match.minute ? `${match.minute}'` : "Live";
  } else if (isFinished) {
    statusText = "FT";
  } else if (match.utcDate) {
    const d = new Date(match.utcDate);
    statusText = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  const scoreHome = match.score?.fullTime?.home ?? match.score?.halfTime?.home ?? "-";
  const scoreAway = match.score?.fullTime?.away ?? match.score?.halfTime?.away ?? "-";

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/50 bg-card/30 p-4 backdrop-blur-md transition-all hover:bg-card/50">
      <div className="mb-4 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
            </span>
          )}
          <span className={isLive ? "text-red-500" : ""}>{statusText}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        {/* Home Team */}
        <div className="flex flex-1 flex-col items-center gap-2 text-center">
          <img 
            src={match.homeTeam.crest} 
            alt={match.homeTeam.name} 
            className="h-10 w-10 object-contain drop-shadow-md"
            onError={(e) => { (e.target as HTMLImageElement).src = "/antroph.jpg"; }}
          />
          <span className="text-sm font-semibold sm:text-base line-clamp-2">
            {match.homeTeam.name}
          </span>
        </div>

        {/* Score Box */}
        <div className="flex min-w-[80px] items-center justify-center rounded-lg bg-background/50 px-4 py-2 font-mono text-2xl font-bold shadow-inner">
          <span className={isLive ? "text-primary" : ""}>{scoreHome}</span>
          <span className="mx-2 text-muted-foreground/50">-</span>
          <span className={isLive ? "text-primary" : ""}>{scoreAway}</span>
        </div>

        {/* Away Team */}
        <div className="flex flex-1 flex-col items-center gap-2 text-center">
          <img 
            src={match.awayTeam.crest} 
            alt={match.awayTeam.name} 
            className="h-10 w-10 object-contain drop-shadow-md"
            onError={(e) => { (e.target as HTMLImageElement).src = "/antroph.jpg"; }}
          />
          <span className="text-sm font-semibold sm:text-base line-clamp-2">
            {match.awayTeam.name}
          </span>
        </div>
      </div>
    </div>
  );
}
