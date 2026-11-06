export interface User {
  id: string;
  email: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  created_at: string;
}

export interface LeaderboardEntry {
  user_id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  accuracy_pct: number;
  total_predictions: number;
  correct: number;
  rank: number;
}

export interface Prediction {
  id: string;
  user_id: string;
  type: "match" | "market";
  external_id: string;
  user_pick: string;
  confidence: number;
  resolved: boolean;
  outcome: "correct" | "incorrect" | null;
  home_team: string | null;
  away_team: string | null;
  question: string | null;
  take: string | null;
  created_at: string;
}

export interface Fixture {
  id: string;
  home_team: string;
  away_team: string;
  home_code: string;
  away_code: string;
  kickoff: string;
  status: string;
  group?: string;
  matchday?: number;
  markets?: Array<{
    id: string;
    question: string;
    yes_price: number;
    no_price: number;
    volume: number;
  }>;
}

export interface MarketSubMarket {
  id: string;
  question: string;
  yes_price: number;
  no_price: number;
  volume: number;
  image?: string;
  end_date?: string;
  game_start_time?: string;
  closed?: boolean;
  active?: boolean;
}

export interface MarketGroup {
  id: string;
  question: string;
  slug: string;
  image: string;
  end_date: string;
  volume: number;
  match?: { home: string; away: string } | null;
  markets: MarketSubMarket[];
}

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatSession {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}
