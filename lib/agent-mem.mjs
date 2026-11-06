/**
 * Vela project-agent memory (Walrus Memory, server-side).
 *
 * The Vela agent owns its own MemWalAccount. The resolve cron and the
 * credibility engine write scorecard memories here — which sources were right,
 * which teams surprised, which users kept their promises — independently of any
 * user being online. This is the learning loop that "apps that learn over time"
 * are judged on.
 *
 * Runs in two contexts, always as a trusted server process:
 *  - Vercel: api/agentmem.mjs forwards /api/agentmem requests here
 *  - local dev: dev.mjs routes /api/agentmem straight to this module
 *
 * Config (env):
 *  MEMWAL_AGENT_PRIVATE_KEY  Ed25519 delegate private key (hex) for the agent
 *  MEMWAL_AGENT_ACCOUNT_ID   the agent's onchain MemWalAccount object id
 *  MEMWAL_AGENT_NAMESPACE    namespace for agent memories (default vela-colony)
 *  MEMWAL_SERVER_URL         relayer URL (default https://relayer.memory.walrus.xyz)
 *
 * The relayer takes ~45s per write in production (seal, embed, upload), so
 * writes are async jobs and this module only ever awaits the accepted response.
 * `waitForRememberJob` is opt-in for callers that must prove the memory landed.
 */

const SERVER_URL = (process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz").replace(/\/$/, "");
const NAMESPACE = process.env.MEMWAL_AGENT_NAMESPACE || "vela-colony";
const REQUEST_TIMEOUT_MS = 120_000;

let cachedClient = null;

/**
 * Lazily build and cache the MemWal client. Returns null when the agent is not
 * configured — callers must handle that honestly rather than fabricate writes.
 */
export async function getAgentClient() {
  const key = process.env.MEMWAL_AGENT_PRIVATE_KEY;
  const accountId = process.env.MEMWAL_AGENT_ACCOUNT_ID;
  if (!key || !accountId) return null;
  if (!cachedClient) {
    const { MemWal } = await import("@mysten-incubation/memwal");
    cachedClient = MemWal.create({
      key,
      accountId,
      serverUrl: SERVER_URL,
      namespace: NAMESPACE,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
    });
  }
  return cachedClient;
}

export function agentConfigStatus() {
  return {
    configured: !!(process.env.MEMWAL_AGENT_PRIVATE_KEY && process.env.MEMWAL_AGENT_ACCOUNT_ID),
    namespace: NAMESPACE,
    serverUrl: SERVER_URL,
  };
}

/**
 * Store one memory as an accepted background job. Does not wait for the blob
 * upload to finish — with a ~45s seal/embed/upload the cron must move on.
 */
export async function agentRemember(text) {
  const memwal = await getAgentClient();
  if (!memwal) throw new Error("Agent memory not configured (MEMWAL_AGENT_PRIVATE_KEY / MEMWAL_AGENT_ACCOUNT_ID)");
  if (!text || !String(text).trim()) throw new Error("Refusing to store an empty memory");
  return memwal.remember(String(text).trim());
}

/**
 * Store one memory and wait until it is uploaded to Walrus. Used by scripts
 * and manual checks, never by the cron hot path.
 */
export async function agentRememberAndWait(text, timeoutMs) {
  const memwal = await getAgentClient();
  if (!memwal) throw new Error("Agent memory not configured");
  const accepted = await memwal.remember(String(text).trim());
  const done = await memwal.waitForRememberJob(accepted.job_id || accepted.jobId, timeoutMs);
  return done ?? accepted;
}

export async function agentRecall(query, limit = 10) {
  const memwal = await getAgentClient();
  if (!memwal) throw new Error("Agent memory not configured");
  return memwal.recall({ query, options: { limit } });
}

/**
 * Batch store (max 20 per call, relayer limit). Returns { job_ids: [...] }.
 * Jobs are accepted background writes; check getRememberBulkStatus to confirm.
 */
export async function agentRememberBulk(texts) {
  const memwal = await getAgentClient();
  if (!memwal) throw new Error("Agent memory not configured");
  const items = (texts || [])
    .map((t) => String(t || "").trim())
    .filter(Boolean)
    .map((text) => ({ text }));
  if (!items.length) throw new Error("rememberBulk: no non-empty texts");
  if (items.length > 20) throw new Error("rememberBulk: more than 20 items (relayer limit)");
  return memwal.rememberBulk(items);
}
