import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { useMemWal } from "../hooks/useMemWal";
import { apiGet, apiPost } from "../lib/api";
import Layout from "../components/Layout";

interface Memory {
  blob_id: string;
  text: string;
  distance: number;
  type: "prediction" | "miss" | "hit" | "opinion" | "rivalry" | "match" | "memory";
}

const PROBE_QUERIES = [
  "prediction match outcome correct miss",
  "team opinion take player performance",
  "rivalry debate argument hot take",
  "Season matchday goals",
];

function classifyMemory(text: string): Memory["type"] {
  const t = text.toLowerCase();
  if (t.startsWith("antroph replied:") || t.startsWith("antroph ") || t.startsWith("vela replied:") || t.startsWith("vela ")) return "rivalry";
  if (t.includes("hot take") || t.includes("predicted ") || t.includes("prediction:")) {
    if (t.includes("incorrect") || t.includes("wrong") || t.includes("miss")) return "miss";
    if (t.includes("correct") || t.includes("right") || t.includes("hit")) return "hit";
    return "prediction";
  }
  if (t.startsWith("user said:") || t.includes("i think") || t.includes("i believe") || t.includes("opinion")) {
    return "opinion";
  }
  if (t.includes(" vs ") || t.includes("match") || t.includes("world cup")) return "match";
  return "memory";
}

const TYPE_COLOR: Record<Memory["type"], string> = {
  prediction: "#38bdf8",
  hit: "#3fe77e",
  miss: "#ff5c5c",
  opinion: "#e0a878",
  rivalry: "#9a9cc4",
  match: "#38bdf8",
  memory: "#a1a1aa",
};

const TYPE_LABEL: Record<Memory["type"], string> = {
  prediction: "PRED",
  hit: "HIT",
  miss: "MISS",
  opinion: "OPIN",
  rivalry: "ANTROPH",
  match: "MATCH",
  memory: "MEM",
};

interface JourneyPrediction {
  pick: string;
  home_team: string | null;
  away_team: string | null;
  question: string | null;
  confidence: number;
  take: string | null;
  resolved: boolean;
  outcome: string | null;
  created_at: string;
}

interface JourneyChat {
  role: string;
  content: string;
  created_at: string;
}

interface JourneyDay {
  date: string;
  day_number: number;
  predictions: JourneyPrediction[];
  chats: JourneyChat[];
  accuracy_so_far: { correct: number; total: number; pct: number };
}

interface JourneySummary {
  first_day: string;
  last_day: string;
  total_days: number;
  total_predictions: number;
  total_chats: number;
  first_prediction: JourneyPrediction | null;
  latest_prediction: JourneyPrediction | null;
  accuracy_then: number;
  accuracy_now: number;
}

interface JourneyData {
  days: JourneyDay[];
  summary: JourneySummary;
}

const POLL_MS = 30_000;
const GLOBE_SIZE = 380;
const GLOBE_R = GLOBE_SIZE / 2 - 20;
const NODES = 60;

interface GlobePoint {
  lat: number;
  lng: number;
  color: string;
  size: number;
  id: string;
  memory: Memory;
}

// Removed countByType

// Removed typeBadge

function project(lat: number, lng: number, rotY: number, cx: number, cy: number, r: number) {
  const phi = (lat * Math.PI) / 180;
  const theta = ((lng + rotY) * Math.PI) / 180;
  const x = r * Math.cos(phi) * Math.sin(theta);
  const y = -r * Math.sin(phi);
  const z = r * Math.cos(phi) * Math.cos(theta);
  return { x: cx + x, y: cy + y, z, front: z > -r * 0.15 };
}

function drawGlobeFrame(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  rotY: number,
  t: number
) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "#0d0d0d";
  ctx.fillRect(0, 0, w, h);

  // outer ring glow
  const gRadial = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r + 8);
  gRadial.addColorStop(0, "transparent");
  gRadial.addColorStop(0.5, "rgba(56,189,248,0.08)");
  gRadial.addColorStop(1, "transparent");
  ctx.fillStyle = gRadial;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
  ctx.fill();

  // globe body
  const gBody = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.3, 0, cx, cy, r);
  gBody.addColorStop(0, "rgba(38,38,38,0.95)");
  gBody.addColorStop(0.7, "#141414");
  gBody.addColorStop(1, "#0a0a0a");
  ctx.fillStyle = gBody;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // wireframe meridians
  for (let i = 0; i < 16; i++) {
    const lng = (i / 16) * 360;
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    let first = true;
    for (let j = 0; j <= 64; j++) {
      const lat = -90 + (j / 64) * 180;
      const p = project(lat, lng, rotY, cx, cy, r);
      if (first) { ctx.moveTo(p.x, p.y); first = false; }
      else { ctx.lineTo(p.x, p.y); }
    }
    ctx.stroke();
  }

  // wireframe parallels
  for (let i = 1; i < 8; i++) {
    const lat = -90 + (i / 8) * 180;
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    let first = true;
    for (let j = 0; j <= 128; j++) {
      const lng = (j / 128) * 360;
      const p = project(lat, lng, rotY, cx, cy, r);
      if (first) { ctx.moveTo(p.x, p.y); first = false; }
      else { ctx.lineTo(p.x, p.y); }
    }
    ctx.stroke();
  }

  // equator highlight
  ctx.strokeStyle = "rgba(56,189,248,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  let ef = true;
  for (let j = 0; j <= 256; j++) {
    const lng = (j / 256) * 360;
    const p = project(0, lng, rotY, cx, cy, r);
    if (ef) { ctx.moveTo(p.x, p.y); ef = false; }
    else { ctx.lineTo(p.x, p.y); }
  }
  ctx.stroke();

  // scanning line
  const scanY = cy + Math.sin(t * 2) * (r - 4);
  ctx.strokeStyle = "rgba(56,189,248,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - r + 12, scanY);
  ctx.lineTo(cx + r - 12, scanY);
  ctx.stroke();

  // edge ring
  ctx.strokeStyle = "rgba(56,189,248,0.25)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
  ctx.stroke();
}

export default function MemoryMap() {
  const { username } = useParams<{ username?: string }>();
  const { user } = useAuth();
  const {
    authorized,
    loading: memwalLoading,
    error: memwalError,
    authorize,
    recall,
    accountId,
  } = useMemWal();
  const isOwner = !!user && (!username || user.username === username);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [authChecking, setAuthChecking] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const healthRef = useRef<{ ok: boolean; message: string } | null>(null);
  const [search, setSearch] = useState("");
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [profileData, setProfileData] = useState<{ record?: { correct: number; total_predictions: number }; user?: { memory_public?: boolean; memory_share_key?: string | null; memwal_account_id?: string | null; memory_namespace?: string; username?: string } } | null>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const animRef = useRef<number>(0);
  const rotYRef = useRef(0);
  const mouseRef = useRef({ x: 0, y: 0, dragging: false });

  // Public MemWal client for viewing other users' memory when they've made it public
  const publicUsername = !isOwner && profileData?.user?.memory_public ? profileData.user.username : null;

  const activeRecall = useMemo(() => {
    if (isOwner) return recall;
    if (!publicUsername) return null;
    return async (query: string, options?: { limit?: number; maxDistance?: number }) => {
      const result = await apiPost<{
        results?: Memory[];
        total?: number;
      }>("/book/recall", { username: publicUsername, query, limit: options?.limit });
      return {
        results: result?.results ?? [],
        total: result?.total ?? result?.results?.length ?? 0,
      };
    };
  }, [isOwner, recall, publicUsername]);

  useEffect(() => {
    const targetUser = username || user?.username;
    if (!targetUser) return;
    let cancelled = false;
    apiGet(`/profile?username=${targetUser}`)
      .then((data: unknown) => {
        const typed = data as { record?: { correct: number; total_predictions: number }; user?: { memory_public?: boolean; memory_share_key?: string | null; memwal_account_id?: string | null; memory_namespace?: string; username?: string } };
        if (!cancelled) setProfileData(typed);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [username, user?.username]);

  const targetUser = username || user?.username;
  const { data: journey } = useQuery<JourneyData>({
    queryKey: ["journey", targetUser],
    queryFn: () => apiGet(`/journey?username=${targetUser}`),
    enabled: !!targetUser,
    staleTime: 60_000,
  });

  const globePoints = useMemo<GlobePoint[]>(() => {
    if (memories.length === 0) return [];
    const points: GlobePoint[] = [];
    const used = new Set<string>();
    for (const m of memories.slice(0, NODES)) {
      const hash = m.blob_id || m.text.slice(0, 8);
      let seed = 0;
      for (let i = 0; i < hash.length; i++) seed = (seed * 31 + hash.charCodeAt(i)) & 0xffffffff;
      const lat = ((seed % 180) - 90) + ((seed % 11) - 5);
      const lng = (((seed >> 8) % 360)) + (((seed >> 4) % 11) - 5);
      const id = `${lat.toFixed(1)},${lng.toFixed(1)}`;
      if (used.has(id)) continue;
      used.add(id);
      points.push({
        lat: Math.max(-85, Math.min(85, lat)),
        lng,
        color: TYPE_COLOR[m.type] ?? "#a1a1aa",
        size: 2 + m.distance * 3,
        id: m.blob_id,
        memory: m,
      });
    }
    return points;
  }, [memories]);

  // Relayer health check
  useEffect(() => {
    if (!isOwner || !authorized) return;
    healthRef.current = { ok: true, message: "Memory is granted to Antroph" };
  }, [isOwner, authorized]);

  useEffect(() => {
    if (!activeRecall) return;
    let cancelled = false;

    const load = () => {
      setLoading(true);
      setSyncError(null);
      Promise.allSettled(
        PROBE_QUERIES.map((q) => activeRecall(q, { limit: 20 }))
      )
        .then((results) => {
          if (cancelled) return;
          const batches: Array<{ text: string; distance: number; blob_id: string }> = [];
          let firstError: string | null = null;
          for (const r of results) {
            if (r.status === "fulfilled") {
              batches.push(...r.value.results);
            } else {
              const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
              if (!firstError) firstError = message;
            }
          }
          if (firstError) {
            setSyncError(firstError);
          }
          const seen = new Set<string>();
          const fresh: Memory[] = [];
          let added = 0;
          for (const m of batches) {
            if (seen.has(m.blob_id)) continue;
            seen.add(m.blob_id);
            if (seenIds.current.has(m.blob_id)) continue;
            seenIds.current.add(m.blob_id);
            fresh.push({
              blob_id: m.blob_id,
              text: m.text,
              distance: m.distance,
              type: classifyMemory(m.text),
            });
            added++;
          }
          if (added > 0) {
            setMemories((prev) => [...fresh, ...prev].slice(0, 200));
            setPulse(true);
            setTimeout(() => setPulse(false), 1200);
          }
          setLastRefresh(new Date());
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activeRecall]);

  // Globe animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = GLOBE_SIZE * dpr;
    canvas.height = GLOBE_SIZE * dpr;
    canvas.style.maxWidth = "100%";
    canvas.style.height = "auto";
    canvas.style.aspectRatio = "1 / 1";
    ctx.scale(dpr, dpr);
    const cx = GLOBE_SIZE / 2;
    const cy = GLOBE_SIZE / 2;

    const animate = () => {
      const t = performance.now() / 1000;
      const autoSpeed = mouseRef.current.dragging ? 0 : 0.15;
      rotYRef.current = t * 12 + autoSpeed;

      drawGlobeFrame(ctx, cx, cy, GLOBE_R, rotYRef.current, t);

      // Draw memory points
      const sorted = [...globePoints].sort((a, b) => {
        const pa = project(a.lat, a.lng, rotYRef.current, cx, cy, GLOBE_R);
        const pb = project(b.lat, b.lng, rotYRef.current, cx, cy, GLOBE_R);
        return pb.z - pa.z;
      });

      for (const pt of sorted) {
        const p = project(pt.lat, pt.lng, rotYRef.current, cx, cy, GLOBE_R);
        if (!p.front) continue;

        const pulseR = pt.size + Math.sin(t * 4 + pt.lat * 0.1) * 0.8;
        const alpha = Math.max(0.3, 1 - (p.z / GLOBE_R) * 0.7);

        // glow
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, pulseR * 3);
        glow.addColorStop(0, `${pt.color}${Math.round(alpha * 60).toString(16).padStart(2, "0")}`);
        glow.addColorStop(1, "transparent");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, pulseR * 3, 0, Math.PI * 2);
        ctx.fill();

        // core
        ctx.fillStyle = `${pt.color}${Math.round(alpha * 220).toString(16).padStart(2, "0")}`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, pulseR, 0, Math.PI * 2);
        ctx.fill();

        // inner bright
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.6})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, pulseR * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [globePoints]);

  const filtered = memories.filter((m) => {
    if (search && !m.text.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalSeen = memories.length;
  const intelligenceScore = Math.min(100, Math.round(totalSeen * 1.6));

  // Removed toggleFilter and typeStats

  if (!isOwner) {
    if (!profileData) {
      return (
        <Layout>
          <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-md border border-border bg-card p-10 text-center">
            <div className="mx-auto mb-3 h-10 w-10 rounded-full border-2 border-border border-t-primary animate-spin" />
            <p className="font-mono text-xs text-muted-foreground">Loading memory…</p>
          </div>
        </Layout>
      );
    }
    if (!publicUsername) {
      return (
        <Layout>
          <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-md border border-border bg-card p-10 text-center">
            <div className="mb-4 text-4xl">🔒</div>
            <h2 className="mb-2 text-lg font-semibold text-foreground">Private memory</h2>
            <p className="text-sm text-muted-foreground">
              @{username}'s memory map is private.
            </p>
          </div>
        </Layout>
      );
    }
  }

  if (isOwner && !authorized) {
    return (
      <Layout>
        <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-md border border-border bg-card p-10 text-center">
          <div className="mb-4 text-4xl">🦭</div>
          <h2 className="mb-2 text-lg font-semibold text-foreground">Authorize memory</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Authorize a one-time delegate key to view your memory map.
          </p>
          {memwalError && (
            <p className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {memwalError}
            </p>
          )}
          <button
            onClick={async () => {
              setAuthChecking(true);
              try {
                await authorize();
              } finally {
                setAuthChecking(false);
              }
            }}
            disabled={authChecking || memwalLoading}
            className="w-full rounded-md border border-muted-foreground/40 bg-foreground py-3 font-semibold text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            {authChecking || memwalLoading ? "Authorizing…" : "Authorize"}
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-5xl">
        {!isOwner && (
          <div className="mb-4 flex items-center justify-between rounded-md border border-primary/30 bg-primary/10 px-4 py-2">
            <span className="text-xs font-medium text-primary">
              Viewing @{username}'s public memory
            </span>
            <Link to="/settings" className="text-[10px] text-muted-foreground hover:text-foreground">
              Manage your own →
            </Link>
          </div>
        )}

        {/* Journey timeline */}
        {journey && journey.summary.total_days > 0 && (
          <JourneyTimeline journey={journey} />
        )}

        {/* Stats row */}
        <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded border border-border bg-card/80 p-3 text-center">
            <div className="font-mono text-xl font-bold tabular-nums text-foreground">{totalSeen}</div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Memories</div>
          </div>
          <div className="rounded border border-border bg-card/80 p-3 text-center">
            <div className="font-mono text-xl font-bold tabular-nums text-primary">{intelligenceScore}</div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Antroph IQ</div>
          </div>
          <div className="rounded border border-border bg-card/80 p-3 text-center">
            <div className="font-mono text-xl font-bold tabular-nums text-success">{profileData?.record?.correct ?? 0}</div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Wins</div>
          </div>
          <div className="rounded border border-border bg-card/80 p-3 text-center">
            <div className="font-mono text-xl font-bold tabular-nums text-foreground">{profileData?.record?.total_predictions ?? 0}</div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Calls Made</div>
          </div>
        </div>

        {/* IQ bar */}
        <div className="mb-6 flex items-center gap-2 font-mono text-[9px] text-muted-foreground">
          <span className="shrink-0 text-primary">IQ</span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-border">
            <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${intelligenceScore}%` }} />
          </div>
          <span className="shrink-0 font-mono tabular-nums">{intelligenceScore}</span>
        </div>

        {/* Globe + Details layout */}
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Globe */}
          <div className="shrink-0">
            <div className="relative mx-auto w-fit">
              {/* Status bar */}
              <div className={`mb-2 flex items-center justify-between font-mono text-[9px] tracking-widest ${pulse ? "text-success" : syncError ? "text-danger" : "text-muted-foreground"}`}>
                <span className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${pulse ? "animate-pulse bg-success" : syncError ? "bg-danger" : lastRefresh ? "bg-muted-foreground" : "bg-muted-foreground"}`} />
                  {syncError ? "SYNC ERROR" : pulse ? "NEW MEMORY" : lastRefresh ? "SYNCED" : "CONNECTING"}
                </span>
                <span className="tabular-nums">
                  {globePoints.length}/{totalSeen} mapped
                </span>
              </div>

              {syncError && (
                <p className="mb-2 rounded border border-danger/40 bg-danger/10 px-2 py-1 font-mono text-[9px] text-danger">
                  {syncError}
                </p>
              )}

              {/* Canvas globe */}
              <canvas
                ref={canvasRef}
                className="rounded-full"
                style={{ cursor: "grab" }}
                onMouseDown={(e) => {
                  mouseRef.current = { x: e.clientX, y: e.clientY, dragging: true };
                }}
                onMouseMove={(e) => {
                  if (!mouseRef.current.dragging) return;
                  const dx = e.clientX - mouseRef.current.x;
                  rotYRef.current += dx * 0.3;
                  mouseRef.current.x = e.clientX;
                  mouseRef.current.y = e.clientY;
                }}
                onMouseUp={() => { mouseRef.current.dragging = false; }}
                onMouseLeave={() => { mouseRef.current.dragging = false; }}
              />
            </div>
          </div>

          {/* Right sidebar */}
          <div className="min-w-0 flex-1">
            {/* Filter bar */}
            <div className="mb-4">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="> search memories..."
                className="w-full rounded border border-border bg-card px-3 py-2 font-mono text-[10px] text-foreground placeholder:text-muted-foreground focus:border-muted-foreground focus:outline-none"
              />
            </div>

            {/* Memory list */}
            {loading && memories.length === 0 ? (
              <div className="flex items-center justify-center rounded border border-border bg-card p-12">
                <div className="text-center font-mono text-xs text-muted-foreground">
                  <div className="mx-auto mb-3 h-10 w-10 rounded-full border-2 border-border border-t-primary animate-spin" />
                  <p>INITIALIZING WALRUS LINK...</p>
                </div>
              </div>
            ) : memories.length === 0 ? (
              <div className="flex items-center justify-center rounded border border-border bg-card p-12">
                <div className="text-center font-mono">
                  <pre className="mb-3 text-[10px] leading-tight text-muted-foreground">{`
    .- - - - -.
   |  o     o  |
   |     ^     |
   |   \\___/   |
    \\_________/
`}</pre>
                  <p className="text-xs text-muted-foreground">
                    No memories yet. Chat with Antroph to begin.
                  </p>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center rounded border border-border bg-card p-10">
                <p className="font-mono text-xs text-muted-foreground">NO MATCHES FOR FILTER</p>
              </div>
            ) : (
              <div className="thin-scrollbar max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
                {filtered.map((m) => (
                  <button
                    key={m.blob_id}
                    onClick={() => setSelectedMemory(selectedMemory?.blob_id === m.blob_id ? null : m)}
                    className={`w-full rounded border p-3 text-left transition-colors ${
                      selectedMemory?.blob_id === m.blob_id
                        ? "border-primary/40 bg-accent"
                        : "border-border bg-card/80 hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className="rounded px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-widest"
                        style={{ color: TYPE_COLOR[m.type], border: `1px solid ${TYPE_COLOR[m.type]}40` }}
                      >
                        {TYPE_LABEL[m.type]}
                      </span>
                      <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
                        {((1 - m.distance) * 100).toFixed(0)}% Match
                      </span>
                    </div>
                    <p className={`font-mono text-[11px] leading-relaxed ${
                      selectedMemory?.blob_id === m.blob_id ? "text-foreground" : "text-muted-foreground"
                    }`}>
                      {selectedMemory?.blob_id === m.blob_id ? m.text : `${m.text.slice(0, 120)}${m.text.length > 120 ? "..." : ""}`}
                    </p>
                    {selectedMemory?.blob_id === m.blob_id && (
                      <div className="mt-2 border-t border-border pt-2">
                        <div className="font-mono text-[9px] text-muted-foreground">
                          <span className="text-primary">blob_id:</span> {m.blob_id.slice(0, 16)}...
                          <span className="ml-3 text-primary">distance:</span> {m.distance.toFixed(4)}
                          <span className="ml-3 text-primary">match:</span> {((1 - m.distance) * 100).toFixed(0)}%
                        </div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {lastRefresh && memories.length > 0 && (
              <p className="mt-2 text-right font-mono text-[9px] tabular-nums text-muted-foreground">
                last sync: {lastRefresh.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
      </div>

      {(accountId || profileData?.user?.memwal_account_id) && (
        <footer className="mt-8 border-t border-border pt-4 text-center">
          <a
            href={`https://suivision.xyz/object/${isOwner ? accountId : profileData?.user?.memwal_account_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] text-muted-foreground hover:text-foreground"
          >
            {isOwner ? "view your agent memories on suivision ↗" : `view @${username}'s MemWalAccount on suivision ↗`}
          </a>
        </footer>
      )}
    </Layout>
  );
}

function JourneyTimeline({ journey }: { journey: JourneyData }) {
  const { summary, days } = journey;
  const [expandedDay, setExpandedDay] = useState<number | null>(null);

  function formatDate(date: string): string {
    try {
      return new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
      return date;
    }
  }

  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  const firstVelaReply = firstDay?.chats.find((c) => c.role === "assistant");
  const latestVelaReply = lastDay?.chats.findLast?.((c) => c.role === "assistant")
    || [...(lastDay?.chats || [])].reverse().find((c) => c.role === "assistant");

  return (
    <section className="mb-6 rounded-md border border-border bg-card p-5">
      <h2 className="mb-1 text-sm font-semibold text-foreground">Agent memory journey</h2>
      <p className="mb-4 text-[11px] text-muted-foreground">
        How Antroph's responses changed from day one to day {summary.total_days}. Same agent, more memory.
      </p>

      {/* Day 1 vs Day N — Vela's actual replies */}
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-md border border-border bg-background p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] font-bold text-muted-foreground">DAY 1</span>
            <span className="text-[10px] text-muted-foreground">{formatDate(summary.first_day)}</span>
          </div>
          {firstVelaReply ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {firstVelaReply.content.slice(0, 200)}{firstVelaReply.content.length > 200 ? "..." : ""}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">No chat yet — Antroph doesn't know you.</p>
          )}
        </div>

        <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded bg-primary/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-primary">DAY {summary.total_days}</span>
            <span className="text-[10px] text-muted-foreground">{formatDate(summary.last_day)}</span>
          </div>
          {latestVelaReply ? (
            <p className="text-[11px] leading-relaxed text-foreground">
              {latestVelaReply.content.slice(0, 200)}{latestVelaReply.content.length > 200 ? "..." : ""}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">No chat on this day.</p>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="mb-4 flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {summary.total_chats} messages · {summary.total_predictions} predictions · {summary.total_days} days
        </span>
        <span className="font-mono text-[10px] tabular-nums text-primary">
          {summary.accuracy_now.toFixed(1)}% acc
        </span>
      </div>

      {/* Day-by-day timeline — Vela's responses */}
      <div className="thin-scrollbar max-h-[350px] space-y-1.5 overflow-y-auto pr-1">
        {days.map((day) => {
          const isExpanded = expandedDay === day.day_number;
          const velaReplies = day.chats.filter((c) => c.role === "assistant");
          return (
            <button
              key={day.date}
              onClick={() => setExpandedDay(isExpanded ? null : day.day_number)}
              className={`w-full rounded border p-2.5 text-left transition-colors ${
                isExpanded
                  ? "border-primary/40 bg-accent"
                  : "border-border bg-background hover:border-muted-foreground/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] font-bold tabular-nums text-primary">
                    D{day.day_number}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{formatDate(day.date)}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {velaReplies.length > 0 && `${velaReplies.length} repl${velaReplies.length > 1 ? "ies" : "y"}`}
                    {velaReplies.length > 0 && day.predictions.length > 0 && " · "}
                    {day.predictions.length > 0 && `${day.predictions.length} pick${day.predictions.length > 1 ? "s" : ""}`}
                    {velaReplies.length === 0 && day.predictions.length === 0 && "—"}
                  </span>
                </div>
              </div>
              {!isExpanded && velaReplies.length > 0 && (
                <p className="mt-1 truncate text-[10px] text-muted-foreground">
                  <span className="text-primary">Antroph: </span>
                  {velaReplies[0].content.slice(0, 80)}{velaReplies[0].content.length > 80 ? "..." : ""}
                </p>
              )}
              {isExpanded && (
                <div className="mt-2 space-y-2 border-t border-border pt-2">
                  {day.chats.map((c, i) => (
                    <div key={i} className="text-[10px] leading-relaxed">
                      <span className={`font-bold ${c.role === "user" ? "text-muted-foreground" : "text-primary"}`}>
                        {c.role === "user" ? "You: " : "Antroph: "}
                      </span>
                      <span className={c.role === "user" ? "text-muted-foreground" : "text-foreground"}>
                        {c.content.slice(0, 250)}{c.content.length > 250 ? "..." : ""}
                      </span>
                    </div>
                  ))}
                  {day.predictions.length > 0 && (
                    <div className="border-t border-border pt-1.5 text-[9px] text-muted-foreground">
                      {day.predictions.map((p, i) => (
                        <div key={i}>
                          <span className="text-foreground">Predicted: {p.pick}</span>
                          {p.home_team && p.away_team && <span> in {p.home_team} vs {p.away_team}</span>}
                          <span className={`ml-1 font-bold ${p.outcome === "correct" ? "text-success" : p.outcome === "incorrect" ? "text-danger" : ""}`}>
                            {p.outcome === "correct" ? "✓ HIT" : p.outcome === "incorrect" ? "✗ MISS" : "— pending"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
