/**
 * Raw Node http adapter for the Vela project-agent memory module.
 * Used by dev.mjs when you run `node dev.mjs`. On Vercel, the agentmem service
 * uses the same package.
 */

import {
  agentRemember,
  agentRememberAndWait,
  agentRecall,
  agentRememberBulk,
  agentConfigStatus,
  delegatePublicKeyHex,
  userRemember,
  userRecall,
  userDelegateStatus,
} from "../packages/agent-mem/index.mjs";

export async function handleAgentMemRequest(req, res) {
  function respond(code, obj) {
    res.statusCode = code;
    if (obj === null) {
      res.end();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(obj));
  }

  const status = agentConfigStatus();

  if (req.method === "GET") {
    return respond(200, status);
  }
  if (req.method === "OPTIONS") {
    return respond(204, null);
  }
  if (req.method !== "POST") {
    return respond(405, { error: "Method not allowed" });
  }

  const body = await new Promise((resolveRead) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolveRead(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", () => resolveRead(""));
  });

  let parsed = {};
  try {
    parsed = JSON.parse(body || "{}");
  } catch {
    return respond(400, { error: "Invalid JSON body" });
  }

  const op = parsed.op || "remember";
  try {
    if (op === "delegatePublic") {
      return respond(200, { publicKey: await delegatePublicKeyHex() });
    }
    if (op === "userStatus") {
      return respond(200, await userDelegateStatus(parsed.accountId, parsed.namespace));
    }

    if (op === "userRemember") {
      const result = await userRemember(parsed.accountId, parsed.namespace, parsed.text);
      return respond(200, { ok: true, result });
    }
    if (op === "userRecall") {
      const result = await userRecall(
        parsed.accountId,
        parsed.namespace,
        parsed.query || "",
        Math.min(Math.max(Number(parsed.limit) || 10, 1), 50)
      );
      return respond(200, result);
    }
    if (!status.configured) {
      return respond(503, {
        error: "Agent memory not configured. Set MEMWAL_AGENT_PRIVATE_KEY and MEMWAL_AGENT_ACCOUNT_ID in .env.",
      });
    }
    if (op === "remember") {
      if (parsed.waitFor) {
        const result = await agentRememberAndWait(parsed.text);
        return respond(200, { ok: true, result });
      }
      const accepted = await agentRemember(parsed.text);
      return respond(202, { ok: true, accepted });
    }
    if (op === "rememberBatch") {
      const result = await agentRememberBulk(parsed.texts);
      return respond(202, { ok: true, result });
    }
    if (op === "recall") {
      const result = await agentRecall(
        parsed.query || "",
        Math.min(Math.max(Number(parsed.limit) || 10, 1), 50)
      );
      return respond(200, result);
    }
    return respond(400, { error: `Unknown op: ${op}` });
  } catch (err) {
    console.error("[agentmem]", err && err.message);
    return respond(502, { error: err && err.message });
  }
}
