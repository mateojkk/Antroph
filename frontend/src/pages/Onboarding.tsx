import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useMemWal } from "../hooks/useMemWal";
import { apiPost, ApiError } from "../lib/api";
import { normalizeAddress, profileKey } from "../lib/profileCache";

function VelaLogo({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className={`flex items-center justify-center rounded-md bg-gradient-to-br from-walrus-purple to-walrus-cyan font-bold text-walrus-deep ${className}`}
      >
        A
      </div>
    );
  }
  return (
    <img
      src="/antroph.jpg"
      className={className}
      alt="Antroph"
      onError={() => setFailed(true)}
    />
  );
}

const PRESET_AVATARS = [
  "⚽", "🏆", "🦅", "🐺", "🦁", "🐉",
  "🔥", "⚡", "💎", "🚀", "👑", "🌟",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function Onboarding() {
  const [step, setStep] = useState<"profile" | "auth">("profile");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState<string>("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [authChecking, setAuthChecking] = useState(false);
  const { user, loading: authLoading, refreshUser } = useAuth();
  const {
    authorized,
    loading: memwalLoading,
    status: memwalStatus,
    error: memwalError,
    authorize,
  } = useMemWal();
  const navigate = useNavigate();

  // If the profile loaded and the user already has a username (e.g., they were
  // redirected here before loadProfile finished), send them straight to Chat.
  useEffect(() => {
    if (!authLoading && user?.username) {
      navigate("/", { replace: true });
    }
  }, [user, authLoading, navigate]);

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (username.length < 3 || username.length > 20) {
      setError("Username must be 3-20 characters");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError("Only letters, numbers, and underscores");
      return;
    }
    if (!displayName.trim() || displayName.trim().length > 8) {
      setError("Display name is required (max 8 characters)");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await apiPost("/profile", {
        email: user?.email,
        username,
        display_name: displayName.trim(),
        avatar_url: avatar || null,
      });

      // Cache the profile immediately so reconnects survive even if the next
      // GET lookup temporarily fails.
      const address = normalizeAddress(user?.email);
      if (address) {
        localStorage.setItem(
          profileKey(address),
          JSON.stringify({
            username,
            display_name: displayName.trim(),
            avatar_url: avatar || null,
            memwal_account_id: null,
          })
        );
      }

      const refreshed = await refreshUser();
      if (!refreshed.username) {
        throw new Error(
          "We saved your profile but couldn't reload it. Please try again."
        );
      }
      // If already authorized, go straight to chat.
      if (authorized) {
        navigate("/");
      } else {
        setStep("auth");
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("That username is taken. Try another one.");
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Couldn't save your profile. Try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleAuthorize() {
    setAuthChecking(true);
    setError("");
    try {
      await authorize();
      const refreshed = await refreshUser();
      if (!refreshed.username) {
        throw new Error(
          "Authorization succeeded but we couldn't reload your profile. Please try again."
        );
      }
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authorization failed");
    } finally {
      setAuthChecking(false);
    }
  }

  const suggestedNames = [
    pickRandom(["Gaffer", "Skipper", "Striker", "Captain"]),
    username ? `${username.slice(0, 4)} FC` : "Boss FC",
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <VelaLogo className="mx-auto mb-4 h-16 w-16 rounded-md object-cover" />
          <h1 className="mb-2 text-2xl font-bold tracking-tight text-foreground md:text-3xl">antroph</h1>
          <p className="text-xs text-muted-foreground">
            {step === "profile" ? "Set up your profile" : "Authorize memory"}
          </p>
        </div>

        <div className="rounded-md border border-border bg-card p-6">
          {step === "profile" ? (
            <form onSubmit={handleProfileSubmit} className="space-y-5">
              {/* Avatar picker */}
              <div>
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Pick an avatar
                </label>
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background text-2xl">
                    {avatar ? (
                      avatar.startsWith("emoji:") ? (
                        <span>{avatar.slice(6)}</span>
                      ) : (
                        <img
                          src={avatar}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      )
                    ) : (
                      <span className="text-sm font-semibold text-muted-foreground">?</span>
                    )}
                  </div>
                  {avatar && (
                    <button
                      type="button"
                      onClick={() => setAvatar("")}
                      className="text-xs text-muted-foreground hover:text-danger"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {PRESET_AVATARS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setAvatar(`emoji:${e}`)}
                      className={`flex h-10 items-center justify-center rounded-md border text-xl transition-colors ${
                        avatar === `emoji:${e}`
                          ? "border-primary bg-accent"
                          : "border-border bg-background hover:bg-accent"
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              {/* Username */}
              <div>
                <label
                  htmlFor="username"
                  className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
                >
                  Username <span className="text-danger">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                    @
                  </span>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    placeholder="yourname"
                    required
                    autoFocus
                    autoComplete="username"
                    className="h-11 w-full rounded-md border border-border bg-background pl-8 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-muted-foreground focus:outline-none"
                  />
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  3-20 chars, a-z 0-9 _
                </p>
              </div>

              {/* Display name */}
              <div>
                <label
                  htmlFor="display_name"
                  className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
                >
                  Display name <span className="text-danger">*</span>
                </label>
                <input
                  id="display_name"
                  name="display_name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Antroph will call you this"
                  maxLength={8}
                  required
                  className="h-11 w-full rounded-md border border-border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-muted-foreground focus:outline-none"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Max 8 characters. Short and punchy.
                </p>
                {username && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {suggestedNames.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setDisplayName(s)}
                        className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[10px] text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !username || !displayName.trim()}
                className="w-full rounded-md border border-muted-foreground/40 bg-foreground py-3 font-semibold text-walrus-deep hover:bg-foreground/90 disabled:opacity-50"
              >
                {loading ? "Setting up..." : "Continue"}
              </button>
            </form>
          ) : (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-2xl">
                🦭
              </div>
              <h2 className="text-lg font-semibold text-foreground">
                Authorize Walrus Memory
              </h2>
              <p className="text-sm text-muted-foreground">
                Antroph stores your takes, predictions, and roast material in your own Walrus Memory account on Mainnet.
                If you don&apos;t have one yet, Antroph will create it, then authorize this device. You&apos;ll pay gas for the on-chain transactions.
              </p>

              {memwalStatus && (
                <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
                  {memwalStatus}
                </p>
              )}

              {(error || memwalError) && (
                <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {error || memwalError}
                </p>
              )}

              <button
                onClick={handleAuthorize}
                disabled={authChecking || memwalLoading}
                className="w-full rounded-md border border-muted-foreground/40 bg-foreground py-3 font-semibold text-walrus-deep hover:bg-foreground/90 disabled:opacity-50"
              >
                {authChecking || memwalLoading ? "Authorizing…" : "Authorize & Meet Antroph"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
