# Antroph — Handoff

**Last updated:** 2026-11-07
**Deadline:** Total Recall (Tatum × Walrus Memory) — submissions close **10 Nov 2026, 17:00 UTC** (~4 days)
**Submission:** Track 1 — Markets & Sports Prediction (theme "The Memory Layer")

---

## 1. What this is

**Antroph** is an AI football rival that keeps memory: users make predictions, Antroph argues back with its own picks, and every resolved match writes a **scorecard memory** to **Walrus Memory (mainnet)**. The feed then shows "What Antroph learned" — confidence-bucket accuracy plus lessons recalled from the agent's own Walrus namespace.

The hackathon angle: **memory is the product, not the storage**. Scorecards are the learning loop; Tatum is the onchain verification/read layer.

**Fixture source of truth:** football-data.org v4 only. Polymarket was intentionally removed (`lib/polymarket.py` deleted — do not reintroduce).

---

## 2. Status: what is DONE and VERIFIED

### End-to-end pipeline (ran live, real credentials)
```
football-data.org ──▶ /api/markets             ✅ fixtures live
picks               ──▶ /api/predict           ✅ 201, writes predictions + Antroph's counter-pick (heuristic)
match results       ──▶ /api/resolve           ✅ resolved 4 picks, updated leaderboard
scorecards          ──▶ Walrus Memory mainnet  ✅ 4 blobs minted + recalled
feed                ──▶ /api/credibility       ✅ buckets + top users + agent lessons
```

### Verified evidence (mainnet)
- First memory blob: `O8G-4LjQsIoz5NzuYvZzxXkMS8_TQcybE3GBzAIRV9E`
- Agent owner: `0x8dc97a3946ecb60bb72a019d2f166e936e07ee4e87a968d3240b9e7b365d839c`
- Agent account: `0x93fa02c82969d34886e87c52f32395e57125e26e71f4a5072bee87c2dd709dbb`
- Namespace: `vela-colony`
- Recalled scorecards (sample):
  - `Scorecard: user predicted Botafogo in Botafogo FR vs CA Mineiro. Result: incorrect.`
  - `Scorecard: user predicted Botafogo FR in Botafogo FR vs CA Mineiro. Result: correct.`
  - `Scorecard: user predicted São Paulo FC in São Paulo FC vs SC Corinthians Paulista. Result: incorrect.`
  - `Scorecard: user predicted Draw in São Paulo FC vs SC Corinthians Paulista. Result: correct.`

**Memory count on mainnet: 4 product scorecards + 1 setup check.** On 2026-11-07 a seeding experiment added 9 identity/lesson notes before being stopped; Walrus is append-only, so those blobs remain in the `vela-colony` namespace. Do **not** pad the count with synthetic entries going forward. The honest way to grow memory is through real use: every resolved prediction writes a scorecard, and chat/prediction flows write user memories (see §6).

### Credentials in `.env` (NO SECRETS IN THIS DOC)
| Key | Status |
|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | ✅ connected, schema applied, read/write verified |
| `SUPABASE_SERVICE_KEY` note | Supabase's new **secret key** (`sb_secret_…`), not legacy `service_role` |
| `GROQ_API_KEY` | ✅ works; account lacks Llama 3.3 → uses `GROQ_MODEL=openai/gpt-oss-120b` |
| `FOOTBALL_DATA_API_KEY` | ✅ free tier, 13 fixtures over 3 days |
| `TATUM_API_KEY` | ✅ valid (gateway reports free plan) |
| `SUI_MAINNET_RPC` | ✅ `https://sui-mainnet.gateway.tatum.io` (**GraphQL** — see §4) |
| `MEMWAL_AGENT_PRIVATE_KEY` / `MEMWAL_AGENT_ACCOUNT_ID` | ✅ live round-trip |
| `MEMWAL_AGENT_NAMESPACE` | `vela-colony` |
| `AGENTMEM_URL` | `http://localhost:3000/api/agentmem` in dev |

Submission form needs:
- `MEMWAL_AGENT_ID` = agent public key `24567ae3e208aa47245ee31e895107778094ba978f5ba1840b9ed7dc5d11e640`
- Tatum **dashboard account ID** = `6a1070146dcffd29f3320dbd` ✅
- Repo URL, demo URL, blog post URL

---

## 3. Architecture map

### Backend (Python serverless, Vercel-style single function)
| Path | Purpose |
|---|---|
| `api/index.py` | dispatcher; handlers registered here (`agent`, `brief`, `called_it`, `chat`, `credibility`, `health`, `markets`, `predict`, `resolve`, `tatum`, …) |
| `handlers/predict.py` | writes user pick + generates Antroph counter-pick heuristically from confidence; stores prediction |
| `handlers/resolve.py` | resolves vs football-data results; updates leaderboard; writes **scorecard memories** to Walrus (batched, capped by `AGENTMEM_MAX_WRITES`) |
| `handlers/credibility.py` | confidence buckets, top users, agent lessons (recall via `AGENTMEM_URL`) |
| `handlers/tatum.py` | `/api/tatum/graphql` (read-only proxy), `/api/tatum/rpc` (legacy), `/api/tatum/status`, `/api/tatum/verify?digest=` |
| `lib/tatum.py` | Tatum Sui **GraphQL** client + verification helpers |
| `lib/agent-mem.mjs` | MemWal SDK wrapper (remember/rememberBatch/recall) |
| `api/agentmem.mjs` | Vercel function entry for agent memory ops |
| `lib/agent-mem-dev.mjs` | same routes in local `dev.mjs` |
| `lib/live_scores.py` | football-data.org v4 client |
| `lib/common.py` | Supabase/Groq clients, auth (`X-User-Email`), helpers |

### Frontend (React + Vite)
- `frontend/src/pages/Feed.tsx` — fixtures, **"What Antroph learned"** strip (credibility endpoint)
- `frontend/src/pages/MemoryMap.tsx` — memory visualization
- `frontend/src/components/PredictionModal.tsx` — pick + confidence + take
- `frontend/src/components/ShareImageModal.tsx` — share cards

### Local runtime
- `dev.mjs` — mimics Vercel: Python handlers on `:3000`, Vite on `:5173`
- `vercel.json` — rewrites, functions, crons (`/api/resolve`)
- `supabase/schema.sql` — full schema (verified; idempotent)

---

## 4. Critical technical gotchas

1. **Tatum's Sui gateway is GraphQL-only now.**
   Sui sunset JSON-RPC on public fullnodes (July 2026). Tatum's `/_methods` discovery only advertises:
   ```
   {"sui-mainnet-graphql":{"url":"https://sui-mainnet.gateway.tatum.io/graphql","protocol":"GraphQL"}}
   ```
   `lib/tatum.py` therefore uses `graphql()`; `sui_rpc()` is kept only for compatibility. Do **not** switch back to JSON-RPC paths.
   - `transactions` queries need `filter: { atCheckpoint: <latest checkpoint> }` — the gateway can't scan from genesis ("OutOfRange: below earliest available").
   - Enum status is `SUCCESS` / others; verify normalizes with `.upper() == "SUCCESS"`.

2. **Supabase key naming.** New projects only have `sb_publishable_…` + `sb_secret_…`. The secret key goes into `SUPABASE_SERVICE_KEY`; no RLS work needed because the browser never talks to Supabase.

3. **`predict.py` requires `user_email` in the JSON body**, not just the `X-User-Email` header — the header authenticates, but the body value does the user lookup. Missing body field → `404 {"error":"User not found"}`.

4. **`dev.mjs` Windows fixes already applied**: Vite is launched as `node frontend/node_modules/vite/bin/vite.js` directly (no `npx`/`.cmd` spawn), and the `__SPLIT__` split is CRLF-tolerant. Node ≥20 refuses `.cmd` spawn without `shell: true`; quoting the `"Program Files"` path inside a shell breaks it — the direct Node launch avoids both.

5. **PowerShell 5.1 mangles some HTTP calls** (false 401s, curl `-d` quoting). Test APIs with Node (`scripts/test-secret.mjs`) or Python (`scripts/*.py`), not `Invoke-WebRequest`.

6. **Dev harness framing**: `dev.mjs` responses are `headers_json\r\n__SPLIT__\r\nbody`. `dev.mjs` splits with `/\r?\n__SPLIT__\r?\n/` — Windows Python emits CRLF, so a plain `"\n__SPLIT__\n"` split silently fails and every API response reaches the browser as `headers + __SPLIT__ + body`, producing `Unexpected non-whitespace character after JSON at position 354`. If you ever see that error, check the split regex first.

7. **Walrus package IDs were refreshed** (old `.env.example` values were stale):
   - package `0xe7c16fbea0560e7057e2bf7422feaa4fb313749fc69c9e9092fac7a33b81d7f5`
   - registry `0x8bf82c9e09e36b8d1c38298f68b7cb68e7b8762887e7592add9986d5e9cf199f`
   - Relayer `https://relayer.memory.walrus.xyz` (write-ready, ~45s/memory, 30 pts/min, bulk max 20)

8. **Agent account ID cannot be discovered from the pubkey** in this environment: Mysten GraphQL ECONNRESET, public JSON-RPC deprecated, blastapi 403. The user supplied it from the dashboard. Don't burn time re-scanning.

---

## 5. Running locally

```powershell
cd $env:USERPROFILE\Vela
npm run dev          # Python API :3000 + Vite :5173
```

Quick verification:
```powershell
curl.exe -s http://localhost:3000/api/health
curl.exe -s http://localhost:3000/api/markets
curl.exe -s http://localhost:3000/api/tatum/status
curl.exe -s "http://localhost:3000/api/tatum/verify?digest=<DIGEST>"
curl.exe -s http://localhost:3000/api/credibility
```

Useful scripts (all read `.env` themselves):
- `scripts/test-db.py` — Supabase connection + write/read round-trip
- `scripts/test-football.py` — fixtures for the next 3 days
- `scripts/test-tatum2.py` — checkpoint, latest digest, verify
- `scripts/check-state.py` — predictions/leaderboard state
- `scripts/check-scorecards.py [attempts]` — recall agent memories
- `scripts/agent-live-test.mjs` — live Walrus write + recall
- `scripts/test-end2end.py` — seed user + picks through the API

---

## 5b. Vercel deployment readiness (2026-11-07)

Prepared:
- `vercel.json` uses `routes` with a `request.path` transform, so `api/index.py` still sees `/api/health` after the rewrite. One workspace-aware `npm install` covers the root and `frontend/`.
- Python pinned to `3.12` via `.python-version`; Node pinned to `22.x`; runtime deps pinned in `requirements.txt` and `api/requirements.txt`.
- `AGENTMEM_URL` auto-derives from `VERCEL_URL`; `AGENTMEM_SECRET` optionally protects `/api/agentmem`.
- Open Graph URLs use `X-Forwarded-Proto` / `APP_URL` instead of a hardcoded deployment domain.

Still needed:
1. `vercel link`, then add the env vars from README §Deploy.
2. Deploy and run the smoke tests.
3. Set `AGENTMEM_SECRET` in Vercel if the deployment is public.

---

## 6. What remains (in priority order)

1. **Seed ≥10 memories on mainnet** (currently 5). Add `scripts/seed-memories.mjs` that writes 10–15 structured memories (historical scorecards, season observations, agent identity notes) via `rememberBatch`, throttled for the relayer rate limit. **Required for Track 1.**
2. ~~**Tatum dashboard account ID**~~ ✅ `6a1070146dcffd29f3320dbd` (see §2).
3. **Verify a Walrus write onchain through Tatum.** We have blob IDs but not the Sui tx digests; the relayer response includes `blob_id` and `job_id` only. Options: extend `lib/agent-mem.mjs` to return/relay the tx digest if the SDK exposes it (check `remember` result fields / `/api/remember/<jobId>` payload), then call `/api/tatum/verify?digest=`.
4. **Seed a second real matchday** so `resolve` has fresh finished matches; confirm scorecards continue accumulating automatically.
5. **Frontend pass**: open `http://localhost:5173`, verify Feed / "What Antroph learned" / memory map render with the new data; fix any wallet-path regressions.
6. **README/blog draft** (hackathon requires a blog post): story = memory as product, scorecard learning loop, Tatum GraphQL verification, Walrus mainnet proof.
7. **Demo** (2–3 min): predict → resolve → scorecard recall → credibility strip.
8. **Rotate the agent delegate key after submission** (key was pasted in chat and stored in `.env`); swap `.env` value then.
9. **Repo hygiene**: git is initialized with one commit; commit source only, never `.env`.

### Open technical questions
- Does the MemWal SDK expose the Sui tx digest for a write? If not, verification must use another anchor (e.g. blob object ID → Walrus `Blob` object via Tatum GraphQL `object(...)` by blob object ID, if the relayer exposes it).
- `verify_transaction` may return `sender: ""` for checkpoint-boundary/system txs; harmless, but note it in docs.
- `latest_transaction_digest` depends on gateway retention; keep the `atCheckpoint` filter.

---

## 7. Do-not-break list

- `football-data.org v4` is the only fixture source (no Polymarket).
- The agent namespace stays `vela-colony` — it is already written onchain; do not rename it to match the Antroph branding.
- Scorecards are the product; keep them structured and recallable.
- `.env` is gitignored; never print secrets in logs or docs.
- Tatum key stays server-side; the frontend only ever calls `/api/tatum/*`.
- `supabase/schema.sql` is idempotent — safe to rerun.
- The Walrus Memory relayer is slow (~45 s/write); resolve must stay fire-and-forget and capped (`AGENTMEM_MAX_WRITES`).
