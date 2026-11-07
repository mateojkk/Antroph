/**
 * Internal agent-memory service (Walrus scorecards). Not exposed on the public
 * `/api/agentmem` path when using Vercel Services; the `api` service calls this
 * over the AGENTMEM_URL binding.
 */

import {
  agentRemember,
  agentRememberAndWait,
  agentRecall,
  agentRememberBulk,
  agentConfigStatus,
} from "@antroph/agent-mem";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-agentmem-key");

  if (req.method === "OPTIONS") {
    return respond(res, 204, null);
  }

  const secret = (process.env.AGENTMEM_SECRET || "").trim();
  if (secret && req.headers["x-agentmem-key"] !== secret) {
    return respond(res, 401, { error: "Unauthorized" });
  }

  const status = agentConfigStatus();

  if (req.method === "GET") {
    return respond(res, 200, status);
  }

  if (req.method !== "POST") {
    return respond(res, 405, { error: "Method not allowed" });
  }

  if (!status.configured) {
    return respond(res, 503, {
      error: "Agent memory not configured. Set MEMWAL_AGENT_PRIVATE_KEY and MEMWAL_AGENT_ACCOUNT_ID.",
    });
  }

  let body = {};
  try {
    body = JSON.parse((await readBody(req)) || "{}");
  } catch {
    return respond(res, 400, { error: "Invalid JSON body" });
  }

  const op = body.op || "remember";
  try {
    if (op === "remember") {
      if (body.waitFor) {
        const result = await agentRememberAndWait(body.text);
        return respond(res, 200, { ok: true, result });
      }
      const accepted = await agentRemember(body.text);
      return respond(res, 202, { ok: true, accepted });
    }

    if (op === "rememberBatch") {
      const result = await agentRememberBulk(body.texts);
      return respond(res, 202, { ok: true, result });
    }

    if (op === "recall") {
      const result = await agentRecall(
        body.query || "",
        Math.min(Math.max(Number(body.limit) || 10, 1), 50)
      );
      return respond(res, 200, result);
    }

    return respond(res, 400, { error: `Unknown op: ${op}` });
  } catch (err) {
    console.error("[agentmem]", err && err.message);
    return respond(res, 502, { error: err && err.message });
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", () => resolve(""));
  });
}

function respond(res, code, obj) {
  res.statusCode = code;
  if (obj === null) {
    res.end();
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}
