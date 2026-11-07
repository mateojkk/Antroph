#!/usr/bin/env node
/**
 * Local dev server — runs Vite frontend + Python API handlers.
 * Mimics Vercel's routing: /api/* → Python, everything else → Vite.
 *
 * Usage: npm run dev
 */

import { createServer } from "http";
import { spawn } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve as resolvePath, dirname, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = parseInt(process.env.PORT || "3000");
const HANDLERS_DIR = resolvePath(__dirname, "handlers");
const API_DIR = resolvePath(__dirname, "api");
const FRONTEND_DIR = resolvePath(__dirname, "frontend");
const VITE_PORT = 5173;
const PYTHON = process.platform === "win32"
  ? resolvePath(__dirname, "venv", "Scripts", "python.exe")
  : resolvePath(__dirname, "venv", "bin", "python3");

// Load .env
const envPath = resolvePath(__dirname, ".env");
if (existsSync(envPath)) {
  const envText = readFileSync(envPath, "utf-8");
  for (const line of envText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      process.env[key] = val;
    }
  }
}

// Start Vite dev server
console.log("\x1b[36m[antroph]\x1b[0m Starting Vite frontend...");
// Run Vite's JS entry directly through Node. Avoids npx/.cmd spawn quirks on
// Windows (spaces in "Program Files" + shell quoting) and works cross-platform.
// npm workspaces hoist vite to the root node_modules, so check both locations.
const VITE_JS =
  [
    resolvePath(FRONTEND_DIR, "node_modules", "vite", "bin", "vite.js"),
    resolvePath(__dirname, "node_modules", "vite", "bin", "vite.js"),
  ].find((candidate) => existsSync(candidate)) || null;

if (!VITE_JS) {
  console.error(
    "\x1b[31m[antroph]\x1b[0m vite not found. Run `npm install` at the repo root first."
  );
  process.exit(1);
}
const vite = spawn(process.execPath, [VITE_JS, "--port", String(VITE_PORT), "--force"], {
  cwd: FRONTEND_DIR,
  stdio: "pipe",
  env: { ...process.env, NODE_OPTIONS: "--no-deprecation", FORCE_COLOR: "1" },
});

vite.stdout.on("data", (d) => {
  const lines = d.toString().split("\n").filter(Boolean);
  for (const line of lines) {
    console.log(`\x1b[35m[vite]\x1b[0m ${line}`);
  }
});
vite.stderr.on("data", (d) => {
  const lines = d.toString().split("\n").filter(Boolean);
  for (const line of lines) {
    console.log(`\x1b[35m[vite]\x1b[0m ${line}`);
  }
});

// Python process pool for API handlers
const pythonProcesses = new Map();

function callPython(scriptPath, method, body, query, headers = {}, fullPathAndQuery = "") {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    const args = [
      resolvePath(__dirname, "api", "_dev_handler.py"),
      scriptPath,
      method,
      query || "",
      JSON.stringify(headers),
      fullPathAndQuery || "",
    ];

    const proc = spawn(PYTHON, args, {
      cwd: __dirname,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));

    if (body) {
      proc.stdin.write(JSON.stringify(body));
    }
    proc.stdin.end();

    proc.on("close", (code) => {
      if (code !== 0) {
        console.error(`\x1b[31m[api]\x1b[0m ${stderr}`);
        reject(new Error(`Python exited ${code}: ${stderr.slice(0, 200)}`));
        return;
      }
      try {
        // stdout format: headers_json\nbody_json
        // Windows Python emits \r\n, so split tolerantly.
        const parts = stdout.split(/\r?\n__SPLIT__\r?\n/);
        if (parts.length === 2) {
          const headers = JSON.parse(parts[0]);
          const body = parts[1];
          resolve({ status: headers.status || 200, headers: headers.headers || {}, body });
        } else {
          resolve({ status: 200, headers: {}, body: stdout });
        }
      } catch (e) {
        resolve({ status: 200, headers: {}, body: stdout });
      }
    });

    proc.on("error", reject);
  });
}

// Main server
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // CORS
  const allowedOrigins = [
    `http://localhost:${PORT}`,
    `http://localhost:${VITE_PORT}`,
    `http://127.0.0.1:${PORT}`,
    `http://127.0.0.1:${VITE_PORT}`
  ];
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-Email, X-Sui-Address");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // API routes
  if (pathname.startsWith("/api/")) {
    // Vela project-agent memory bypasses Python: same ESM module Vercel runs.
    if (pathname === "/api/agentmem") {
      const { handleAgentMemRequest } = await import("./lib/agent-mem-dev.mjs");
      await handleAgentMemRequest(req, res);
      return;
    }
    // Take only the first path segment after /api/ as the handler name.
    // e.g. /api/memwal/remember → "memwal", /api/health → "health"
    const scriptName = pathname.slice(5).split("/")[0];

    // Streaming endpoints live directly in api/ (not handlers/) and pipe stdout
    // straight to the response so SSE chunks aren't buffered.
    const STREAMING_SCRIPTS = ["agent_stream"];
    if (STREAMING_SCRIPTS.includes(scriptName)) {
      const apiScriptPath = resolvePath(API_DIR, `${scriptName}.py`);
      if (!existsSync(apiScriptPath)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Unknown endpoint: ${scriptName}` }));
        return;
      }
      // Collect body
      let rawBody = Buffer.alloc(0);
      if (["POST", "PATCH", "PUT"].includes(req.method)) {
        rawBody = await new Promise((resolve) => {
          const chunks = [];
          req.on("data", (c) => chunks.push(c));
          req.on("end", () => resolve(Buffer.concat(chunks)));
        });
      }
      const passthroughHeaders = {};
      if (req.headers["x-user-email"]) passthroughHeaders["X-User-Email"] = req.headers["x-user-email"];
      if (req.headers["x-sui-address"]) passthroughHeaders["X-Sui-Address"] = req.headers["x-sui-address"];

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      });

      const proc = spawn(PYTHON, [
        resolvePath(__dirname, "api", "_dev_stream_handler.py"),
        apiScriptPath,
        req.method,
        url.search || "",
        JSON.stringify(passthroughHeaders),
      ], {
        cwd: __dirname,
        env: { ...process.env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      if (rawBody.length) proc.stdin.write(rawBody);
      proc.stdin.end();
      proc.stdout.pipe(res);
      proc.stderr.on("data", (d) => console.error(`\x1b[31m[${scriptName}]\x1b[0m`, d.toString()));
      proc.on("close", () => res.end());
      req.on("close", () => proc.kill());
      return;
    }

    const scriptPath = resolvePath(HANDLERS_DIR, `${scriptName}.py`);

    if (!existsSync(scriptPath)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Unknown endpoint: ${scriptName}` }));
      return;
    }

    // Forward auth headers to Python (Vela auth + MemWal signing headers).
    const passthroughHeaders = {};
    if (req.headers["authorization"]) passthroughHeaders["Authorization"] = req.headers["authorization"];
    if (req.headers["x-user-email"]) passthroughHeaders["X-User-Email"] = req.headers["x-user-email"];
    if (req.headers["x-sui-address"]) passthroughHeaders["X-Sui-Address"] = req.headers["x-sui-address"];
    // MemWal signed-request headers
    for (const h of ["x-public-key", "x-signature", "x-timestamp", "x-nonce", "x-account-id", "x-seal-session", "x-delegate-key", "x-memwal-account-id", "x-memwal-namespace"]) {
      if (req.headers[h]) passthroughHeaders[h] = req.headers[h];
    }

    // Collect body for POST/PATCH/PUT
    let body = null;
    if (["POST", "PATCH", "PUT"].includes(req.method)) {
      body = await new Promise((resolve) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()));
          } catch {
            resolve(null);
          }
        });
      });
    }

    const query = url.search || "";
    // Pass the full original path+query so sub-path handlers (e.g. /api/memwal/remember)
    // receive the complete path, not just /api/memwal.
    const fullPathAndQuery = pathname + query;
    try {
      const result = await callPython(scriptName, req.method, body, query, passthroughHeaders, fullPathAndQuery);
      res.writeHead(result.status, {
        "Content-Type": "application/json",
        ...result.headers,
      });
      res.end(result.body);
    } catch (e) {
      console.error(`\x1b[31m[api]\x1b[0m Error in ${scriptName}:`, e.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Proxy everything else to Vite
  const viteUrl = `http://localhost:${VITE_PORT}${req.url}`;
  try {
    const proxyRes = await fetch(viteUrl, {
      method: req.method,
      headers: { ...req.headers, host: `localhost:${VITE_PORT}` },
      body: req.method !== "GET" && req.method !== "HEAD" ? await new Promise((resolve) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => resolve(Buffer.concat(chunks)));
      }) : undefined,
    });

    res.writeHead(proxyRes.status, Object.fromEntries(proxyRes.headers));
    const body = await proxyRes.arrayBuffer();
    res.end(Buffer.from(body));
  } catch {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Vite dev server not ready. Wait a moment and refresh.");
  }
});

server.listen(PORT, () => {
  console.log(`\n\x1b[32m[antroph]\x1b[0m ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\x1b[32m[antroph]\x1b[0m  Antroph is running at http://localhost:${PORT}`);
  console.log(`\x1b[32m[antroph]\x1b[0m  API: http://localhost:${PORT}/api/health`);
  console.log(`\x1b[32m[antroph]\x1b[0m  Chat: http://localhost:${PORT}/`);
  console.log(`\x1b[32m[antroph]\x1b[0m ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});

// Cleanup
process.on("SIGINT", () => {
  vite.kill();
  server.close();
  process.exit();
});
