/**
 * Antroph project-agent memory (Walrus Memory, server-side).
 *
 * Config (env):
 *  MEMWAL_AGENT_PRIVATE_KEY, MEMWAL_AGENT_ACCOUNT_ID, MEMWAL_AGENT_NAMESPACE,
 *  MEMWAL_SERVER_URL
 */

const SERVER_URL = (process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz").replace(/\/$/, "");
const NAMESPACE = process.env.MEMWAL_AGENT_NAMESPACE || "vela-colony";
const REQUEST_TIMEOUT_MS = 120_000;

let cachedClient = null;

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

export async function agentRemember(text) {
  const memwal = await getAgentClient();
  if (!memwal) throw new Error("Agent memory not configured (MEMWAL_AGENT_PRIVATE_KEY / MEMWAL_AGENT_ACCOUNT_ID)");
  if (!text || !String(text).trim()) throw new Error("Refusing to store an empty memory");
  return memwal.remember(String(text).trim());
}

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
