# Antroph

**An AI football rival that never forgets.**

**Live app:** [antroph-ookd.vercel.app](https://antroph-ookd.vercel.app)

Antroph is a football companion you argue with. Connect a Sui wallet, call matches, talk trash, and let Antroph remember every take. When matches finish, settlement writes a **scorecard memory** to **Walrus Memory on Sui mainnet**; the feed then shows what Antroph learned, including confidence-bucket accuracy and lessons recalled from its own memory namespace.

Built for **Total Recall: Tatum × Walrus Memory** — **Track 1: Markets & Sports Prediction**.

> A prediction is just a row in a database. A scorecard Antroph can recall is a rivalry.

---

## Why this is a memory product

Most prediction apps forget you the moment the page reloads. Antroph treats memory as the product:

- Your **chat turns**, **picks**, **hot takes**, and **Antroph's counter-picks** are written to a Walrus Memory namespace owned by your wallet.
- When a match resolves, the settlement job writes a structured **scorecard** to the project agent's namespace on mainnet.
- The Feed recalls those scorecards and shows a real learning loop: how picks perform by confidence bucket, plus the actual agent lessons that came back from Walrus.
- The Memory Map visualizes what Antroph has stored about you, and can be shared publicly.

No mock memory store. The writes go through the Walrus Memory relayer to Sui mainnet, and Tatum is used for onchain reads, transaction relay, and verification.

---

## What you can do

- **Talk to Antroph.** Streaming chat with recall of earlier conversations, opinions, and picks.
- **Call matches.** One pick per market, with a confidence score and an optional hot take. Antroph records its own counter-pick for the rivalry.
- **Watch it settle.** A cron resolves finished fixtures, updates the Wilson-scored leaderboard, and writes scorecards to Walrus.
- **See what Antroph learned.** The Feed surfaces confidence-bucket performance and lessons recalled from the agent's Walrus namespace.
- **Browse memory.** A per-wallet memory map, with an opt-in public share link.
- **Follow live scores.** Fixtures, live matches, and results from football-data.org v4.
- **Share the receipt.** Server-rendered Open Graph pages for picks and profiles, plus downloadable share cards for picks.

---

## Five-minute tour

1. **Connect a Sui wallet.** Onboarding creates a `MemWalAccount` for the wallet and authorizes a device delegate key.
2. **Open the Feed and call a match.** Add a confidence score and a hot take. Antroph records its own counter-pick.
3. **Ask Antroph about it in Chat.** "What have I gotten wrong lately?" Recall pulls from your wallet's memory namespace, not just the current session.
4. **Settle.** The daily cron calls `/api/resolve`; for a local demo, trigger it manually with `curl -X POST http://localhost:3000/api/resolve`.
5. **See the lesson land.** The Feed's "What Antroph learned" strip shows confidence-bucket accuracy and scorecards recalled from the agent's mainnet namespace.
6. **Open the memory map.** `/memory` visualizes your memories; Settings can make the map public and produce a share link.

---

## The loop

```
football-data.org v4
        │
        ▼
   /api/markets ──▶ user picks + Antroph counter-pick ──▶ /api/predict
                                                            │
                                                            ▼
                                              Walrus Memory (wallet namespace)
                                                            │
                     finished matches ──▶ /api/resolve ──────┤
                                                            ▼
                                    scorecard memories (agent namespace)
                                                            │
                                                            ▼
                     /api/credibility ──▶ "What Antroph learned" on the Feed
```

Each scorecard is structured for recall, for example:

```
Scorecard: user predicted Botafogo FR in Botafogo FR vs CA Mineiro
(confidence 8/10). Result: incorrect.
```

That is the whole thesis: the memory is legible, queryable, and visibly changes the product.

---

## Architecture

```
Browser (React 19 + Vite)
  ├── Sui wallet (dapp-kit / wallet standard) ── signs transactions
  ├── Sui gRPC-web fullnode ──────────────────── current chain state
  └── /api/* (same origin) ───────────────────── no CORS games
            │
            ▼
Vercel Services (one project, shared domain)
  ├── frontend (Vite)       SPA at /
  ├── api (Python)          /api/* → handlers/*
  │     ├── /api/memwal/*   signed reverse proxy to the Walrus Memory relayer
  │     ├── /api/sui/*      account lookup, tx polling, wallet-signed tx relay
  │     ├── /api/tatum/*    GraphQL reads, checkpoint status, tx verification
  │     └── AGENTMEM_URL binding ──► agentmem (internal Node)
  └── agentmem (internal)   project-agent Walrus scorecards (not public)
            │
            ├── Supabase Postgres  users, chats, predictions, leaderboard
            ├── Walrus Memory      per-wallet namespaces + `vela-colony` agent
            └── Tatum Sui GraphQL  mainnet reads, execution relay, verification
```

**Why Tatum?** Sui sunset public JSON-RPC in July 2026, and those hosts answer browser preflights with no CORS headers. Antroph keeps all chain traffic server-side or on gRPC-web:

- **Reads:** `/api/sui/account` and `/api/sui/tx` use Tatum's Sui GraphQL gateway.
- **Writes:** the wallet signs, then `/api/sui/execute` relays the signed transaction through Tatum's `executeTransaction` mutation.
- **Proof:** `/api/tatum/status` reads the latest checkpoint; `/api/tatum/verify?digest=…` confirms a transaction succeeded on mainnet.
- **Discovery:** MemWal accounts are shared objects, so Antroph reads the registry's `accounts` table via gRPC-web, with a Tatum event-window fallback.

---

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19, TypeScript, Tailwind CSS v4, Vite |
| Wallets | `@mysten/dapp-kit`, wallet standard, Sui gRPC-web |
| Backend | Python handlers + internal Node `agentmem` service (Vercel Services) |
| Database | Supabase Postgres |
| LLM | Groq — `openai/gpt-oss-120b` by default (`GROQ_MODEL` overrides) |
| Memory | Walrus Memory (`@mysten-incubation/memwal`), Sui mainnet |
| Chain access | Tatum Sui GraphQL gateway |
| Fixtures | football-data.org v4 only |

---

## Run locally

### Prerequisites

- Node.js `^20.19.0` or `>=22.12.0` (Vite 8 requirement)
- Python 3.11+
- A Supabase project, a Groq key, a football-data.org key, and a Tatum key
- Walrus Memory package/registry IDs and an agent delegate key (see Environment)

### 1. Install

```bash
git clone <your-repo-url> antroph
cd antroph

npm install
```

The repo is an npm workspaces monorepo: the root holds the API/runtime code and `frontend/` is a workspace, so one install covers both.

Create the Python virtualenv and install the API packages:

```bash
python -m venv venv

# macOS / Linux
source venv/bin/activate
pip install -r api/requirements.txt

# Windows (PowerShell)
.\venv\Scripts\Activate.ps1
pip install -r api/requirements.txt
```

### 2. Configure

```bash
cp .env.example .env
```

Fill in `.env` at the **repo root**. Vite reads it through `envDir: ".."`, so there is only one env file.

> Do not wrap values in quotes. The Python handlers strip quotes; the Node dev server does not.

Apply the database schema once, in the Supabase SQL editor:

```text
supabase/schema.sql
```

It is idempotent, so re-running is safe.

### 3. Start

```bash
npm run dev
```

This starts both halves:

- **API + proxy:** `http://localhost:3000` (Python handlers, and Vite proxied through)
- **Vite:** `http://localhost:5173` (also directly reachable)

Open **`http://localhost:3000`**.

### 4. Check it

```bash
curl http://localhost:3000/api/health
# {"status":"ok","supabase":"connected"}

curl http://localhost:3000/api/markets
curl http://localhost:3000/api/credibility
curl http://localhost:3000/api/tatum/status
```

If a port is stuck:

```powershell
Get-NetTCPConnection -LocalPort 3000,5173 -State Listen |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

---

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Supabase project URL (backend) |
| `SUPABASE_SERVICE_KEY` | yes | Supabase secret key; server-only |
| `GROQ_API_KEY` | yes | Chat, briefs, and reactions |
| `GROQ_MODEL` | no | Defaults to `openai/gpt-oss-120b` |
| `GROQ_REASONING_EFFORT` | no | Defaults to `low` for gpt-oss latency |
| `FOOTBALL_DATA_API_KEY` | yes | Fixtures, live scores, and resolution |
| `VITE_SUI_NETWORK` | no | `mainnet` (default), `testnet`, or `devnet` |
| `MEMWAL_SERVER_URL` | yes | Walrus Memory relayer, e.g. `https://relayer.memory.walrus.xyz` |
| `VITE_MEMWAL_PACKAGE_ID` | yes | MemWal Move package on Sui mainnet |
| `VITE_MEMWAL_REGISTRY_ID` | yes | MemWal account registry object |
| `VITE_MEMWAL_SERVER_URL` | legacy | Kept in `.env.example`; the frontend always uses `/api/memwal` |
| `VITE_SUPABASE_*`, `VITE_GOOGLE_CLIENT_ID` | legacy | The current frontend is wallet-only and does not read these |
| `TATUM_API_KEY` | yes | Tatum Sui GraphQL gateway |
| `SUI_MAINNET_RPC` | yes | `https://sui-mainnet.gateway.tatum.io` |
| `SUI_RPC_URL` | no | Override for local/dev testing only |
| `MEMWAL_AGENT_PRIVATE_KEY` | for settlement | Delegate key for the project agent |
| `MEMWAL_AGENT_ACCOUNT_ID` | for settlement | Agent MemWal account object ID |
| `MEMWAL_AGENT_NAMESPACE` | no | Defaults to `vela-colony` |
| `AGENTMEM_URL` | no on Vercel | Injected by the api→agentmem service binding. Local `dev.mjs` default: `http://localhost:3000/api/agentmem` |
| `AGENTMEM_SECRET` | recommended | Shared header (`x-agentmem-key`) for the internal agentmem service |
| `AGENTMEM_MAX_WRITES` | no | Cap on scorecard writes per settlement run (default 10) |
| `APP_URL` | no | Canonical URL for Open Graph tags; defaults to the request `Host` |

`MEMWAL_AGENT_PRIVATE_KEY` is a real delegate key. It can write to the project agent's memory; never ship it to the browser, and rotate it after a public demo.

---

## Wallet and memory model

Antroph has two kinds of Walrus Memory accounts:

1. **Per-wallet account.** On first use, the wallet creates a `MemWalAccount`, then authorizes a device delegate key. The user pays gas for those two transactions; storage is paid by the Walrus Memory relayer. The account ID is cached in `localStorage` and mirrored to Supabase so a returning wallet keeps its memory.
2. **Project agent account.** A server-side delegate key used by `/api/resolve` to write scorecards without a user online. It lives in the `vela-colony` namespace.

User memories are written client-side after a pick or chat turn, so the wallet remains the owner. The agent namespace is append-only learning state for the product.

---

## API surface

| Route | What it does |
| --- | --- |
| `GET /api/health` | Supabase connectivity |
| `GET /api/markets` | football-data.org fixtures as market groups |
| `GET /api/livescores` | Live matches and scores |
| `GET /api/brief` | Today's matches, record, and Antroph's takes |
| `POST /api/predict` | Store a pick + confidence + take; record Antroph's counter-pick |
| `GET/POST /api/resolve` | Resolve finished picks, re-rank, write scorecards |
| `GET /api/leaderboard` | Public leaderboard (Wilson score; house/test users hidden) |
| `GET /api/credibility` | Confidence buckets, top users, agent lessons |
| `GET /api/profile`, `PATCH /api/profile` | Profiles, memory visibility, MemWal account ID |
| `GET /api/journey` | Day-by-day timeline from Supabase |
| `GET /api/called_it` | Recent correct calls as cards |
| `GET /api/react` | Recently resolved picks with Antroph commentary |
| `GET /api/og` | Open Graph HTML for picks and profiles |
| `POST /api/chat`, `GET /api/chat` | Sessions and messages |
| `POST /api/agent_stream` | Streaming chat (SSE) |
| agentmem (internal) | Server-side agent memory: `remember`, `rememberBatch`, `recall` (api binding only) |
| `ANY /api/memwal/*` | Signed proxy to the Walrus Memory relayer |
| `GET /api/tatum/status` | Latest Sui checkpoint through Tatum |
| `GET /api/tatum/verify?digest=…` | Confirm a Sui transaction succeeded |
| `POST /api/tatum/graphql` | Read-only Tatum GraphQL proxy |
| `GET /api/sui/account` | Find a wallet's MemWal account |
| `GET /api/sui/tx` | JSON-RPC-shaped transaction/effects for the MemWal SDK |
| `POST /api/sui/execute` | Relay a wallet-signed transaction via Tatum |

---

## Onchain footprint

Antroph writes to **Sui mainnet**. Public identifiers from the build:

| Item | Value |
| --- | --- |
| Walrus Memory package | `0xe7c16fbea0560e7057e2bf7422feaa4fb313749fc69c9e9092fac7a33b81d7f5` |
| Account registry | `0x8bf82c9e09e36b8d1c38298f68b7cb68e7b8762887e7592add9986d5e9cf199f` |
| Agent MemWal account | `0x93fa02c82969d34886e87c52f32395e57125e26e71f4a5072bee87c2dd709dbb` |
| Agent owner | `0x8dc97a3946ecb60bb72a019d2f166e936e07ee4e87a968d3240b9e7b365d839c` |
| Agent namespace | `vela-colony` |
| First scorecard blob | `O8G-4LjQsIoz5NzuYvZzxXkMS8_TQcybE3GBzAIRV9E` |

Verify the chain path yourself:

```bash
curl http://localhost:3000/api/tatum/status
curl "http://localhost:3000/api/tatum/verify?digest=<sui-transaction-digest>"
```

Tatum dashboard account: `6a1070146dcffd29f3320dbd`.

The settlement pipeline has been run end-to-end with live credentials: fixtures → picks → resolution → scorecard memories on mainnet → recalled in `/api/credibility`.

---

## Deploy to Vercel

The repo is a polyglot Vercel project: a static Vite build plus three functions.

| Function | Purpose |
| --- | --- |
| `api/index.py` | dispatcher for almost every `/api/*` route |
| `api/agent_stream.py` | SSE chat stream |
| `services/agentmem/api/index.mjs` | internal agent memory service (`remember`, `rememberBatch`, `recall`) |

`vercel.json` sets `framework: null`, runs one workspace-aware `npm install` (root + `frontend/`), builds the frontend workspace, and uses `routes` with a `request.path` transform so the dispatcher still receives the original `/api/...` path.

### 1. Link the project

```bash
npm i -g vercel
vercel link
```

### 2. Set environment variables

Add these in **Project Settings → Environment Variables** for Production and Preview:

| Variable | Notes |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Required |
| `GROQ_API_KEY` | Required; `GROQ_MODEL` and `GROQ_REASONING_EFFORT` are optional |
| `FOOTBALL_DATA_API_KEY` | Required |
| `TATUM_API_KEY`, `SUI_MAINNET_RPC` | Required |
| `MEMWAL_SERVER_URL` | Required |
| `MEMWAL_AGENT_PRIVATE_KEY`, `MEMWAL_AGENT_ACCOUNT_ID` | Required for settlement |
| `MEMWAL_AGENT_NAMESPACE` | Optional; defaults to `vela-colony` |
| `AGENTMEM_URL` | Omit on Vercel (service binding). Set only for custom local routing |
| `AGENTMEM_SECRET` | Recommended; protects the internal agentmem service |
| `VITE_SUI_NETWORK`, `VITE_MEMWAL_PACKAGE_ID`, `VITE_MEMWAL_REGISTRY_ID` | Required at build time |

`VITE_*` values are inlined into the bundle at build time. Set them before the first build, and redeploy after changing them.

On Vercel, Node is pinned to `22.x` (`engines`) and Python to `3.12` (`.python-version`). Dependencies are pinned in `requirements.txt`.

### 3. Deploy

```bash
vercel --prod
```

### 4. Smoke test

```bash
curl https://<deployment>/api/health
curl https://<deployment>/api/markets
curl https://<deployment>/api/credibility
curl https://<deployment>/api/tatum/status
```

A daily cron calls `/api/resolve` at `0 0 * * *` (00:00 UTC). The cron needs `MEMWAL_AGENT_PRIVATE_KEY`, `MEMWAL_AGENT_ACCOUNT_ID`, and the api→agentmem binding (or `AGENTMEM_URL` when not on Vercel Services).

---

## Project layout

```text
package.json         Monorepo root: workspaces, backend Node deps, root scripts
api/                 Vercel entry points (Python dispatcher + Node memory route)
handlers/            HTTP handlers: markets, predict, resolve, credibility, sui, tatum…
lib/                 Supabase/Groq helpers, football-data client, Tatum client, MemWal SDK wrapper
frontend/            Vite + React workspace (package.json, src/…)
frontend/src/        React app (pages, components, wallet + memory hooks)
frontend/src/hooks/  useAuth, useMemWal, wallet/memory wiring
supabase/schema.sql  Idempotent schema
shared/types.ts      Types shared by the frontend and Python-shaped responses
scripts/             Live smoke tests and one-off Tatum/MemWal probes
dev.mjs              Local Vercel mimic: Python API :3000 + Vite :5173
```

Root scripts delegate to the workspace: `npm run build` = `npm run build --workspace frontend`, and `npm run dev` still starts the combined Python + Vite server.

The Walrus Memory agent namespace is `vela-colony`. That name is written onchain, so it stays even though the product is now branded **Antroph**.

---

## Build notes

- **Sui JSON-RPC is gone.** Public fullnodes no longer serve it in the browser. Antroph uses gRPC-web for current state and Tatum GraphQL for server-side reads, relay, and verification. Do not reintroduce `fullnode.*.sui.io` JSON-RPC calls.
- **MemWal accounts are shared objects.** They have no Sui `owner`. Read the registry's `accounts` dynamic field (gRPC-web), or fall back to the `AccountCreated` event window via Tatum.
- **Tatum retains a rolling checkpoint window.** Use `checkpoints(first: 1)` for the earliest available checkpoint; never scan from genesis.
- **The relayer is slow.** A write takes roughly 45 seconds. Scorecard writes are batched (max 20) and fire-and-forget; the database is the source of truth.
- **The service key stays server-side.** The browser talks only to `/api/*`; Supabase, Groq, football-data, Tatum, and the agent key never reach the client.

---

## License

MIT
