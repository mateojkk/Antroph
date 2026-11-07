# AGENTS.md — Antroph

AI football companion for the 2026 World Cup. React + Vite frontend, Python Vercel serverless API, Supabase PostgreSQL, MemWal (Walrus Memory), Groq LLM.

## Developer commands

```bash
# Frontend deps (root package.json has no deps — install in frontend/)
npm install --prefix frontend

# Python API deps (required for local API)
python -m venv venv
source venv/bin/activate
pip install -r api/requirements.txt

# Full local stack: Vite frontend on :5173 + Node proxy on :3000 + Python API
npm run dev

# Typecheck + build frontend (tsc -b && vite build)
cd frontend && npm run build

# Lint frontend only
cd frontend && npm run lint
```

`npm run dev` runs `dev.mjs`, which starts Vite and proxies `/api/*` to per-request Python handlers. Open `http://localhost:3000`; `http://localhost:5173` alone will not reach the API.

## Architecture

- `frontend/` — React 19 + TypeScript + Tailwind CSS v4 + Vite. Routes in `src/pages/`, auth in `src/hooks/useAuth.tsx`, API client in `src/lib/api.ts`, MemWal integration in `src/hooks/useMemWal.ts`.
- `api/index.py` — single Vercel Function entry point. It routes `/api/*` requests to the appropriate handler module to stay within the Hobby plan's 12-function limit.
- `handlers/` — Python handler modules. Each module must expose `class handler(BaseHTTPRequestHandler)`. They live outside `api/` so Vercel does not auto-detect each one as a separate Serverless Function.
- `lib/common.py` — shared helpers for Supabase/Groq clients, auth, CORS, and JSON responses. Handlers should use these instead of module-level client creation.
- `lib/tatum.py` — Tatum Sui RPC client (JSON-RPC over urllib, `x-api-key` auth). `handlers/tatum.py` exposes a whitelisted read proxy, a status/liveness probe and a transaction-verification route.
- `lib/live_scores.py` — football-data.org v4 client. All fixtures, live scores and resolutions come from it; there is no other fixture source.
- `shared/types.ts` — shared TypeScript types.
- `supabase/schema.sql` — database schema. Run this in the Supabase SQL Editor before using the app.
- `dev.mjs` + `api/_dev_handler.py` — local dev harness that proxies `/api/*` directly to the individual handler modules.
- `vercel.json` — Vercel configuration: custom Vite build from `frontend/`, `rewrites` for the SPA and API, `functions` config for the single Python function, and the hourly `/api/resolve` cron.

## Environment variables

Copy `.env.example` to `.env` at repo root. **Two independent parsers** load `.env`: `dev.mjs` (Node, no quote stripping) and `api/_dev_handler.py` (Python, strips quotes). Neither uses `python-dotenv`.

Required backend keys:
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` — Python backend uses the service key; RLS is enabled but bypassed by service-key access.
- `GROQ_API_KEY` — LLM.
- `MEMWAL_SERVER_URL` — optional, only if any legacy code still references the relayer from the backend.

Frontend env vars (Vite, prefix `VITE_`):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `VITE_SUI_NETWORK` — defaults to `mainnet` if unset.
- `VITE_MEMWAL_SERVER_URL`, `VITE_MEMWAL_PACKAGE_ID`, `VITE_MEMWAL_REGISTRY_ID` — Walrus Memory frontend client and on-chain account creation/delegate-key authorization.

MemWal account model: each connected wallet owns its own `MemWalAccount` on-chain. Antroph creates the account if it does not exist, then adds a per-device delegate key. There is no shared project account; storage is paid by the managed relayer's server wallet, while the user pays gas for account creation and delegate-key authorization.

`FOOTBALL_DATA_API_KEY` appears in `.env.example` but is unused by any handler.

## Auth and API conventions

- Authentication is Sui wallet connect via `@mysten/dapp-kit`. The frontend derives the user from the connected account.
- Authenticated requests send `X-User-Email` and `X-Sui-Address` headers via `src/lib/api.ts`. The wallet address substitutes for the legacy email/user ID.
- Python endpoints that require auth check `self.headers.get("X-User-Email")`. Use `common.require_auth_email()`.
- Profile endpoints: `GET /api/profile?email=...` requires auth; `GET /api/profile?username=...` is public and strips `email` from the response.

## Frontend toolchain quirks

- Tailwind CSS v4 is imported in `frontend/src/index.css` with `@import "tailwindcss";`; there is no `tailwind.config.js`. Custom theme tokens are defined via `@theme` in the same file.
- `@mysten/sui` is **not** bundled; `vite.config.ts` externalizes it and injects an importmap pointing to `https://esm.sh/`. `@mysten/dapp-kit` and `@mysten-incubation/memwal` are bundled. `index.html` CSP allows `https://esm.sh`.
- `frontend/tsconfig.json` uses project references (`tsconfig.app.json`, `tsconfig.node.json`). Build runs `tsc -b` (project-level typecheck).
- The UI uses Inter as the primary sans-serif font for readability, with JetBrains Mono reserved for numerical/tabular data (`font-mono`). Dark theme only — `color-scheme: dark`.

## Backend toolchain quirks

- Python API handlers are plain `BaseHTTPRequestHandler` classes, not Flask/FastAPI.
- Local dev spawns a fresh Python process per request through `api/_dev_handler.py`. The handler suppresses handler stdout to prevent debug prints from corrupting the wire protocol.
- MemWal is now owned by the frontend. `handlers/memory.py` and backend MemWal writes in `handlers/agent.py` have been removed; the frontend creates a per-wallet `MemWalAccount` (if needed), adds a per-device delegate key, and reads/writes memories directly. Onboarding ends with required wallet-signed account creation and `addDelegateKey` steps; Chat and Memory Map block until authorization succeeds.
- Many handlers call `asyncio.run(...)` inside synchronous `do_POST`/`do_GET` methods.

## Deployment

```bash
vercel --prod
```

This repo is an npm workspaces monorepo (`frontend/`, `packages/agent-mem/`, `services/agentmem/`). Root `vercel.json` uses **Vercel Services**:

- **frontend** — Vite app (`/`)
- **api** — Python `api/index.py` + `api/agent_stream.py` (`/api/*`), binds to **agentmem** via `AGENTMEM_URL`
- **agentmem** — internal only (Walrus scorecard writes/recall); not on a public rewrite

Local stack: `npm run dev` (`dev.mjs`). Multi-service local routing: `npm run dev:vercel` (`vercel dev`). Cron: `/api/resolve` daily.

## Validation

- No test suite exists.
- After `npm run dev`, verify the stack at `http://localhost:3000/api/health`.
- Before committing, run `cd frontend && npm run lint && npm run build`.
