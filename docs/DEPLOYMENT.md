# Deployment (Base Mainnet)

This repo is a simple monorepo with separate packages:
- `contracts/` (Hardhat)
- `backend/` (Node.js + TypeScript)
- `frontend/` (Next.js + TypeScript)

## 1) Configure environment

Copy `.env.example` to `.env` at the repo root and fill:
- `DEPLOYER_PRIVATE_KEY`
- `RELAYER_PRIVATE_KEY` (optional unless you want server relaying)
- Contract addresses after deployment:
  - `TREASURY_ADDRESS`
  - `RISK_MANAGER_ADDRESS` (optional; mainly for analytics)
  - `ARBITRAGE_ROUTER_ADDRESS`
  - `FLASH_LOAN_EXECUTOR_ADDRESS`
  - `UNISWAP_V3_ADAPTER_ADDRESS`
  - `PANCAKESWAP_V3_ADAPTER_ADDRESS` (optional; required to execute routes that touch PancakeSwap V3)
  - `AERODROME_ADAPTER_ADDRESS`
- Frontend:
  - `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
  - `NEXT_PUBLIC_FLASH_LOAN_EXECUTOR_ADDRESS`

RPC:
- `BASE_RPC_URL` defaults to the free public endpoint: `https://mainnet.base.org`
- Leave `BASE_WS_URL` blank to use polling (avoids paid WS providers).

Optional stablecoin pairs (keep it small):
- Add 1–2 tokens in `EXTRA_TOKENS_JSON`
- Add 1–2 high-liquidity pairs + pool addresses in `EXTRA_PAIRS_JSON`
- Set `MIN_UNIV3_LIQUIDITY` / `MIN_RESERVE_*` to only monitor high-liquidity pools

## 2) Deploy contracts

From `contracts/`:
- Compile: `npm run compile`
- Deploy (Base mainnet): `npm run deploy:base-mainnet`
- Deploy (Base Sepolia): `npm run deploy:base-sepolia`

The deploy script writes a deployment JSON under `contracts/deployments/`.

## 3) Run backend

From `backend/`:
- Dev: `npm run dev`
- Build: `npm run build && npm run start`

Health:
- `GET /api/health`
- Opportunities:
  - `GET /api/opportunities`
  - WebSocket broadcasts on the same host/port

## 4) Run frontend

From `frontend/`:
- Dev: `npm run dev`

The Opportunities page fetches from `NEXT_PUBLIC_API_URL` and can submit on-chain txs via the user’s wallet.

Hybrid mode:
- User signs an intent; backend can relay it via `/api/intent/submit` if configured.
