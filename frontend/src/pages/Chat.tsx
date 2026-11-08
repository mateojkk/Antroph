import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "../hooks/useAuth";
import { useMemWal } from "../hooks/useMemWal";
import { apiGet, apiStream } from "../lib/api";
import type { AgentMessage, ChatSession } from "../../../shared/types";
import Layout from "../components/Layout";

interface BriefData {
  date: string;
  matches: Array<{
    id: string;
    home: string;
    away: string;
    kickoff: string;
    status: string;
  }>;
  vela_takes: Array<{ match: string; take: string }>;
  total_predictions: number;
  accuracy: number;
  rank: number;
}

interface MemoryContext {
  relevant_memories: string[];
  recent_memories: string[];
  failed_predictions: string[];
  user_opinions: string[];
  vela_predictions: string[];
}

function formatRelative(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function Chat() {
  const { user } = useAuth();
  const {
    authorized,
    loading: memwalLoading,
    error: memwalError,
    authorize,
    remember,
    recall,
    clearError,
  } = useMemWal();
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [showBrief, setShowBrief] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [authChecking, setAuthChecking] = useState(false);
  const [memoryStatus, setMemoryStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const sessionsRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (sessionsRef.current && !sessionsRef.current.contains(e.target as Node)) {
        setSessionsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!user?.email) return;
    let cancelled = false;
    apiGet<BriefData>(`/brief?email=${encodeURIComponent(user.email)}`)
      .then((data) => {
        if (!cancelled) setBrief(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  const loadSessions = useCallback(async () => {
    if (!user?.email) return;
    setSessionsLoading(true);
    try {
      const data = await apiGet<{ sessions: ChatSession[] }>("/chat");
      setSessions(data.sessions || []);
    } catch {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, [user?.email]);

  const refreshSessions = useCallback(async () => {
    if (!user?.email) return;
    try {
      const data = await apiGet<{ sessions: ChatSession[] }>("/chat");
      setSessions(data.sessions || []);
    } catch {
      // ignore
    }
  }, [user?.email]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSessions();
  }, [loadSessions]);

  async function loadSession(sessionId: string) {
    setLoading(true);
    setSessionsOpen(false);
    try {
      const data = await apiGet<{ session: ChatSession; messages: AgentMessage[] }>(
        `/chat?session=${encodeURIComponent(sessionId)}`
      );
      setActiveSessionId(data.session.id);
      setMessages(data.messages || []);
      setShowBrief(false);
    } catch (err) {
      console.error("Failed to load session", err);
    }
    setLoading(false);
    inputRef.current?.focus();
  }

  function startNewChat() {
    setActiveSessionId(null);
    setMessages([]);
    setShowBrief(false);
    setSessionsOpen(false);
    inputRef.current?.focus();
  }

  async function buildMemoryContext(
    message: string,
    history: AgentMessage[]
  ): Promise<MemoryContext> {
    // Pronouns ("he", "they") match better when the last few turns ride along.
    const recentContext = history
      .slice(-3)
      .map((m) => m.content)
      .join(" ");
    const queryContext = recentContext ? `${recentContext} ${message}` : message;
    const empty = { results: [] as { text: string }[] };

    // Each recall is capped. A slow Walrus query must not hold the reply.
    const bounded = (query: string, limit: number) =>
      Promise.race([
        recall(query, { limit }).catch(() => empty),
        new Promise<typeof empty>((resolve) => setTimeout(() => resolve(empty), 700)),
      ]);

    const [relevant, recent, antroph, older, opinions, vela] = await Promise.all([
      bounded(queryContext, 6),
      bounded(`User said: ${queryContext}`, 4),
      bounded(`Antroph replied: ${queryContext}`, 4),
      bounded(`Vela replied: ${queryContext}`, 4),
      bounded("User said: I think feel believe opinion", 4),
      bounded("Antroph replied: prediction pick call", 4),
    ]);

    const texts = (r: { results: { text: string }[] }) => r.results.map((m) => m.text);
    const unique = (arr: string[]) => Array.from(new Set(arr));

    return {
      relevant_memories: unique([...texts(relevant), ...texts(recent), ...texts(antroph), ...texts(older)]),
      recent_memories: [],
      failed_predictions: [],
      user_opinions: unique(texts(opinions)),
      vela_predictions: unique(texts(vela)),
    };
  }

  async function sendMessage(text?: string) {
    const msg = text || input.trim();
    if (!msg || loading) return;

    const userMsg: AgentMessage = { role: "user", content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setShowBrief(false);

    try {
      let memoryContext: MemoryContext | undefined;
      if (authorized) {
        try {
          memoryContext = await buildMemoryContext(msg, messages);
        } catch (err) {
          console.error("Memory recall failed:", err);
        }
      }

      let streamedReply = "";

      let finalSessionId = activeSessionId;

      await apiStream(
        "/agent_stream",
        {
          user_email: user?.email,
          message: msg,
          session_id: activeSessionId,
          conversation_history: messages.slice(-10),
          memory_context: memoryContext,
        },
        // onDelta — append each token to the last message in place
        (token) => {
          streamedReply += token;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              const next = [...prev];
              next[next.length - 1] = { role: "assistant", content: streamedReply };
              return next;
            }
            return [...prev, { role: "assistant", content: streamedReply }];
          });
        },
        // onDone — capture session id
        (sessionId) => {
          finalSessionId = sessionId || activeSessionId;
        }
      );

      if (finalSessionId && finalSessionId !== activeSessionId) {
        setActiveSessionId(finalSessionId);
      }
      refreshSessions();

      // Fire-and-forget memory writes — we don't need to wait for the
      // Walrus upload to complete, just submit the jobs to the relayer.
      if (authorized) {
        setMemoryStatus("saving");
        setMemoryError(null);
        Promise.all([
          remember(`User said: ${msg}`),
          remember(`Antroph replied: ${streamedReply}`),
        ])
          .then(() => {
            setMemoryStatus("saved");
            setTimeout(() => setMemoryStatus("idle"), 3_000);
          })
          .catch((err) => {
            const raw = err instanceof Error ? err.message : String(err);
            const isNetworkError =
              raw === "Failed to fetch" ||
              raw.toLowerCase().includes("network") ||
              raw.toLowerCase().includes("load failed");
            const message = isNetworkError
              ? "Walrus Memory relayer unreachable — your chat is saved, memory sync will retry next time."
              : raw;
            console.error("Memory write failed:", err);
            setMemoryError(message);
            setMemoryStatus("error");
          });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Something broke. Even I have off days. Try again.";
      // Replace the empty streaming placeholder (if any) with the error, or append.
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.content === "") {
          return [...prev.slice(0, -1), { role: "assistant", content: errorMsg }];
        }
        return [...prev, { role: "assistant", content: errorMsg }];
      });
    }
    setLoading(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  async function handleAuthorize() {
    setAuthChecking(true);
    clearError();
    try {
      await authorize();
    } finally {
      setAuthChecking(false);
    }
  }

  const activeTitle = activeSessionId
    ? sessions.find((s) => s.id === activeSessionId)?.title || "Chat"
    : "New chat";

  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-md border border-border bg-card p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-2xl">
            🦭
          </div>
          <h2 className="mb-2 text-lg font-semibold text-foreground">Authorize Walrus Memory</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Antroph stores your takes, predictions, and roast material on Walrus Mainnet.
            Authorize a one-time delegate key to start chatting. You&apos;ll pay a small gas fee.
          </p>
          {(memwalError) && (
            <p className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {memwalError}
            </p>
          )}
          <button
            onClick={handleAuthorize}
            disabled={authChecking || memwalLoading}
            className="w-full rounded-md border border-muted-foreground/40 bg-foreground py-3 font-semibold text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            {authChecking || memwalLoading ? "Authorizing…" : "Authorize & Chat"}
          </button>
        </div>
      </div>
    );
  }

  // Left slot in the top bar: sessions dropdown + current title
  const leftSlot = (
    <div className="flex items-center gap-2">
      <div ref={sessionsRef} className="relative">
        <button
          type="button"
          onClick={() => setSessionsOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="hidden sm:inline">Chats</span>
          <svg
            className="h-3 w-3 opacity-60"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {sessionsOpen && (
          <div className="absolute left-0 top-full z-40 mt-2 w-72 rounded-md border border-border bg-card p-1 shadow-2xl">
            <button
              onClick={startNewChat}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              New chat
            </button>
            <div className="my-1 border-t border-border" />
            <div className="max-h-80 overflow-y-auto">
              {sessionsLoading && sessions.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>
              ) : sessions.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">No chats yet</div>
              ) : (
                sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => loadSession(s.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      activeSessionId === s.id
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <span className="truncate">{s.title || "New chat"}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatRelative(s.updated_at)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      <div className="hidden truncate text-sm text-foreground md:block">{activeTitle}</div>
    </div>
  );

  return (
    <Layout leftSlot={leftSlot}>
      <div className="mx-auto flex h-[calc(100dvh-11rem)] md:h-[calc(100dvh-7rem)] max-w-3xl flex-col">
        {/* Messages */}
        <div className="thin-scrollbar flex-1 overflow-y-auto pb-4">
          {messages.length === 0 && !showBrief && brief && brief.matches.length > 0 && (
            <div className="py-10 text-center">
              <button
                onClick={() => setShowBrief(true)}
                className="mb-6 inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm text-primary hover:bg-accent"
              >
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                Today's matches: {brief.matches.length} · Tap for Antroph's takes
              </button>
            </div>
          )}

          {showBrief && brief && (
            <div className="mb-4 rounded-md border border-border bg-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <img
                  src="/antroph.jpg"
                  className="h-10 w-10 rounded-md object-cover"
                  alt="Antroph"
                />
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    Today's Brief
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {brief.date} · {brief.matches.length} matches
                  </div>
                </div>
                <button
                  onClick={() => setShowBrief(false)}
                  className="ml-auto rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Close
                </button>
              </div>

              {brief.total_predictions > 0 && (
                <div className="mb-3 text-xs text-primary">
                  {brief.total_predictions} predictions · {brief.accuracy}% accuracy · Rank #{brief.rank}
                </div>
              )}

              <div className="mb-4 space-y-2">
                {brief.matches.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-foreground">
                      {m.home} vs {m.away}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(m.kickoff).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                ))}
              </div>

              {brief.vela_takes.length > 0 && (
                <div className="border-t border-border pt-3">
                  <div className="mb-2 text-xs text-muted-foreground">Antroph's takes</div>
                  {brief.vela_takes.map((t, i) => (
                    <p key={i} className="mb-1 text-sm text-foreground">
                      {t.take}
                    </p>
                  ))}
                </div>
              )}

              <button
                onClick={() => sendMessage("What's your take on today's matches?")}
                className="mt-4 w-full rounded-md border border-border bg-background py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                Get Antroph's picks
              </button>
            </div>
          )}

          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <img
                    src="/antroph.jpg"
                    className="mt-1 h-8 w-8 shrink-0 rounded-md object-cover"
                    alt="Antroph"
                  />
                )}
                <div
                  className={`max-w-[85%] rounded-md border border-border bg-card px-4 py-3 text-sm leading-relaxed text-foreground`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex justify-start gap-3">
                <img
                  src="/antroph.jpg"
                  className="mt-1 h-8 w-8 shrink-0 rounded-md object-cover"
                  alt="Antroph"
                />
                <div className="rounded-md border border-border bg-card px-4 py-3">
                  <span className="animate-pulse text-sm text-muted-foreground">
                    Antroph is thinking...
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Memory sync status */}
        {(memoryStatus === "saving" || memoryStatus === "saved" || memoryError) && (
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px]">
            {memoryError ? (
              <>
                <span className="text-warning flex-1">{memoryError}</span>
                <button
                  type="button"
                  onClick={() => { setMemoryError(null); setMemoryStatus("idle"); }}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Dismiss memory sync error"
                >
                  ✕
                </button>
              </>
            ) : memoryStatus === "saving" ? (
              <span className="text-muted-foreground">Queuing to Walrus Memory…</span>
            ) : (
              <span className="text-success">Queued to Walrus Memory ✓</span>
            )}
          </div>
        )}

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="border-t border-border pt-3"
        >
          <div className="flex gap-2">
            <input
              id="chat-message"
              name="chat-message"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={messages.length === 0 ? "Message Antroph…" : "Say something to Antroph…"}
              disabled={loading}
              autoComplete="off"
              className="h-11 flex-1 rounded-md border border-border bg-card px-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-muted-foreground focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-md border border-border bg-card px-5 text-sm font-medium text-foreground hover:border-muted-foreground/40 hover:bg-accent disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
