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
  const key = delegateSeed();
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

const userClients = new Map();

function delegateSeed() {
  return (process.env.MEMWAL_AGENT_PRIVATE_KEY || "").trim().replace(/^0x/, "");
}

export async function delegatePublicKeyHex() {
  const seed = delegateSeed();
  if (!seed) throw new Error("MEMWAL_AGENT_PRIVATE_KEY is not set");
  const { delegateKeyToPublicKey } = await import("@mysten-incubation/memwal");
  const bytes = await delegateKeyToPublicKey(seed);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function getUserClient(accountId, namespace) {
  const key = delegateSeed();
  if (!key) throw new Error("MEMWAL_AGENT_PRIVATE_KEY is not set");
  if (!accountId) throw new Error("accountId is required");
  const ns = namespace || "default";
  const cacheKey = `${accountId}::${ns}`;
  if (!userClients.has(cacheKey)) {
    const { MemWal } = await import("@mysten-incubation/memwal");
    userClients.set(
      cacheKey,
      MemWal.create({
        key,
        accountId,
        serverUrl: SERVER_URL,
        namespace: ns,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
      })
    );
  }
  return userClients.get(cacheKey);
}

export async function userDelegateStatus(accountId, namespace) {
  if (!accountId) return { hasDelegate: false };
  const client = await getUserClient(accountId, namespace);
  try {
    const result = await client.listNamespaces({ limit: 1 });
    return { hasDelegate: Array.isArray(result?.namespaces) };
  } catch (error) {
    // A revoked or missing grant needs setup again; service failures should
    // surface instead of requesting an unnecessary wallet transaction.
    if (/401|403|unauthorized|not authorized|EDelegateKeyNotFound/i.test(String(error))) {
      return { hasDelegate: false };
    }
    throw error;
  }
}

export async function userRemember(accountId, namespace, text) {
  const memwal = await getUserClient(accountId, namespace);
  if (!text || !String(text).trim()) throw new Error("Refusing to store an empty memory");
  return memwal.remember(String(text).trim());
}

export async function userRecall(accountId, namespace, query, limit = 10) {
  const memwal = await getUserClient(accountId, namespace);
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
