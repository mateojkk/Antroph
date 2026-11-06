# Antroph

Antroph is an AI football companion. You connect a Sui wallet, talk to Antroph, call matches, and keep a record that lives with that wallet.

Chat, predictions, and results are written to [Walrus Memory](https://memory.walrus.xyz) on a per-wallet MemWal account. A daily job resolves finished matches, updates the leaderboard, and writes scorecards into the project's own agent memory.

## What you can do

- **Chat** with Antroph. Replies stream in, and Antroph can recall what you have already said and picked.
- **Call matches** on the markets feed. Each wallet gets one pick per market, and a share card for the call.
- **Watch live scores** from football-data.org.
- **See your memory** on the memory map, and publish a profile other people can open.
- **Compare records** on the leaderboard. Rank uses a Wilson score, so a short hot streak does not sit above a longer record.

Sign-in is a Sui wallet. Onboarding creates a MemWal account for that wallet when one does not already exist, then authorizes a delegate key on this device. You pay gas for those two transactions. Storage is paid by the Walrus Memory relayer.

## Stack

- React 19, TypeScript, Tailwind CSS v4, and Vite
- Python handlers on Vercel, with one streaming function for chat
- Supabase Postgres for users, chats, predictions, and the leaderboard
- Groq (`openai/gpt-oss-120b` by default, override with `GROQ_MODEL`)
- Walrus Memory (`@mysten-incubation/memwal`) and Sui wallet connect (`@mysten/dapp-kit`)
- football-data.org v4 for fixtures, live scores, and results

## Run locally

Open the app at `http://localhost:3000`. The Vite server on port 5173 is only the frontend; API routes are served by the process on port 3000.

1. Clone the repo and copy `.env.example` to `.env` in the repo root. Fill in the keys in the next section.
2. In the Supabase SQL editor, run `supabase/schema.sql`.
3. Install dependencies:

   ```bash
   npm install
   npm install --prefix frontend
   ```

4. Create a virtualenv and install the API packages.

   macOS and Linux:

   ```bash
   python -m venv venv
   source venv/bin/activate
   pip install -r api/requirements.txt
   ```

   Windows (PowerShell):

   ```powershell
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   pip install -r api/requirements.txt
   ```

5. Start the stack:

   ```bash
   npm run dev
   ```

6. Check `http://localhost:3000/api/health`.

`npm run dev` loads `.env` itself. Do not wrap values in quotes. The Python handlers strip quotes, the Node dev server does not.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | yes | Backend database access |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | yes | Frontend Supabase client |
| `GROQ_API_KEY` | yes | Chat and brief generation |
| `GROQ_MODEL` | no | Defaults to `openai/gpt-oss-120b` |
| `FOOTBALL_DATA_API_KEY` | yes | Fixtures, live scores, and resolution |
| `VITE_SUI_NETWORK` | no | `mainnet`, `testnet`, or `devnet`. Defaults to `mainnet` |
| `VITE_MEMWAL_SERVER_URL` | yes | Walrus Memory relayer. The example points at `https://relayer.memory.walrus.xyz` |
| `VITE_MEMWAL_PACKAGE_ID`, `VITE_MEMWAL_REGISTRY_ID` | yes | On-chain MemWal package and account registry |
| `TATUM_API_KEY`, `SUI_MAINNET_RPC` | for chain reads | Server-side Sui reads and transaction checks |
| `MEMWAL_AGENT_PRIVATE_KEY`, `MEMWAL_AGENT_ACCOUNT_ID` | for the daily job | Delegate key and account for the project agent that writes scorecards |
| `MEMWAL_AGENT_NAMESPACE` | no | Defaults to `vela-colony` |
| `AGENTMEM_URL` | for the daily job | Where resolution posts memories. Locally this is `http://localhost:3000/api/agentmem` |
| `AGENTMEM_MAX_WRITES` | no | Cap on scorecard writes per resolution run |

`MEMWAL_SERVER_URL` is the same relayer URL, read by the Node agent-memory route.

## Deploy

```bash
vercel --prod
```

`vercel.json` builds `frontend/`, serves that output, and routes `/api/agent_stream` and `/api/agentmem` to their own functions. Every other `/api/*` request goes through `api/index.py`, which dispatches to modules in `handlers/`. A daily cron calls `/api/resolve`.

Set the same environment variables on the Vercel project. Point `AGENTMEM_URL` at `https://<your-deployment>/api/agentmem`.

## License

MIT
