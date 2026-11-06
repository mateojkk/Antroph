/**
 * Vercel serverless entry: Vela project-agent memory ops.
 *
 * POST /api/agentmem
 *   { op: "remember", text: "..." }            -> accepted job (background write)
 *   { op: "remember", text, waitFor: true }    -> awaited Walrus upload (slow, ~45s)
 *   { op: "recall", query: "...", limit: 10 }  -> wormhole recall from agent memory
 *
 * GET /api/agentmem
 *   -> configuration status for the health check
 *
 * This route never takes a namespace or account id from the request: the agent
 * signs with its own delegate key against its own account, so nothing the
 * caller sends can redirect a write into someone else's memory.
 */

import { agentRemember, agentRememberAndWait, agentRecall, agentRememberBulk, agentConfigStatus } from "../lib/agent-mem.mjs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return respond(res, 204, null);
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
