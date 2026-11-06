// Live smoke test of the Vela project agent on Walrus mainnet.
// Writes one test memory, waits for the Walrus upload to finish, then recalls it.
// Usage: node scripts/agent-live-test.mjs

import { config as loadEnv } from "./load-env.mjs";
loadEnv();

const { agentRememberAndWait, agentRecall } = await import("../lib/agent-mem.mjs");

const text = `Setup check ${new Date().toISOString()}: Vela agent memory wiring works.`;

console.log("[test] writing memory to Walrus mainnet (may take ~45s)...");
try {
  const result = await agentRememberAndWait(text, 120_000);
  console.log("[test] write done:", JSON.stringify(result).slice(0, 300));
} catch (e) {
  console.error("[test] WRITE FAILED:", e.message || e);
  process.exit(1);
}

console.log("[test] recalling...");
try {
  const recalled = await agentRecall("setup check memory wiring", 5);
  const hits = (recalled?.results || []).map((r) => r.text);
  console.log("[test] recall returned", hits.length, "results");
  console.log(hits.slice(0, 3).map((t) => "  - " + t).join("\n"));
  console.log(hits.some((t) => t.includes("Setup check")) ? "[test] ROUND-TRIP OK" : "[test] recall ran but our text missing (index lag ~20s in production)");
} catch (e) {
  console.error("[test] RECALL FAILED:", e.message || e);
  process.exit(1);
}
