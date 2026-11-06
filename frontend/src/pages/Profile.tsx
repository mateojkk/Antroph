import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../lib/api";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import EditProfileModal from "../components/EditProfileModal";
import ShareImageModal from "../components/ShareImageModal";
import { useAuth } from "../hooks/useAuth";

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
    outcome: string | null;
    created_at: string;
  }>;
  recent_chats: Array<{
    message: string;
    reply: string;
  }>;
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

export default function Profile() {
  const { username } = useParams<{ username: string }>();
  const { user: authUser, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState("");
  const [sharePrediction, setSharePrediction] = useState<ProfileData["recent_predictions"][0] | null>(null);

  const { data, isLoading } = useQuery<ProfileData>({
    queryKey: ["profile", username],
    queryFn: () => apiGet(`/profile?username=${username}`),
    enabled: !!username,
    refetchInterval: 30_000,
  });

  const isOwnProfile = authUser?.username === username;

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="text-sm text-muted-foreground">Loading…</div>
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <div className="py-20 text-center">
          <h1 className="mb-2 text-xl font-bold">Not found</h1>
          <Link to="/" className="text-sm text-primary hover:underline">
            Home
          </Link>
        </div>
      </Layout>
    );
  }

  const { user, record, recent_predictions, recent_chats } = data;


  async function handleCheckResolutions() {
    setChecking(true);
    setCheckMessage("");
    try {
      const res = await apiPost<{ resolved: number; checked: number }>(
        "/resolve",
        {}
      );
      setCheckMessage(
        res.resolved > 0
          ? `Updated ${res.resolved} prediction${res.resolved === 1 ? "" : "s"}.`
          : "No new results yet — your open predictions haven't resolved."
      );
      queryClient.invalidateQueries({ queryKey: ["profile", username] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    } catch (err) {
      setCheckMessage(
        err instanceof Error ? err.message : "Couldn't check for updates."
      );
    } finally {
      setChecking(false);
    }
  }

  return (
    <Layout>
      <section className="mb-6">
        <div className="mb-5 flex items-start gap-3 md:gap-4">
          <Avatar
            src={user.avatar_url}
            username={user.username}
            displayName={user.display_name}
            size="xl"
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold text-foreground md:text-2xl">
              {user.display_name || `@${user.username}`}
            </h1>
            {user.display_name && (
              <p className="text-xs text-muted-foreground md:text-sm">@{user.username}</p>
            )}
            {isOwnProfile && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-md border border-border bg-background px-2.5 py-1 text-[10px] font-medium text-foreground hover:border-muted-foreground/40 hover:bg-accent md:px-3 md:text-xs"
                >
                  Edit
                </button>
                <button
                  onClick={handleCheckResolutions}
                  disabled={checking}
                  className="rounded-md border border-border bg-background px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground disabled:opacity-50 md:px-3 md:text-xs"
                  title="Refresh resolved predictions"
                >
                  {checking ? "…" : "Refresh"}
                </button>
              </div>
            )}
          </div>
          <ProfileCopyButton username={user.username} />
        </div>

        {isOwnProfile && checkMessage && (
          <p className="mb-4 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
            {checkMessage}
          </p>
        )}

        <div className="grid grid-cols-3 gap-2 md:gap-3">
          <div className="rounded-md border border-border bg-card p-3 text-center md:p-4">
            <div className="text-lg font-bold tabular-nums text-foreground md:text-2xl">
              {record.accuracy_pct.toFixed(1)}%
            </div>
            <div className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground md:text-[10px]">
              Acc
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-3 text-center md:p-4">
            <div className="text-lg font-bold tabular-nums text-foreground md:text-2xl">
              #{record.rank || "—"}
            </div>
            <div className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground md:text-[10px]">
              Rank
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-3 text-center md:p-4">
            <div className="text-lg font-bold tabular-nums text-foreground md:text-2xl">
              {record.correct}/{record.total_predictions}
            </div>
            <div className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground md:text-[10px]">
              Rec
            </div>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Predictions
          </h2>
          {record.total_predictions > 0 && (
            <Link
              to={`/u/${user.username}/predictions`}
              className="text-[10px] font-semibold text-primary hover:opacity-80"
            >
              All {record.total_predictions} →
            </Link>
          )}
        </div>
        {recent_predictions.length === 0 ? (
          <div className="rounded-md border border-border bg-card p-5 text-center text-xs text-muted-foreground">
            No predictions yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {recent_predictions.map((p) => {
              const isMatch = p.type === "match" && p.home_team && p.away_team;
              const context = isMatch
                ? `${p.home_team} vs ${p.away_team}`
                : p.question || (p.type === "match" ? "Match" : "Market");
              return (
                <div
                  key={p.id}
                  className="relative flex flex-col justify-between rounded-md border border-border bg-card p-4 transition-colors hover:border-muted-foreground/40"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {isMatch ? "Match Prediction" : "Market"}
                      </div>
                      <div className="truncate text-base font-semibold text-foreground">
                        {context}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSharePrediction(p);
                      }}
                      className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                      aria-label="Share"
                      title="Share"
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7" />
                        <polyline points="16 6 12 2 8 6" />
                        <line x1="12" y1="2" x2="12" y2="15" />
                      </svg>
                      Share
                    </button>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <span className="truncate rounded-md bg-accent px-2 py-1 text-xs font-medium text-foreground">
                      Pick: {p.user_pick}
                    </span>
                    <span
                      className={`text-xs font-bold uppercase tracking-widest ${outcomeColor(p.outcome)}`}
                    >
                      {outcomeLabel(p.outcome)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {recent_chats && recent_chats.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Chats
          </h2>
          <div className="space-y-2">
            {recent_chats.map((c, idx) => (
              <div
                key={idx}
                className="rounded-md border border-border bg-card p-3 hover:border-muted-foreground/40"
              >
                <p className="mb-1 truncate text-xs text-muted-foreground">{c.message}</p>
                <p className="truncate text-sm text-foreground">{c.reply}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {editing && isOwnProfile && authUser?.email && (
        <EditProfileModal
          currentDisplayName={user.display_name}
          currentAvatarUrl={user.avatar_url}
          username={user.username}
          email={authUser.email}
          onClose={() => setEditing(false)}
          onSaved={(updates) => {
            queryClient.invalidateQueries({ queryKey: ["profile", username] });
            // Also update auth user in-memory so the Layout reflects changes immediately
            window.dispatchEvent(new CustomEvent("vela:user-updated", { detail: updates }));
          }}
        />
      )}

      {isOwnProfile && (
        <section className="mt-10 hidden border-t border-border pt-6 md:block">
          <button
            onClick={() => {
              signOut();
              navigate("/login");
            }}
            className="w-full rounded-md border border-danger/40 bg-danger/10 py-2.5 text-sm font-medium text-danger hover:bg-danger/20"
          >
            Sign out
          </button>
        </section>
      )}


      {sharePrediction && (
        <ShareImageModal
          prediction={sharePrediction}
          username={user.username}
          displayName={user.display_name}
          avatarUrl={user.avatar_url}
          onClose={() => setSharePrediction(null)}
        />
      )}
    </Layout>
  );
}

function ProfileCopyButton({ username }: { username: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/u/${encodeURIComponent(username)}`;
  
  function handleCopy() {
    try {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
      </svg>
      {copied ? "Copied!" : "Copy Link"}
    </button>
  );
}
