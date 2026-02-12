# Liquidity Efficiency Infrastructure on Base

Production-ready, modular arbitrage infrastructure protocol on Base using a **hybrid execution model**:

- **User-facing DApp** (public UI)
- **Backend scanner** finds + simulates opportunities (no paid APIs)
- **User signs an intent** (EIP-712)
- **Relayer submits** the transaction (relayer pays gas)
- **On-chain executor enforces safety + revenue**
  - reverts unless net user profit is positive
  - transparent **15% performance fee** to Treasury

Production-oriented arbitrage infrastructure on Base using a hybrid execution model:

- **Contracts (Hardhat)**: fee-enforcing on-chain executor + modular DEX adapters
- **Backend (Node/TS)**: free-RPC scanner + simulator + optional intent relayer
- **Frontend (Next/TS)**: user-friendly UI with Wagmi + RainbowKit

Docs:
- `docs/ARCHITECTURE.md`
- `docs/DEPLOYMENT.md`
- `docs/SECURITY_CHECKLIST.md`
- `docs/REVENUE.md`
- `docs/GRANT_POSITIONING.md`
- `docs/ROADMAP.md`

## Repo structure

- `contracts/` — Hardhat + Solidity protocol contracts + tests
- `backend/` — scanner + simulator + relayer API (free Base RPC)
- `frontend/` — Next.js DApp (Dashboard / Execute / Analytics / History)
- `scripts/` — optional repo-level helpers
- `tests/` — root-level testing notes (on-chain tests live in `contracts/tests/`)
- `sdk/` — minimal TypeScript helpers (routeHash + typed data)
- `docs/` — architecture, deployment, security, revenue, grant positioning

## Quickstart (local)

Recommended Node version: `20.x` (see `.nvmrc`). Newer versions (e.g. v25) can cause Next.js dev/runtime chunk issues.

1) Copy `.env.example` → `.env` (repo root)

2) Contracts
- `npm -C contracts install`
- `npm -C contracts test`

3) Backend
- `npm -C backend install`
- `npm -C backend run dev`

4) Frontend
- `npm -C frontend install`
- `npm -C frontend run dev`

If Next.js throws `Cannot find module './XXXX.js'` from `frontend/.next/server/webpack-runtime.js`,
clear the build cache and restart:
- `npm -C frontend run clean`
- `npm -C frontend run dev`

If you are on a very new Node major (e.g. v25) and still see it in dev mode, either:
- switch to Node `20.x`, or
- keep using `npm -C frontend run dev` (it includes a small require-hook + `.next/server` chunk workaround for newer Node majors).
