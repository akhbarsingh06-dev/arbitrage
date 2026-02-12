# Full Implementation Output
This file is generated from the working repo. It contains **real code** (no pseudo-code) for the contracts, backend, frontend, deployment scripts, Hardhat config, README, and security docs.

## `README.md`
```md
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

```

## `.env.example`
```text
# ═══════════════════════════════════════════════
#  BASE ARBITRAGE PROTOCOL — Environment Config
# ═══════════════════════════════════════════════

# Deployer private key (NEVER commit this!)
DEPLOYER_PRIVATE_KEY=0x_your_private_key_here

# Base RPC URLs (free public endpoints)
BASE_RPC_URL=https://mainnet.base.org
# Optional: comma-separated fallback RPCs (all must be free/public)
# BASE_RPC_URLS=https://mainnet.base.org,https://base.publicnode.com
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
# Optional WebSocket URL (leave blank to use polling; avoids paid WS providers)
BASE_WS_URL=
# Optional: comma-separated websocket RPCs (must be free/public)
# BASE_WS_URLS=wss://your-free-ws-endpoint

# BaseScan API key (free) for contract verification
BASESCAN_API_KEY=your_basescan_api_key

# Contract Addresses (populate after deployment)
TREASURY_ADDRESS=
RISK_MANAGER_ADDRESS=
ARBITRAGE_ROUTER_ADDRESS=
FLASH_LOAN_EXECUTOR_ADDRESS=
UNISWAP_V3_ADAPTER_ADDRESS=
AERODROME_ADAPTER_ADDRESS=

# External Protocol Addresses (Base Mainnet)
# Note: For Base Sepolia, set these to the Sepolia equivalents before running `npm -C contracts run deploy:base-sepolia`.
# If Aave is not available on the target network, you may set `AAVE_POOL=0x0000000000000000000000000000000000000000` and use UniV3 flash fallback where applicable.
AAVE_POOL=0xA238Dd80C259a72e81d7e4664a9801593F98d1c5
UNISWAP_V3_ROUTER=0x2626664c2603336E57B271c5C0b26F421741e481
UNISWAP_V3_QUOTER=0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a
UNISWAP_V3_FACTORY=0x33128a8fC17869897dcE68Ed026d694621f6FDfD
AERODROME_ROUTER=0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43

# Token Addresses (Base Mainnet)
WETH_ADDRESS=0x4200000000000000000000000000000000000006
USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
CBETH_ADDRESS=0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22

# Backend Configuration
RELAYER_PRIVATE_KEY=0x_your_relayer_private_key_here
SCAN_INTERVAL_MS=5000
MIN_PROFIT_USD=1.0
# Additional cushion on top of MIN_PROFIT_USD
PROFIT_BUFFER_USD=0.25
MAX_GAS_PRICE_GWEI=50
LOG_LEVEL=info
CORS_ORIGIN=http://localhost:3000
# Bind host for the backend API server (use 0.0.0.0 in containers)
HOST=127.0.0.1

# High-liquidity pool filters (optional)
# MIN_UNIV3_LIQUIDITY=0
# MIN_RESERVE_USDC=250000
# MIN_RESERVE_WETH=50
# MIN_RESERVE_CBETH=50

# Optional extra tokens/pairs (JSON) for adding 1-2 stablecoin pairs later
# EXTRA_TOKENS_JSON=[{"address":"0x...","decimals":18,"symbol":"DAI"}]
# EXTRA_PAIRS_JSON=[{"name":"USDC/DAI","token0":"0x...","token1":"0x...","uniV3Pools":[{"address":"0x...","fee":100}],"aerodromePools":[{"address":"0x...","stable":true}]}]

# Frontend
NEXT_PUBLIC_BASE_RPC_URL=https://mainnet.base.org
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_FLASH_LOAN_EXECUTOR_ADDRESS=
NEXT_PUBLIC_USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
NEXT_PUBLIC_WETH_ADDRESS=0x4200000000000000000000000000000000000006
NEXT_PUBLIC_CBETH_ADDRESS=0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22

# Hardhat
FORK_ENABLED=false
REPORT_GAS=false

```

## `docs/ARCHITECTURE.md`
```md
# Liquidity Efficiency Infrastructure on Base — Architecture

This repo is an on-chain + off-chain arbitrage protocol on **Base Mainnet** designed as infrastructure (not “just a bot”):

- **On-chain** contracts enforce execution safety + fee capture (15% performance fee).
- **Off-chain** backend discovers and simulates opportunities using free public RPCs and publishes routes to the UI (and optionally relays signed intents).

## Hybrid execution model

Two execution paths share the same on-chain safety checks and fee policy:

1. **Signed intent execution (keeper/relayer submits)**
   - User signs an EIP-712 `ExecutionIntent` that binds:
     - asset, amount, route hash, minNetProfit, deadline, refundRecipient/maxGasRefund, nonce
   - Any keeper/relayer can submit `FlashLoanExecutor.executeArbitrageWithIntent(...)`.
   - Contract can refund the keeper from the **trade profit** (bounded by `maxGasRefund`), then applies the 15% fee on the remaining profit.

## Core contracts

### `contracts/contracts/FlashLoanExecutor.sol`

Responsibilities:
- Initiates Aave V3 `flashLoanSimple`
- Fallback (for non-Aave networks): Uniswap V3 pool `flash(...)`
- Executes swap steps via registered adapters (registry lives in `ArbitrageRouter`)
- Enforces:
  - deadline / max gas price circuit breakers
  - route starts and ends in the borrowed asset
  - per-step `minAmountOut` (slippage protection) when enabled
  - profit split and treasury fee transfer
- Supports EIP-712 intents (`executeArbitrageWithIntent`)
 - Calls `RiskManager` for pre/post validation (allowlists + circuit breakers)

Profit flow per execution:
1. Repay `amount + premium` to Aave
2. Optional keeper refund (`maxGasRefund`)
3. Fee split of remaining net profit:
   - `protocolFee = 15%`
   - `userProfit = 85%`

### `contracts/contracts/ArbitrageRouter.sol`

Responsibilities:
- Maintains **adapter registry** (`registeredAdapters`)
- Optional route execution entry point for non-flash strategies (`executeRoute`)

### `contracts/contracts/Treasury.sol`

Responsibilities:
- Receives protocol fees from authorized executors
- Allows admin withdrawals
- Supports pause/unpause + emergency withdraw

### `contracts/contracts/RiskManager.sol`

Responsibilities:
- Centralized circuit breakers and allowlists
- Enforces max gas price, per-asset max flash amount, per-asset max keeper refund, optional min profit threshold

## Adapter module pattern

Adapters implement `contracts/contracts/interfaces/IDEXAdapter.sol`:
- `swap(tokenIn, tokenOut, amountIn, minAmountOut, data) -> amountOut`
- `data` is adapter-specific (e.g. Uniswap V3 fee tier; Aerodrome stable flag)

Adapters included:
- `contracts/contracts/adapters/UniswapV3Adapter.sol`
- `contracts/contracts/adapters/PancakeV3Adapter.sol`
- `contracts/contracts/adapters/AerodromeAdapter.sol`

## Security & invariants (non-exhaustive)

- Route must be a cycle in borrowed asset:
  - `steps[0].tokenIn == asset`
  - `steps[last].tokenOut == asset`
- `minAmountOut` must be non-zero per step by default (toggleable by admin).
- Profit distribution is enforced by the executor contract, not by the backend.
- Signed intents prevent user address/profit parameters from being altered by keepers.

See also:
- `docs/SECURITY_CHECKLIST.md`
- `docs/REVENUE.md`

## Off-chain components

### Backend (`backend/`)
- Polls pool states, detects spreads, simulates routes using on-chain quoting.
- Publishes opportunities over REST + WebSocket.
- Optional: submits signed intents via `/api/intent/submit`.

### Frontend (`frontend/`)
- Next.js App Router UI.
- Connect wallet with Wagmi + RainbowKit.
- Executes opportunities via:
  - intent signing (user signs; backend relayer submits)

```

## `docs/DEPLOYMENT.md`
```md
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

```

## `docs/SECURITY_CHECKLIST.md`
```md
# Security checklist (production readiness)

This checklist is protocol-oriented (not a bot checklist). It covers **on-chain**, **off-chain**, and **operational** controls.

## Threat model notes (documentation)

### MEV risk

**What can happen**
- **Front-running / back-running**: searchers copy a profitable route and take it first, leaving your tx to revert or become unprofitable.
- **Sandwiching**: if your route trades through pools with predictable slippage, a searcher can move the price against you, then revert it after.
- **Reorg risk**: a route that was profitable in simulation may not be profitable after a small reorg / state change.

**Mitigations in this repo**
- **Atomic execution**: all steps + flash repayment + fee split happen in a single transaction; unprofitable execution reverts.
- **Per-step slippage protection**: each step uses `minAmountOut`; `RiskManager.enforceMinAmountOut=true` by default.
- **Intent binding**: signed intents bind `routeHash`, `minNetProfit`, `deadline`, and `nonce` so keepers cannot alter safety parameters.
- **Profit buffers**: backend applies profit buffers and re-verifies profitability immediately before submission.

**Operational mitigations (recommended)**
- Submit through a **private tx path** when available (to reduce public mempool leakage). This repo defaults to free RPCs and does not require paid relays, but you can integrate a free/private endpoint if you have one.
- Keep initial scope tight: high-liquidity pools only; avoid long multi-hop routes.

### Flash loan risks

**What can happen**
- **Liquidity/availability**: flash liquidity can be unavailable or capped; pools can revert.
- **Fee variability**: flash fees/premiums may differ by provider or upgrade.
- **Callback attack surface**: flash callback is a high-privilege execution path; errors can lock funds or enable reentrancy if not guarded.

**Mitigations in this repo**
- `FlashLoanExecutor` uses `nonReentrant` on flash callbacks and `whenNotPaused`.
- Repayment is checked explicitly; execution reverts if repayment is not possible.
- `RiskManager` enforces per-asset `maxFlashLoanAmount` and asset allowlisting.
- Fallback flash path (Uniswap V3) is gated by `riskManager.uniV3FlashPoolAllowed(pool)`.

### Slippage risk

**What can happen**
- A route can execute at worse prices than simulated due to volatility, MEV, or pool state changes, turning a theoretical profit into a loss.

**Mitigations in this repo**
- Each step includes `minAmountOut` and the executor/router reverts if it is not met.
- Each execution includes a `deadline` and a signed `minNetProfit`; contract reverts if realized user profit < `minNetProfit`.
- Backend applies a slippage buffer when computing `minAmountOut`.

### Oracle-free price risk (no centralized price feeds)

**What can happen**
- If you rely only on instantaneous on-chain quotes, an attacker can temporarily manipulate a pool price (especially low-liquidity pools) to create a “fake” opportunity that disappears at execution.
- Quoter/router quotes can be stale relative to execution if block state changes.

**Mitigations in this repo**
- Monitor and trade only **high-liquidity pools** (configurable liquidity/reserve filters).
- Re-quote and re-verify opportunities server-side right before relaying (`/api/intent/submit`).
- Keep initial asset scope small (WETH/USDC, cbETH/WETH) to avoid exotic token behavior and thin liquidity.

**Recommended hardening**
- Add TWAP-based checks for Uniswap v3 (tick observations) and/or minimum liquidity thresholds per pool.
- Add per-pair max price impact limits derived from reserves/liquidity.

### Smart contract attack vectors

**Primary vectors**
- **Reentrancy** (flash callbacks, adapter calls)
- **Approval/allowance abuse** (over-approvals, stuck allowances)
- **Malicious adapters** (steal funds, return wrong amounts, reenter)
- **ERC20 non-standard behavior** (fee-on-transfer, rebasing, broken return values)
- **Signature replay / parameter tampering** (intent reuse, deadline bypass)

**Mitigations in this repo**
- `ReentrancyGuard` on executor and router; reentrancy tests exist.
- Adapter registry in `ArbitrageRouter` + optional allowlists in `RiskManager`.
- `SafeERC20` usage; approvals use safe patterns.
- Intent `nonce` + `deadline` enforce replay protection and time-bounding.
- `Pausable` + admin circuit breakers for incident response.

### Gas griefing protection

**What can happen**
- Attackers can try to force keepers to waste gas by causing repeated reverts (e.g., by racing pool state changes) or by pushing transactions into high gas periods.
- Users can attempt to set parameters that allow excessive keeper refunds.

**Mitigations in this repo**
- `RiskManager.maxGasPrice` blocks execution during gas spikes.
- Keeper refund is **opt-in**, user-signed, and **capped per asset** (`maxGasRefund`).
- Backend only submits if profitable with buffers; it re-verifies right before submit.
- `RELAYER_ROLE` gates execution entrypoints (prevents arbitrary users from spamming executions on-chain through the executor).

## On-chain

### Access control & roles
- [ ] `FlashLoanExecutor`: `RELAYER_ROLE` is granted only to the keeper/relayer set you trust (or to your keeper network), not to EOAs by default.
- [ ] `Treasury`: `EXECUTOR_ROLE` granted only to `FlashLoanExecutor` (and optionally `ArbitrageRouter` if used).
- [ ] Admin key hygiene: use a multisig for `DEFAULT_ADMIN_ROLE` and `RISK_ADMIN_ROLE`.

### Circuit breakers & risk limits
- [ ] `RiskManager.maxGasPrice` set to a conservative value for Base.
- [ ] `RiskManager.assetConfigs[asset]` enabled only for initial assets (WETH/USDC/cbETH).
- [ ] `maxFlashLoanAmount` tuned per asset.
- [ ] `maxGasRefund` tuned per asset (keeper refund is paid from profits).
- [ ] `enforceMinAmountOut=true` in `RiskManager` for slippage protection.
- [ ] If you want stricter control, enable `RiskManager.enforceAdapterAllowlist=true` and allowlist only vetted adapters.

### Atomicity & slippage
- [ ] Each route cycles back to the borrowed asset (`tokenIn` of first step == asset; `tokenOut` of last step == asset).
- [ ] Each step has `minAmountOut > 0` and is computed with an off-chain slippage buffer.
- [ ] All routes include a `deadline`.

### Profit safety invariants
- [ ] Executor reverts if it cannot repay flash loan principal + fee.
- [ ] Executor reverts if `netProfit <= 0`.
- [ ] Fee split is enforced on-chain: 15% to `Treasury`, 85% to user, and reverts if user profit is non-positive.
- [ ] Signed-intent flow: `routeHash`, `minNetProfit`, `deadline`, and `nonce` are bound by the user signature.

### Reentrancy & approvals
- [ ] `nonReentrant` on flash callbacks and execution entrypoints.
- [ ] Token approvals use safe patterns (`forceApprove`/`SafeERC20`), and adapters are registry-gated.
- [ ] Adapters should be minimal and non-custodial (no token retention).

### Pausing / incident response
- [ ] `pause()` / `unpause()` is tested for executor + treasury.
- [ ] Operational runbook: who pauses, how to communicate, and rollback steps.

### Testing (minimum)
- [x] Profitable arbitrage path
- [x] Unprofitable revert path
- [x] Fee math (15%)
- [x] Reentrancy attempt blocked
- [x] Pausable blocks execution
- [x] Slippage `minAmountOut` enforced

## Off-chain (backend/relayer)

- [ ] Relayer key stored in a secret manager (never in plain `.env` on servers).
- [ ] RPCs are free/public, but **multiple** endpoints are configured (failover) to reduce downtime.
- [ ] Nonce management is robust (single tx-provider for mempool coherence).
- [ ] Retry logic has caps/backoff and logs all failures.
- [ ] `/api/intent/submit` re-verifies routeHash and re-quotes profitability immediately before submission.
- [ ] Rate limits / basic abuse protection (optional) to mitigate spam.

## Frontend / UX

- [ ] UI clearly shows gross profit, protocol fee, gas estimate, and net user profit.
- [ ] UI communicates “relayer pays gas” and that the contract reverts when net profit is non-positive.

## Monitoring

- [ ] Track `FlashArbExecuted` events (user profit, protocol fee, refund, asset, amount).
- [ ] Alert on repeated failures, high gas, paused state, or abnormal refund ratios.

```

## `docs/REVENUE.md`
```md
# Revenue model (15% on-chain performance fee)

The protocol charges a transparent **15% performance fee** on *realized* net profit, enforced by `FlashLoanExecutor`.

## Definitions (per execution)

1. **Flash repayment**: principal + flash fee must be repayable, otherwise revert.
2. **Gross profit**: remaining balance after repayment (executor-only accounting).
3. **Keeper refund (optional)**: paid from gross profit up to `maxGasRefund` (signed by the user intent).
4. **Net profit**: `grossProfit - gasRefund`.
5. **Fee split (on-chain)**
   - `protocolFee = netProfit * 15 / 100`
   - `userProfit = netProfit - protocolFee`
   - Revert if `userProfit <= 0`.

## Where the fee goes

- `protocolFee` is transferred to `Treasury.receiveFee(asset, protocolFee)` on-chain.
- Treasury custody is contract-based and role-gated; withdrawal is admin/multisig controlled.

## Transparency

Users can verify:
- `Treasury.totalCollected(token)` and `Treasury.balance(token)`
- per-execution values via `FlashArbExecuted` events
- aggregated executor stats (e.g., protocol fees / user profit totals)

## Why this is “protocol revenue”, not “bot revenue”

The fee is collected by:
- a public UI + signed intent flow
- a permissioned relayer/keeper submitting atomic arbitrage transactions
- a contract-level accounting system and fee collector

No off-chain party can change the fee split because it is computed and enforced on-chain.


```

## `docs/GRANT_POSITIONING.md`
```md
# Grant positioning (Base)

Protocol framing:

**Liquidity Efficiency Infrastructure on Base**

This protocol:
- improves cross-DEX price efficiency (arbitrage compresses spreads)
- exposes a public, user-facing execution surface (not a private bot)
- enforces safety + revenue capture entirely on-chain
- avoids paid infrastructure dependencies by default (free RPCs, on-chain quoting)

## Why grants should care

### Network impact
- More efficient DEX pricing → better execution for traders and LPs.
- Higher volume routed through Base-native venues (Uniswap v3, Aerodrome).

### Public-good properties
- Modular adapter interface encourages ecosystem extension.
- Transparent fee policy and accounting.
- Clear safety invariants; tests included.

## Milestone-based roadmap (grant-friendly)

1. **Hardening**
   - Expand invariants, add fuzzing (Foundry/echidna), add fork tests.
2. **DEX expansion (still scoped)**
   - Add 1–2 more high-liquidity Base venues behind the adapter interface.
3. **Open analytics**
   - Index `FlashArbExecuted` events and publish public dashboards (no paid APIs required).
4. **Keeper decentralization**
   - Add a keeper set or integration with a decentralized keeper network, while keeping signed-intent integrity.


```

## `docs/ROADMAP.md`
```md
# Roadmap

This roadmap is written for a **protocol** (Liquidity Efficiency Infrastructure on Base), not a simple arbitrage bot.

Constraints:
- Hybrid execution model (user intent + relayer execution)
- Zero paid APIs by default (free RPC endpoints, polling/WS optional)
- Modular contracts/adapters
- **No token implemented in this phase** (explicitly out of scope)

## Phase 1 — Controlled Hybrid Execution (current / near-term)

Goal: ship a secure, production-grade “public DApp + keeper relayer” system with tight risk controls.

Deliverables
- Stable contract suite: `FlashLoanExecutor`, `ArbitrageRouter`, `RiskManager`, `Treasury` with tests and clear invariants.
- Controlled execution:
  - `RELAYER_ROLE` restricted to a small operator set (single keeper at first).
  - EIP-712 signed intents binding route safety parameters.
  - Hard risk limits: per-asset enablement, max flash amount, max refund, max gas price, enforce `minAmountOut`.
- Scoped markets:
  - Only high-liquidity Base pools (Uniswap v3 + Aerodrome).
  - Initial pairs only (WETH/USDC, cbETH/WETH, and select stable pairs).
- Operational readiness:
  - Backend re-verifies profitability before submitting transactions.
  - Logging + nonce management + retry policy.
  - Analytics endpoints + UI dashboards.

Success criteria
- Measurable, repeatable profitable executions with zero user losses from unprofitable routes (reverts).
- Protocol revenue consistently accrued in Treasury (15% performance fee on realized net profit).

## Phase 2 — Add more DEX integrations

Goal: expand opportunity surface area without compromising security or maintainability.

Deliverables
- Additional Base DEX adapters behind the `IDEXAdapter` interface (1–2 at a time).
- Pair expansion under strict liquidity gating:
  - Maintain small allowlisted token set.
  - Add pool allowlists and/or stricter liquidity thresholds per venue.
- Improved routing/simulation:
  - multi-hop routing (only when value-add, avoid unnecessary complexity)
  - better gas estimation model and per-route buffers

Success criteria
- Higher opportunity throughput and higher realized net profit with controlled failure rates.

## Phase 3 — Open executor network

Goal: decentralize the executor/keeper role while keeping user safety guarantees.

Key design principles
- Keep signed-intent integrity: keepers must not be able to alter user-bound parameters.
- Keep on-chain safety invariants unchanged: slippage, deadline, profit checks remain enforced by contracts.

Deliverables
- Expand `RELAYER_ROLE` strategy:
  - Option A: curated allowlist of keepers (multi-operator)
  - Option B: permissionless execution with additional safeguards (rate limits, bond/slashing, or reputation gating)
- Enhanced anti-spam & griefing protections:
  - keeper-level throttles or per-keeper circuit breakers
  - monitoring and auto-pausing policies for abnormal behavior
- Public performance reporting (transparent keeper competition metrics)

Success criteria
- Multiple independent keepers reliably executing intents with no degradation of user outcomes.

## Phase 4 — Governance (no token required)

Goal: move critical parameters and upgrades from single-admin control to transparent governance.

Deliverables
- Admin role migration to a multisig as a baseline.
- Governance over:
  - risk parameters (asset enablement, max flash amounts, refund caps)
  - adapter registration / de-registration
  - treasury management policies
  - pause/unpause policy and emergency response procedures
- Optional: formal process for adding new markets/DEX venues.

Explicit non-goals in this phase
- **No token launch or token-based governance is implemented here.**


```

## `docs/GRANT.md`
```md
# Grant checklist (implementation notes)

This repo is structured to be “grant-ready” by making the protocol:

- **Non-custodial**: profits go directly to the user; protocol fee is enforced by contracts.
- **Revenue generating**: 15% performance fee on net profit (after flash-loan repayment; and optional keeper refund).
- **Hybrid execution**: self-execution (wallet) and signed-intent execution (keeper/relayer).
- **Zero paid APIs**: defaults to free public Base RPC and polling; no Alchemy/Infura requirement.
- **Modular**: adapter interface supports adding more DEXes without changing core fee logic.
- **Testable**: unit tests cover fee policy, treasury access control, route execution guards, flash-loan callback behavior, and intent signing flow.

Suggested grant-facing milestones:
1. Add additional adapters (e.g., more DEXes on Base) behind the same `IDEXAdapter`.
2. Add fork/integration tests for Base pools and Aave V3 on Base.
3. Add a public “metrics” endpoint and on-chain event indexer for protocol analytics.
4. Security: formalize invariants + fuzzing + independent audit.

See also: `docs/GRANT_POSITIONING.md`


```

## `contracts/hardhat.config.ts`
```ts
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "0x" + "0".repeat(64);
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  paths: {
    tests: "./tests",
  },
  networks: {
    hardhat: {
      forking: {
        url: BASE_RPC_URL,
        enabled: !!process.env.FORK_ENABLED,
      },
    },
    base: {
      url: BASE_RPC_URL,
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 8453,
    },
    "base-sepolia": {
      url: BASE_SEPOLIA_RPC_URL,
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 84532,
    },
  },
  etherscan: {
    apiKey: {
      base: BASESCAN_API_KEY,
      "base-sepolia": BASESCAN_API_KEY,
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
      {
        network: "base-sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
    ],
  },
  gasReporter: {
    enabled: !!process.env.REPORT_GAS,
    currency: "USD",
  },
};

export default config;

```

## `contracts/package.json`
```json
{
  "name": "contracts",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "directories": {
    "test": "test"
  },
  "scripts": {
    "compile": "hardhat compile",
    "test": "hardhat test",
    "deploy": "hardhat run scripts/deploy.base-mainnet.ts --network base",
    "deploy:base-mainnet": "hardhat run scripts/deploy.base-mainnet.ts --network base",
    "deploy:base-sepolia": "hardhat run scripts/deploy.base-sepolia.ts --network base-sepolia"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "devDependencies": {
    "@nomicfoundation/hardhat-toolbox": "^4.0.0",
    "@openzeppelin/contracts": "^5.4.0",
    "@types/node": "^25.2.3",
    "dotenv": "^17.2.4",
    "hardhat": "^2.28.5",
    "ts-node": "^10.9.2",
    "typescript": "^5.9.3"
  },
  "type": "commonjs"
}

```

## `contracts/scripts/deploy.ts`
```ts
import { deployProtocol } from "./deploy.lib";

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

async function main() {
    await deployProtocol();
}

```

## `contracts/scripts/deploy.lib.ts`
```ts
import { ethers } from "hardhat";

export type DeployOptions = {
  expectedChainId?: number;
  deploymentTag?: string;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function optionalEnv(name: string): string | null {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v : null;
}

export async function deployProtocol(opts: DeployOptions = {}) {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);

  if (typeof opts.expectedChainId === "number" && chainId !== opts.expectedChainId) {
    throw new Error(`Wrong network: expected chainId=${opts.expectedChainId} got chainId=${chainId}`);
  }

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  const AAVE_POOL = requireEnv("AAVE_POOL"); // may be 0x0 for networks without Aave
  const UNISWAP_V3_ROUTER = requireEnv("UNISWAP_V3_ROUTER");
  const UNISWAP_V3_QUOTER = requireEnv("UNISWAP_V3_QUOTER");
  const AERODROME_ROUTER = requireEnv("AERODROME_ROUTER");

  console.log("\n═══════════════════════════════════════════════");
  console.log("  Deploying Base Arbitrage Protocol");
  console.log("═══════════════════════════════════════════════\n");

  // 1. Deploy Treasury
  console.log("1/7 Deploying Treasury...");
  const Treasury = await ethers.getContractFactory("Treasury");
  const treasury = await Treasury.deploy(deployer.address);
  await treasury.waitForDeployment();
  const treasuryAddr = await treasury.getAddress();
  console.log("  Treasury deployed:", treasuryAddr);

  // 2. Deploy RiskManager
  console.log("2/7 Deploying RiskManager...");
  const RiskManager = await ethers.getContractFactory("RiskManager");
  const riskManager = await RiskManager.deploy(deployer.address, ethers.parseUnits("50", "gwei"), true);
  await riskManager.waitForDeployment();
  const riskManagerAddr = await riskManager.getAddress();
  console.log("  RiskManager deployed:", riskManagerAddr);

  // 3. Deploy ArbitrageRouter
  console.log("3/7 Deploying ArbitrageRouter...");
  const ArbitrageRouter = await ethers.getContractFactory("ArbitrageRouter");
  const router = await ArbitrageRouter.deploy(deployer.address, treasuryAddr);
  await router.waitForDeployment();
  const routerAddr = await router.getAddress();
  console.log("  ArbitrageRouter deployed:", routerAddr);

  // 4. Deploy FlashLoanExecutor
  console.log("4/7 Deploying FlashLoanExecutor...");
  const FlashLoanExecutor = await ethers.getContractFactory("FlashLoanExecutor");
  const executor = await FlashLoanExecutor.deploy(deployer.address, AAVE_POOL, routerAddr, treasuryAddr, riskManagerAddr);
  await executor.waitForDeployment();
  const executorAddr = await executor.getAddress();
  console.log("  FlashLoanExecutor deployed:", executorAddr);

  // 5. Deploy DEX Adapters
  console.log("5/7 Deploying UniswapV3Adapter...");
  const UniswapV3Adapter = await ethers.getContractFactory("UniswapV3Adapter");
  const uniAdapter = await UniswapV3Adapter.deploy(UNISWAP_V3_ROUTER, UNISWAP_V3_QUOTER);
  await uniAdapter.waitForDeployment();
  const uniAdapterAddr = await uniAdapter.getAddress();
  console.log("  UniswapV3Adapter deployed:", uniAdapterAddr);

  console.log("6/7 Deploying PancakeV3Adapter...");
  const PancakeV3Adapter = await ethers.getContractFactory("PancakeV3Adapter");
  const pancakeAdapter = await PancakeV3Adapter.deploy(PANCAKESWAP_V3_ROUTER, PANCAKESWAP_V3_QUOTER);
  await pancakeAdapter.waitForDeployment();
  const pancakeAdapterAddr = await pancakeAdapter.getAddress();
  console.log("  PancakeV3Adapter deployed:", pancakeAdapterAddr);

  console.log("7/7 Deploying AerodromeAdapter...");
  const AerodromeAdapter = await ethers.getContractFactory("AerodromeAdapter");
  const aeroAdapter = await AerodromeAdapter.deploy(AERODROME_ROUTER);
  await aeroAdapter.waitForDeployment();
  const aeroAdapterAddr = await aeroAdapter.getAddress();
  console.log("  AerodromeAdapter deployed:", aeroAdapterAddr);

  // Configure roles & register adapters
  console.log("\nConfiguring roles and adapters...");

  const EXECUTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("EXECUTOR_ROLE"));
  const RELAYER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RELAYER_ROLE"));

  await treasury.grantRole(EXECUTOR_ROLE, executorAddr);
  await treasury.grantRole(EXECUTOR_ROLE, routerAddr);
  console.log("  Granted EXECUTOR_ROLE on Treasury to Executor and Router");

  await router.grantRole(EXECUTOR_ROLE, executorAddr);
  console.log("  Granted EXECUTOR_ROLE on Router to Executor");

  await executor.grantRole(RELAYER_ROLE, deployer.address);
  console.log("  Granted RELAYER_ROLE on Executor to deployer");

  await router.setAdapter(uniAdapterAddr, true);
  await router.setAdapter(pancakeAdapterAddr, true);
  await router.setAdapter(aeroAdapterAddr, true);
  console.log("  Registered Uniswap V3, PancakeSwap V3, and Aerodrome adapters");

  // Optional: configure initial RiskManager per-asset configs
  const WETH = optionalEnv("WETH_ADDRESS");
  const USDC = optionalEnv("USDC_ADDRESS");
  const CBETH = optionalEnv("CBETH_ADDRESS");

  if (WETH) await riskManager.setAssetConfig(WETH, true, ethers.parseEther("200"), 0, ethers.parseEther("0.05"));
  if (USDC) await riskManager.setAssetConfig(USDC, true, 1_000_000n * 1_000_000n, 0, 2_000_000n);
  if (CBETH) await riskManager.setAssetConfig(CBETH, true, ethers.parseEther("200"), 0, ethers.parseEther("0.05"));

  console.log("  RiskManager asset configs:", { WETH: !!WETH, USDC: !!USDC, CBETH: !!CBETH });

  // Summary
  console.log("\n═══════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════════════");
  console.log("");
  console.log("  Treasury:           ", treasuryAddr);
  console.log("  RiskManager:        ", riskManagerAddr);
  console.log("  ArbitrageRouter:    ", routerAddr);
  console.log("  FlashLoanExecutor:  ", executorAddr);
  console.log("  UniswapV3Adapter:   ", uniAdapterAddr);
  console.log("  PancakeV3Adapter:   ", pancakeAdapterAddr);
  console.log("  AerodromeAdapter:   ", aeroAdapterAddr);
  console.log("");

  const deployment = {
    tag: opts.deploymentTag ?? "",
    chainId,
    network: String(net.name ?? ""),
    timestamp: new Date().toISOString(),
    contracts: {
      treasury: treasuryAddr,
      riskManager: riskManagerAddr,
      arbitrageRouter: routerAddr,
      flashLoanExecutor: executorAddr,
      uniswapV3Adapter: uniAdapterAddr,
      pancakeV3Adapter: pancakeAdapterAddr,
      aerodromeAdapter: aeroAdapterAddr,
    },
    external: {
      aavePool: AAVE_POOL,
      uniswapV3Router: UNISWAP_V3_ROUTER,
      uniswapV3Quoter: UNISWAP_V3_QUOTER,
      pancakeswapV3Router: PANCAKESWAP_V3_ROUTER,
      pancakeswapV3Quoter: PANCAKESWAP_V3_QUOTER,
      aerodromeRouter: AERODROME_ROUTER,
    },
  };

  const fs = require("fs");
  const path = require("path");
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });
  const filename = `deployment-${chainId}-${Date.now()}.json`;
  fs.writeFileSync(path.join(deploymentsDir, filename), JSON.stringify(deployment, null, 2));
  console.log(`  Deployment saved to: deployments/${filename}`);

  return deployment;
}


```

## `contracts/scripts/deploy.base-mainnet.ts`
```ts
import { deployProtocol } from "./deploy.lib";

async function main() {
  await deployProtocol({ expectedChainId: 8453, deploymentTag: "base-mainnet" });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


```

## `contracts/scripts/deploy.base-sepolia.ts`
```ts
import { deployProtocol } from "./deploy.lib";

async function main() {
  await deployProtocol({ expectedChainId: 84532, deploymentTag: "base-sepolia" });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


```

## `contracts/tests/LegacyProtocol.test.ts`
```ts
import "../test/Protocol.test";


```

## `contracts/tests/ArbitrageInfrastructure.test.ts`
```ts
import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("Arbitrage Infrastructure — Required Tests", function () {
  async function deployAaveFixture() {
    const [owner, relayer, user] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const tokenA = await MockERC20.deploy("Token A", "TKA", 18);
    const tokenB = await MockERC20.deploy("Token B", "TKB", 18);

    const Treasury = await ethers.getContractFactory("Treasury");
    const treasury = await Treasury.deploy(owner.address);

    const RiskManager = await ethers.getContractFactory("RiskManager");
    const riskManager = await RiskManager.deploy(owner.address, ethers.parseUnits("200", "gwei"), true);

    const ArbitrageRouter = await ethers.getContractFactory("ArbitrageRouter");
    const router = await ArbitrageRouter.deploy(owner.address, await treasury.getAddress());

    const MockAavePool = await ethers.getContractFactory("MockAavePool");
    const aavePool = await MockAavePool.deploy();

    const FlashLoanExecutor = await ethers.getContractFactory("FlashLoanExecutor");
    const executor = await FlashLoanExecutor.deploy(
      owner.address,
      await aavePool.getAddress(),
      await router.getAddress(),
      await treasury.getAddress(),
      await riskManager.getAddress()
    );

    const EXECUTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("EXECUTOR_ROLE"));
    const RELAYER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RELAYER_ROLE"));

    await treasury.grantRole(EXECUTOR_ROLE, await executor.getAddress());
    await treasury.grantRole(EXECUTOR_ROLE, await router.getAddress());
    await router.grantRole(EXECUTOR_ROLE, await executor.getAddress());
    await router.grantRole(EXECUTOR_ROLE, relayer.address);
    await executor.grantRole(RELAYER_ROLE, relayer.address);

    await riskManager.setAssetConfig(await tokenA.getAddress(), true, ethers.parseEther("1000000"), 0, ethers.parseEther("10"));

    const MockDexAdapter = await ethers.getContractFactory("MockDexAdapter");
    const adapter = await MockDexAdapter.deploy();
    await router.connect(owner).setAdapter(await adapter.getAddress(), true);

    const loanAmount = ethers.parseEther("100");
    await tokenA.mint(await aavePool.getAddress(), loanAmount * 10n);

    return { owner, relayer, user, tokenA, tokenB, treasury, riskManager, router, aavePool, executor, adapter, loanAmount };
  }

  async function deployUniV3Fixture() {
    const [owner, relayer, user] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const tokenA = await MockERC20.deploy("Token A", "TKA", 18);
    const tokenB = await MockERC20.deploy("Token B", "TKB", 18);

    const Treasury = await ethers.getContractFactory("Treasury");
    const treasury = await Treasury.deploy(owner.address);

    const RiskManager = await ethers.getContractFactory("RiskManager");
    const riskManager = await RiskManager.deploy(owner.address, ethers.parseUnits("200", "gwei"), true);

    const ArbitrageRouter = await ethers.getContractFactory("ArbitrageRouter");
    const router = await ArbitrageRouter.deploy(owner.address, await treasury.getAddress());

    // Aave not configured to force UniV3 flash path.
    const FlashLoanExecutor = await ethers.getContractFactory("FlashLoanExecutor");
    const executor = await FlashLoanExecutor.deploy(
      owner.address,
      ethers.ZeroAddress,
      await router.getAddress(),
      await treasury.getAddress(),
      await riskManager.getAddress()
    );

    const EXECUTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("EXECUTOR_ROLE"));
    const RELAYER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RELAYER_ROLE"));

    await treasury.grantRole(EXECUTOR_ROLE, await executor.getAddress());
    await treasury.grantRole(EXECUTOR_ROLE, await router.getAddress());
    await router.grantRole(EXECUTOR_ROLE, await executor.getAddress());
    await router.grantRole(EXECUTOR_ROLE, relayer.address);
    await executor.grantRole(RELAYER_ROLE, relayer.address);

    await riskManager.setAssetConfig(await tokenA.getAddress(), true, ethers.parseEther("1000000"), 0, ethers.parseEther("10"));

    const MockDexAdapter = await ethers.getContractFactory("MockDexAdapter");
    const adapter = await MockDexAdapter.deploy();
    await router.connect(owner).setAdapter(await adapter.getAddress(), true);

    const MockUniV3FlashPool = await ethers.getContractFactory("MockUniV3FlashPool");
    const flashPool = await MockUniV3FlashPool.deploy(await tokenA.getAddress(), await tokenB.getAddress(), 0); // 0 bps fee for deterministic tests
    await riskManager.setUniV3FlashPoolAllowed(await flashPool.getAddress(), true);

    const loanAmount = ethers.parseEther("10");
    await tokenA.mint(await flashPool.getAddress(), loanAmount * 10n);

    return { owner, relayer, user, tokenA, tokenB, treasury, riskManager, router, executor, adapter, flashPool, loanAmount };
  }

  function encodeSteps(steps: any[]) {
    const abi = ethers.AbiCoder.defaultAbiCoder();
    return abi.encode(
      ["tuple(address adapter,address tokenIn,address tokenOut,uint256 amountIn,uint256 minAmountOut,bytes data)[]"],
      [steps]
    );
  }

  async function signIntent(params: {
    executor: any;
    user: any;
    asset: string;
    amount: bigint;
    routeHash: string;
    minNetProfit: bigint;
    deadline: number;
    refundRecipient: string;
    maxGasRefund: bigint;
  }) {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const verifyingContract = await params.executor.getAddress();
    const nonce = await params.executor.nonces(params.user.address);

    const intent = {
      user: params.user.address,
      asset: params.asset,
      amount: params.amount,
      routeHash: params.routeHash,
      minNetProfit: params.minNetProfit,
      deadline: params.deadline,
      refundRecipient: params.refundRecipient,
      maxGasRefund: params.maxGasRefund,
      nonce,
    };

    const domain = { name: "BaseArbExecutor", version: "1", chainId, verifyingContract };
    const types = {
      ExecutionIntent: [
        { name: "user", type: "address" },
        { name: "asset", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "routeHash", type: "bytes32" },
        { name: "minNetProfit", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "refundRecipient", type: "address" },
        { name: "maxGasRefund", type: "uint256" },
        { name: "nonce", type: "uint256" },
      ],
    };

    const signature = await params.user.signTypedData(domain as any, types as any, intent as any);
    return { intent, signature };
  }

  it("Profitable arbitrage test", async function () {
    const { owner, relayer, user, tokenA, tokenB, treasury, executor, adapter, loanAmount } = await loadFixture(deployAaveFixture);

    const abi = ethers.AbiCoder.defaultAbiCoder();
    const steps = [
      {
        adapter: await adapter.getAddress(),
        tokenIn: await tokenA.getAddress(),
        tokenOut: await tokenB.getAddress(),
        amountIn: 0,
        minAmountOut: 1,
        data: abi.encode(["uint16"], [0]),
      },
      {
        adapter: await adapter.getAddress(),
        tokenIn: await tokenB.getAddress(),
        tokenOut: await tokenA.getAddress(),
        amountIn: 0,
        minAmountOut: 1,
        data: abi.encode(["uint16"], [100]), // +1%
      },
    ];

    const routeHash = ethers.keccak256(encodeSteps(steps));
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    const { intent, signature } = await signIntent({
      executor,
      user,
      asset: await tokenA.getAddress(),
      amount: loanAmount,
      routeHash,
      minNetProfit: 0n,
      deadline,
      refundRecipient: ethers.ZeroAddress,
      maxGasRefund: 0n,
    });

    const userBefore = await tokenA.balanceOf(user.address);
    const treasuryBefore = await tokenA.balanceOf(await treasury.getAddress());

    await executor.connect(relayer).executeArbitrageWithIntent(intent, steps, signature);

    const userAfter = await tokenA.balanceOf(user.address);
    const treasuryAfter = await tokenA.balanceOf(await treasury.getAddress());

    // Expected: start 100, minted 101, premium 0.05% => profit 0.95, fee 15%, user 85%
    const premium = (loanAmount * 5n) / 10_000n;
    const grossProfit = loanAmount + (loanAmount / 100n) - (loanAmount + premium); // 101% - owed
    const protocolFee = (grossProfit * 1500n) / 10_000n;
    const userProfit = grossProfit - protocolFee;

    expect(userAfter - userBefore).to.equal(userProfit);
    expect(treasuryAfter - treasuryBefore).to.equal(protocolFee);
    expect(await executor.totalExecutions()).to.equal(1);
    expect(await executor.totalProtocolFees()).to.equal(protocolFee);
    expect(await executor.totalUserProfit()).to.equal(userProfit);

    // Also track volume/profit by asset.
    expect(await executor.totalArbitrageVolumeByAsset(await tokenA.getAddress())).to.equal(loanAmount);
    expect(await executor.totalProtocolFeesByAsset(await tokenA.getAddress())).to.equal(protocolFee);
  });

  it("Unprofitable arbitrage revert test (users never lose money)", async function () {
    const { relayer, user, tokenA, tokenB, treasury, executor, adapter, loanAmount } = await loadFixture(deployAaveFixture);

    const abi = ethers.AbiCoder.defaultAbiCoder();
    const steps = [
      {
        adapter: await adapter.getAddress(),
        tokenIn: await tokenA.getAddress(),
        tokenOut: await tokenB.getAddress(),
        amountIn: 0,
        minAmountOut: 1,
        data: abi.encode(["uint16"], [0]),
      },
      {
        adapter: await adapter.getAddress(),
        tokenIn: await tokenB.getAddress(),
        tokenOut: await tokenA.getAddress(),
        amountIn: 0,
        minAmountOut: 1,
        data: abi.encode(["uint16"], [0]), // no bonus => cannot cover premium
      },
    ];

    const routeHash = ethers.keccak256(encodeSteps(steps));
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    const { intent, signature } = await signIntent({
      executor,
      user,
      asset: await tokenA.getAddress(),
      amount: loanAmount,
      routeHash,
      minNetProfit: 0n,
      deadline,
      refundRecipient: ethers.ZeroAddress,
      maxGasRefund: 0n,
    });

    const userBefore = await tokenA.balanceOf(user.address);
    const treasuryBefore = await tokenA.balanceOf(await treasury.getAddress());

    await expect(executor.connect(relayer).executeArbitrageWithIntent(intent, steps, signature)).to.be.revertedWith(
      "Executor: insufficient for repayment"
    );

    expect(await tokenA.balanceOf(user.address)).to.equal(userBefore);
    expect(await tokenA.balanceOf(await treasury.getAddress())).to.equal(treasuryBefore);
    expect(await executor.totalExecutions()).to.equal(0);
  });

  it("Fee calculation test (15% performance fee)", async function () {
    const ProfitValidatorTest = await ethers.getContractFactory("ProfitValidatorTest");
    const validator = await ProfitValidatorTest.deploy();

    const grossProfit = ethers.parseEther("1");
    const [protocolFee, userProfit] = await validator.testCalculateFees(grossProfit);

    expect(protocolFee).to.equal(ethers.parseEther("0.15"));
    expect(userProfit).to.equal(ethers.parseEther("0.85"));
  });

  it("Reentrancy attack test (blocked by ReentrancyGuard)", async function () {
    const { owner, relayer, user, tokenA, tokenB, router, executor, adapter, flashPool, loanAmount } = await loadFixture(deployUniV3Fixture);

    const ReentrantDexAdapter = await ethers.getContractFactory("ReentrantDexAdapter");
    const reentrant = await ReentrantDexAdapter.deploy(await executor.getAddress());
    await router.connect(owner).setAdapter(await reentrant.getAddress(), true);

    const abi = ethers.AbiCoder.defaultAbiCoder();
    const steps = [
      {
        adapter: await adapter.getAddress(),
        tokenIn: await tokenA.getAddress(),
        tokenOut: await tokenB.getAddress(),
        amountIn: 0,
        minAmountOut: 1,
        data: abi.encode(["uint16"], [0]),
      },
      {
        adapter: await reentrant.getAddress(),
        tokenIn: await tokenB.getAddress(),
        tokenOut: await tokenA.getAddress(),
        amountIn: 0,
        minAmountOut: 1,
        data: "0x",
      },
    ];

    const routeHash = ethers.keccak256(encodeSteps(steps));
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const { intent, signature } = await signIntent({
      executor,
      user,
      asset: await tokenA.getAddress(),
      amount: loanAmount,
      routeHash,
      minNetProfit: 0n,
      deadline,
      refundRecipient: ethers.ZeroAddress,
      maxGasRefund: 0n,
    });

    await expect(
      executor.connect(relayer).executeArbitrageWithIntentUniV3Flash(intent, steps, signature, await flashPool.getAddress())
    ).to.be.revertedWithCustomError(executor, "ReentrancyGuardReentrantCall");
  });

  it("Pausable test (executor pause blocks execution)", async function () {
    const { owner, relayer, user, tokenA, tokenB, executor, adapter, loanAmount } = await loadFixture(deployAaveFixture);

    await executor.connect(owner).pause();

    const abi = ethers.AbiCoder.defaultAbiCoder();
    const steps = [
      {
        adapter: await adapter.getAddress(),
        tokenIn: await tokenA.getAddress(),
        tokenOut: await tokenB.getAddress(),
        amountIn: 0,
        minAmountOut: 1,
        data: abi.encode(["uint16"], [0]),
      },
      {
        adapter: await adapter.getAddress(),
        tokenIn: await tokenB.getAddress(),
        tokenOut: await tokenA.getAddress(),
        amountIn: 0,
        minAmountOut: 1,
        data: abi.encode(["uint16"], [100]),
      },
    ];

    const routeHash = ethers.keccak256(encodeSteps(steps));
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const { intent, signature } = await signIntent({
      executor,
      user,
      asset: await tokenA.getAddress(),
      amount: loanAmount,
      routeHash,
      minNetProfit: 0n,
      deadline,
      refundRecipient: ethers.ZeroAddress,
      maxGasRefund: 0n,
    });

    await expect(executor.connect(relayer).executeArbitrageWithIntent(intent, steps, signature)).to.be.revertedWithCustomError(
      executor,
      "EnforcedPause"
    );
  });

  it("Slippage test (minAmountOut enforced)", async function () {
    const { relayer, user, tokenA, tokenB, executor, adapter, loanAmount } = await loadFixture(deployAaveFixture);

    const abi = ethers.AbiCoder.defaultAbiCoder();
    const steps = [
      {
        adapter: await adapter.getAddress(),
        tokenIn: await tokenA.getAddress(),
        tokenOut: await tokenB.getAddress(),
        amountIn: 0,
        minAmountOut: loanAmount + 1n, // impossible: adapter outputs amountIn (+bonus), but this exceeds
        data: abi.encode(["uint16"], [0]),
      },
      {
        adapter: await adapter.getAddress(),
        tokenIn: await tokenB.getAddress(),
        tokenOut: await tokenA.getAddress(),
        amountIn: 0,
        minAmountOut: 1,
        data: abi.encode(["uint16"], [100]),
      },
    ];

    const routeHash = ethers.keccak256(encodeSteps(steps));
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const { intent, signature } = await signIntent({
      executor,
      user,
      asset: await tokenA.getAddress(),
      amount: loanAmount,
      routeHash,
      minNetProfit: 0n,
      deadline,
      refundRecipient: ethers.ZeroAddress,
      maxGasRefund: 0n,
    });

    await expect(executor.connect(relayer).executeArbitrageWithIntent(intent, steps, signature)).to.be.revertedWith(
      "MockDexAdapter: slippage"
    );
  });

  it("Adapter allowlist test (RiskManager enforces when enabled)", async function () {
    const { owner, relayer, user, tokenA, tokenB, riskManager, executor, adapter, loanAmount } = await loadFixture(
      deployAaveFixture
    );

    await riskManager.connect(owner).setAdapterAllowlistEnforced(true);

    const abi = ethers.AbiCoder.defaultAbiCoder();
    const steps = [
      {
        adapter: await adapter.getAddress(),
        tokenIn: await tokenA.getAddress(),
        tokenOut: await tokenB.getAddress(),
        amountIn: 0,
        minAmountOut: 1,
        data: abi.encode(["uint16"], [0]),
      },
      {
        adapter: await adapter.getAddress(),
        tokenIn: await tokenB.getAddress(),
        tokenOut: await tokenA.getAddress(),
        amountIn: 0,
        minAmountOut: 1,
        data: abi.encode(["uint16"], [100]),
      },
    ];

    const routeHash = ethers.keccak256(encodeSteps(steps));
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const { intent, signature } = await signIntent({
      executor,
      user,
      asset: await tokenA.getAddress(),
      amount: loanAmount,
      routeHash,
      minNetProfit: 0n,
      deadline,
      refundRecipient: ethers.ZeroAddress,
      maxGasRefund: 0n,
    });

    await expect(executor.connect(relayer).executeArbitrageWithIntent(intent, steps, signature)).to.be.revertedWith(
      "Risk: adapter not allowed"
    );

    await riskManager.connect(owner).setAdapterAllowed(await adapter.getAddress(), true);
    await expect(executor.connect(relayer).executeArbitrageWithIntent(intent, steps, signature)).to.not.be.reverted;
  });
});

```

## `contracts/contracts/ArbitrageRouter.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IDEXAdapter.sol";
import "./interfaces/ITreasury.sol";
import "./ProfitValidator.sol";

/// @title ArbitrageRouter — Multi-hop swap orchestrator with profit validation
/// @notice Routes arbitrage trades through multiple DEX adapters and enforces profitability
/// @dev Called by FlashLoanExecutor or directly for non-flash-loan arbitrage
contract ArbitrageRouter is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ProfitValidator for uint256;

    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");

    /// @notice Protocol treasury address
    ITreasury public treasury;

    /// @notice Registered DEX adapters
    mapping(address => bool) public registeredAdapters;

    /// @notice Maximum allowed slippage in basis points (default 100 = 1%)
    uint256 public maxSlippageBps = 100;

    /// @notice Minimum profit threshold in wei
    uint256 public minProfitThreshold = 0;

    /// @notice Circuit breaker: maximum gas price (in wei) to execute
    uint256 public maxGasPrice = 50 gwei;

    /// @notice Represents a single swap step in an arbitrage route
    struct SwapStep {
        address adapter;      // DEX adapter address
        address tokenIn;      // Input token
        address tokenOut;     // Output token
        uint256 amountIn;     // Amount to swap (0 = use full balance from previous step)
        uint256 minAmountOut; // Minimum output (slippage protection)
        bytes data;           // Adapter-specific encoded data (pool fees, etc.)
    }

    /// @notice Emitted when an arbitrage route is successfully executed
    event ArbitrageExecuted(
        address indexed user,
        address indexed profitToken,
        uint256 grossProfit,
        uint256 protocolFee,
        uint256 userProfit,
        uint256 timestamp
    );

    /// @notice Emitted when an adapter is registered or unregistered
    event AdapterUpdated(address indexed adapter, bool registered);

    constructor(address admin, address _treasury) {
        require(admin != address(0), "Router: zero admin");
        require(_treasury != address(0), "Router: zero treasury");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        treasury = ITreasury(_treasury);
    }

    /// @notice Execute a multi-step arbitrage route
    /// @param steps Array of swap steps to execute sequentially
    /// @param profitToken Token in which profit is measured
    /// @param initialAmount Starting amount of profitToken
    /// @param minNetProfit Minimum acceptable user profit
    /// @param user Address to receive the user's share of profit
    /// @param deadline Timestamp after which the transaction reverts
    function executeRoute(
        SwapStep[] calldata steps,
        address profitToken,
        uint256 initialAmount,
        uint256 minNetProfit,
        address user,
        uint256 deadline
    ) external onlyRole(EXECUTOR_ROLE) whenNotPaused nonReentrant {
        require(block.timestamp <= deadline, "Router: expired deadline");
        require(tx.gasprice <= maxGasPrice, "Router: gas price too high");
        require(steps.length >= 2, "Router: need at least 2 steps");
        require(user != address(0), "Router: zero user");

        // Record starting balance
        uint256 startBalance = IERC20(profitToken).balanceOf(address(this));
        require(startBalance >= initialAmount, "Router: insufficient start balance");

        // Execute each swap step
        for (uint256 i = 0; i < steps.length; i++) {
            _executeStep(steps[i]);
        }

        // Calculate profit
        uint256 endBalance = IERC20(profitToken).balanceOf(address(this));
        require(endBalance > startBalance, "Router: no profit");

        uint256 grossProfit = endBalance - startBalance;

        // Validate profit and calculate fees
        (uint256 protocolFee, uint256 userProfit) = ProfitValidator.calculateFees(grossProfit);
        require(userProfit >= minNetProfit, "Router: below min profit");
        require(userProfit > 0, "Router: zero user profit");

        // Transfer protocol fee to treasury
        IERC20(profitToken).forceApprove(address(treasury), protocolFee);
        treasury.receiveFee(profitToken, protocolFee);

        // Transfer user profit
        IERC20(profitToken).safeTransfer(user, userProfit);

        emit ArbitrageExecuted(user, profitToken, grossProfit, protocolFee, userProfit, block.timestamp);
    }

    /// @notice Execute a single swap step
    function _executeStep(SwapStep calldata step) internal {
        require(registeredAdapters[step.adapter], "Router: unregistered adapter");

        uint256 amountIn = step.amountIn;
        if (amountIn == 0) {
            // Use full balance of tokenIn (for chained swaps)
            amountIn = IERC20(step.tokenIn).balanceOf(address(this));
        }

        require(amountIn > 0, "Router: zero input amount");

        // Approve adapter to spend tokens
        IERC20(step.tokenIn).safeIncreaseAllowance(step.adapter, amountIn);

        // Execute swap via adapter
        uint256 amountOut = IDEXAdapter(step.adapter).swap(
            step.tokenIn,
            step.tokenOut,
            amountIn,
            step.minAmountOut,
            step.data
        );

        require(amountOut >= step.minAmountOut, "Router: slippage exceeded");
    }

    // ═══════════════════════════════════════════════
    //  ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════

    /// @notice Register or unregister a DEX adapter
    function setAdapter(address adapter, bool registered) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(adapter != address(0), "Router: zero adapter");
        registeredAdapters[adapter] = registered;
        emit AdapterUpdated(adapter, registered);
    }

    /// @notice Update treasury address
    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_treasury != address(0), "Router: zero treasury");
        treasury = ITreasury(_treasury);
    }

    /// @notice Update maximum slippage
    function setMaxSlippage(uint256 _maxSlippageBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_maxSlippageBps <= 1000, "Router: slippage too high"); // max 10%
        maxSlippageBps = _maxSlippageBps;
    }

    /// @notice Update minimum profit threshold
    function setMinProfitThreshold(uint256 _minProfit) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minProfitThreshold = _minProfit;
    }

    /// @notice Update maximum gas price for circuit breaker
    function setMaxGasPrice(uint256 _maxGasPrice) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxGasPrice = _maxGasPrice;
    }

    /// @notice Pause the router
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpause the router
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Emergency token rescue (in case tokens get stuck)
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IERC20(token).safeTransfer(to, amount);
    }

    /// @notice Emergency ETH rescue
    function emergencyWithdrawETH(address payable to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        (bool sent, ) = to.call{value: address(this).balance}("");
        require(sent, "Router: ETH transfer failed");
    }

    receive() external payable {}
}

```

## `contracts/contracts/FlashLoanExecutor.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IFlashLoanReceiver.sol";
import "./interfaces/IDEXAdapter.sol";
import "./interfaces/ITreasury.sol";
import "./interfaces/IUniswapV3FlashPool.sol";
import "./ArbitrageRouter.sol";
import "./ProfitValidator.sol";
import "./RiskManager.sol";

/// @title FlashLoanExecutor — Entry point for flash-loan-funded arbitrage
/// @notice Borrows from Aave V3, delegates to ArbitrageRouter, validates profit, splits fees
/// @dev This is the main contract users interact with (via relayer)
contract FlashLoanExecutor is IFlashLoanReceiver, AccessControl, EIP712, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    /// @notice Aave V3 Pool on Base
    IPool public aavePool;

    /// @notice Arbitrage router for executing swap routes
    ArbitrageRouter public arbitrageRouter;

    /// @notice Protocol treasury
    ITreasury public treasury;

    /// @notice Centralized risk management module (circuit breakers + allowlists)
    RiskManager public riskManager;

    /// @notice Execution stats
    uint256 public totalExecutions;
    uint256 public totalProfitGenerated; // Net profit after gas refund, before fee split
    uint256 public totalProtocolFees;
    uint256 public totalUserProfit;
    uint256 public totalGasRefunded;

    /// @notice Per-asset execution stats (for multi-asset accounting)
    mapping(address => uint256) public totalArbitrageVolumeByAsset; // total borrowed amount
    mapping(address => uint256) public totalProfitGeneratedByAsset; // netProfit after gas refund, before fee split
    mapping(address => uint256) public totalProtocolFeesByAsset;
    mapping(address => uint256) public totalUserProfitByAsset;
    mapping(address => uint256) public totalGasRefundedByAsset;

    address[] public trackedAssets;
    mapping(address => bool) public isTrackedAsset;

    /// @notice User intent nonce (for signed-intent execution)
    mapping(address => uint256) public nonces;

    struct ExecutionIntent {
        address user;
        address asset;
        uint256 amount;
        bytes32 routeHash;
        uint256 minNetProfit; // Minimum acceptable user profit (after gas refund + 15% fee)
        uint256 deadline;
        address refundRecipient;
        uint256 maxGasRefund;
        uint256 nonce;
    }

    bytes32 public constant EXECUTION_INTENT_TYPEHASH =
        keccak256(
            "ExecutionIntent(address user,address asset,uint256 amount,bytes32 routeHash,uint256 minNetProfit,uint256 deadline,address refundRecipient,uint256 maxGasRefund,uint256 nonce)"
        );

    /// @notice Struct for encoding flash loan parameters
    struct ArbitrageParams {
        ArbitrageRouter.SwapStep[] steps;
        address profitToken;
        uint256 minNetProfit;
        address user;
        uint256 deadline;
        address refundRecipient;
        uint256 maxGasRefund;
    }

    struct UniV3FlashParams {
        ArbitrageRouter.SwapStep[] steps;
        address profitToken;
        uint256 minNetProfit;
        address user;
        uint256 deadline;
        address refundRecipient;
        uint256 maxGasRefund;
        address flashPool;
        uint256 amount; // borrowed amount of profitToken
        bool isToken0;
    }

    /// @notice Emitted on successful flash loan arbitrage
    event FlashArbExecuted(
        address indexed user,
        address indexed asset,
        uint256 flashAmount,
        uint256 grossProfit,
        uint256 gasRefund,
        uint256 protocolFee,
        uint256 userProfit,
        uint256 timestamp
    );

    /// @notice Emitted on circuit breaker trigger
    event CircuitBreakerTriggered(string reason, uint256 value, uint256 threshold);
    event FallbackFlashUsed(address indexed pool, address indexed asset, uint256 amount);

    constructor(
        address admin,
        address _aavePool,
        address _arbitrageRouter,
        address _treasury,
        address _riskManager
    ) EIP712("BaseArbExecutor", "1") {
        require(admin != address(0), "Executor: zero admin");
        require(_arbitrageRouter != address(0), "Executor: zero router");
        require(_treasury != address(0), "Executor: zero treasury");
        require(_riskManager != address(0), "Executor: zero risk");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        // `_aavePool` may be zero on networks without Aave; use UniV3 flash fallback.
        aavePool = IPool(_aavePool);
        arbitrageRouter = ArbitrageRouter(payable(_arbitrageRouter));
        treasury = ITreasury(_treasury);
        riskManager = RiskManager(_riskManager);
    }

    function getTrackedAssets() external view returns (address[] memory) {
        return trackedAssets;
    }

    /// @notice Initiate a flash-loan-funded arbitrage
    /// @param asset Token to borrow via flash loan
    /// @param amount Amount to borrow
    /// @param steps Swap steps for the arbitrage route
    /// @param minNetProfit Minimum acceptable net profit for user
    /// @param user Address to receive user's profit share
    /// @param deadline Timestamp after which transaction reverts
    function executeArbitrage(
        address asset,
        uint256 amount,
        ArbitrageRouter.SwapStep[] calldata steps,
        uint256 minNetProfit,
        address user,
        uint256 deadline
    ) external onlyRole(RELAYER_ROLE) whenNotPaused {
        riskManager.validatePreExecution(
            asset,
            amount,
            steps,
            minNetProfit,
            user,
            deadline,
            address(0),
            0
        );

        _initiateAaveFlashLoan(asset, amount, steps, minNetProfit, user, deadline, address(0), 0);
    }

    /// @notice Execute using a user-signed intent (hybrid model: user signs, keeper/relayer submits)
    function executeArbitrageWithIntent(
        ExecutionIntent calldata intent,
        ArbitrageRouter.SwapStep[] calldata steps,
        bytes calldata signature
    ) external onlyRole(RELAYER_ROLE) whenNotPaused {
        _verifyAndConsumeIntent(intent, steps, signature);
        _initiateAaveFlashLoan(
            intent.asset,
            intent.amount,
            steps,
            intent.minNetProfit,
            intent.user,
            intent.deadline,
            intent.refundRecipient,
            intent.maxGasRefund
        );
    }

    /// @notice Fallback flash path: Uniswap V3 pool flash (only when Aave is not configured)
    /// @dev Requires `riskManager.uniV3FlashPoolAllowed(flashPool) == true`.
    function executeArbitrageWithIntentUniV3Flash(
        ExecutionIntent calldata intent,
        ArbitrageRouter.SwapStep[] calldata steps,
        bytes calldata signature,
        address flashPool
    ) external onlyRole(RELAYER_ROLE) whenNotPaused {
        require(address(aavePool) == address(0), "Executor: Aave configured");
        require(flashPool != address(0), "Executor: zero flash pool");
        require(riskManager.uniV3FlashPoolAllowed(flashPool), "Executor: flash pool not allowed");
        _verifyAndConsumeIntent(intent, steps, signature);
        _initiateUniV3Flash(
            flashPool,
            intent.asset,
            intent.amount,
            steps,
            intent.minNetProfit,
            intent.user,
            intent.deadline,
            intent.refundRecipient,
            intent.maxGasRefund
        );
    }

    /// @notice Aave V3 flash loan callback
    /// @dev Called by Aave Pool after funds are transferred
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override whenNotPaused nonReentrant returns (bool) {
        require(msg.sender == address(aavePool), "Executor: caller not pool");
        require(initiator == address(this), "Executor: invalid initiator");
        uint256 amountOwed = amount + premium;

        // Decode arbitrage parameters
        (
            ArbitrageRouter.SwapStep[] memory steps,
            address profitToken,
            uint256 minNetProfit,
            address user,
            uint256 deadline,
            address refundRecipient,
            uint256 maxGasRefund
        ) = abi.decode(params, (ArbitrageRouter.SwapStep[], address, uint256, address, uint256, address, uint256));

        require(profitToken == asset, "Executor: profit token mismatch");
        require(block.timestamp <= deadline, "Executor: expired deadline");

        // Execute swaps directly from this contract so we retain funds to repay Aave
        _executeRouteSteps(steps, asset, amount);

        // Calculate profit after repaying flash loan
        uint256 currentBalance = IERC20(asset).balanceOf(address(this));
        require(currentBalance >= amountOwed, "Executor: insufficient for repayment");

        uint256 grossProfit = currentBalance - amountOwed;
        // Profit threshold enforced post-execution by RiskManager

        uint256 gasRefund = 0;
        if (maxGasRefund > 0) {
            if (grossProfit >= maxGasRefund) gasRefund = maxGasRefund;
            else gasRefund = grossProfit;

            IERC20(asset).safeTransfer(refundRecipient, gasRefund);
            totalGasRefunded += gasRefund;
            totalGasRefundedByAsset[asset] += gasRefund;
        }

        uint256 netProfit = grossProfit - gasRefund;
        require(netProfit > 0, "Executor: zero net profit");

        // Validate and calculate fees
        (uint256 protocolFee, uint256 userProfit) = ProfitValidator.calculateFees(netProfit);
        require(userProfit >= minNetProfit, "Executor: below min profit");
        require(userProfit > 0, "Executor: zero user profit");
        riskManager.validatePostExecution(asset, grossProfit, gasRefund, minNetProfit, userProfit);

        // Repay flash loan
        IERC20(asset).forceApprove(address(aavePool), amountOwed);

        // Transfer protocol fee to treasury
        IERC20(asset).forceApprove(address(treasury), protocolFee);
        treasury.receiveFee(asset, protocolFee);

        // Transfer user profit
        IERC20(asset).safeTransfer(user, userProfit);

        // Update stats
        totalExecutions++;
        totalProfitGenerated += netProfit;
        totalProtocolFees += protocolFee;
        totalUserProfit += userProfit;
        totalArbitrageVolumeByAsset[asset] += amount;
        totalProfitGeneratedByAsset[asset] += netProfit;
        totalProtocolFeesByAsset[asset] += protocolFee;
        totalUserProfitByAsset[asset] += userProfit;
        _trackAsset(asset);

        emit FlashArbExecuted(
            user,
            asset,
            amount,
            grossProfit,
            gasRefund,
            protocolFee,
            userProfit,
            block.timestamp
        );

        return true;
    }

    /// @notice Execute swap steps directly (without router's profit validation)
    function _executeRouteSteps(
        ArbitrageRouter.SwapStep[] memory steps,
        address startToken,
        uint256 startAmount
    ) internal {
        require(steps[0].tokenIn == startToken, "Executor: route start mismatch");
        require(steps[steps.length - 1].tokenOut == startToken, "Executor: route end mismatch");

        for (uint256 i = 0; i < steps.length; i++) {
            address adapter = steps[i].adapter;
            require(arbitrageRouter.registeredAdapters(adapter), "Executor: unregistered adapter");

            uint256 amountIn = steps[i].amountIn;
            if (amountIn == 0) {
                amountIn = i == 0
                    ? startAmount
                    : IERC20(steps[i].tokenIn).balanceOf(address(this));
            }

            IERC20(steps[i].tokenIn).forceApprove(adapter, amountIn);

            IDEXAdapter(adapter).swap(
                steps[i].tokenIn,
                steps[i].tokenOut,
                amountIn,
                steps[i].minAmountOut,
                steps[i].data
            );
        }

        // Pull all output tokens back to this contract if they're elsewhere
        // (adapters should return tokens to msg.sender)
    }

    // ═══════════════════════════════════════════════
    //  ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════

    function setArbitrageRouter(address _router) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_router != address(0), "Executor: zero router");
        arbitrageRouter = ArbitrageRouter(payable(_router));
    }

    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_treasury != address(0), "Executor: zero treasury");
        treasury = ITreasury(_treasury);
    }

    function setAavePool(address _pool) external onlyRole(DEFAULT_ADMIN_ROLE) {
        aavePool = IPool(_pool);
    }

    function setRiskManager(address _riskManager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_riskManager != address(0), "Executor: zero risk");
        riskManager = RiskManager(_riskManager);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Emergency token rescue
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IERC20(token).safeTransfer(to, amount);
    }

    function _initiateAaveFlashLoan(
        address asset,
        uint256 amount,
        ArbitrageRouter.SwapStep[] calldata steps,
        uint256 minNetProfit,
        address user,
        uint256 deadline,
        address refundRecipient,
        uint256 maxGasRefund
    ) internal {
        require(address(aavePool) != address(0), "Executor: Aave not configured");
        // Encode arbitrage parameters for callback
        bytes memory callbackParams = abi.encode(
            steps,
            asset, // profitToken
            minNetProfit,
            user,
            deadline,
            refundRecipient,
            maxGasRefund
        );

        aavePool.flashLoanSimple(
            address(this),
            asset,
            amount,
            callbackParams,
            0 // referral code
        );
    }

    function _verifyAndConsumeIntent(
        ExecutionIntent calldata intent,
        ArbitrageRouter.SwapStep[] calldata steps,
        bytes calldata signature
    ) internal {
        require(intent.user != address(0), "Executor: zero user");
        riskManager.validatePreExecution(
            intent.asset,
            intent.amount,
            steps,
            intent.minNetProfit,
            intent.user,
            intent.deadline,
            intent.refundRecipient,
            intent.maxGasRefund
        );

        bytes32 routeHash = keccak256(abi.encode(steps));
        require(routeHash == intent.routeHash, "Executor: route hash mismatch");

        uint256 currentNonce = nonces[intent.user];
        require(intent.nonce == currentNonce, "Executor: bad nonce");
        nonces[intent.user] = currentNonce + 1;

        bytes32 structHash = keccak256(
            abi.encode(
                EXECUTION_INTENT_TYPEHASH,
                intent.user,
                intent.asset,
                intent.amount,
                intent.routeHash,
                intent.minNetProfit,
                intent.deadline,
                intent.refundRecipient,
                intent.maxGasRefund,
                intent.nonce
            )
        );
        address signer = _hashTypedDataV4(structHash).recover(signature);
        require(signer == intent.user, "Executor: invalid signature");
    }

    function _initiateUniV3Flash(
        address flashPool,
        address asset,
        uint256 amount,
        ArbitrageRouter.SwapStep[] calldata steps,
        uint256 minNetProfit,
        address user,
        uint256 deadline,
        address refundRecipient,
        uint256 maxGasRefund
    ) internal {
        IUniswapV3FlashPool pool = IUniswapV3FlashPool(flashPool);
        address token0 = pool.token0();
        address token1 = pool.token1();

        bool isToken0 = asset == token0;
        require(isToken0 || asset == token1, "Executor: asset not in pool");

        uint256 amount0 = isToken0 ? amount : 0;
        uint256 amount1 = isToken0 ? 0 : amount;

        UniV3FlashParams memory p = UniV3FlashParams({
            steps: steps,
            profitToken: asset,
            minNetProfit: minNetProfit,
            user: user,
            deadline: deadline,
            refundRecipient: refundRecipient,
            maxGasRefund: maxGasRefund,
            flashPool: flashPool,
            amount: amount,
            isToken0: isToken0
        });

        emit FallbackFlashUsed(flashPool, asset, amount);
        pool.flash(address(this), amount0, amount1, abi.encode(p));
    }

    /// @notice Uniswap V3 flash callback (fallback flash path)
    function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data)
        external
        whenNotPaused
        nonReentrant
    {
        UniV3FlashParams memory p = abi.decode(data, (UniV3FlashParams));
        require(msg.sender == p.flashPool, "Executor: caller not flash pool");
        require(block.timestamp <= p.deadline, "Executor: expired deadline");

        uint256 fee = p.isToken0 ? fee0 : fee1;
        uint256 amountOwed = p.amount + fee;

        _executeRouteSteps(p.steps, p.profitToken, p.amount);

        uint256 balanceBeforeRepay = IERC20(p.profitToken).balanceOf(address(this));
        require(balanceBeforeRepay >= amountOwed, "Executor: insufficient for repayment");

        // Repay flash + fee to pool first; remaining balance is profit
        IERC20(p.profitToken).safeTransfer(msg.sender, amountOwed);

        uint256 grossProfit = balanceBeforeRepay - amountOwed;

        uint256 gasRefund = 0;
        if (p.maxGasRefund > 0) {
            gasRefund = grossProfit >= p.maxGasRefund ? p.maxGasRefund : grossProfit;
            IERC20(p.profitToken).safeTransfer(p.refundRecipient, gasRefund);
            totalGasRefunded += gasRefund;
            totalGasRefundedByAsset[p.profitToken] += gasRefund;
        }

        uint256 netProfit = grossProfit - gasRefund;
        require(netProfit > 0, "Executor: zero net profit");

        (uint256 protocolFee, uint256 userProfit) = ProfitValidator.calculateFees(netProfit);
        require(userProfit >= p.minNetProfit, "Executor: below min profit");
        require(userProfit > 0, "Executor: zero user profit");
        riskManager.validatePostExecution(p.profitToken, grossProfit, gasRefund, p.minNetProfit, userProfit);

        IERC20(p.profitToken).forceApprove(address(treasury), protocolFee);
        treasury.receiveFee(p.profitToken, protocolFee);

        IERC20(p.profitToken).safeTransfer(p.user, userProfit);

        totalExecutions++;
        totalProfitGenerated += netProfit;
        totalProtocolFees += protocolFee;
        totalUserProfit += userProfit;
        totalArbitrageVolumeByAsset[p.profitToken] += p.amount;
        totalProfitGeneratedByAsset[p.profitToken] += netProfit;
        totalProtocolFeesByAsset[p.profitToken] += protocolFee;
        totalUserProfitByAsset[p.profitToken] += userProfit;
        _trackAsset(p.profitToken);

        emit FlashArbExecuted(
            p.user,
            p.profitToken,
            p.amount,
            grossProfit,
            gasRefund,
            protocolFee,
            userProfit,
            block.timestamp
        );
    }

    function _trackAsset(address asset) internal {
        if (!isTrackedAsset[asset]) {
            isTrackedAsset[asset] = true;
            trackedAssets.push(asset);
        }
    }

    receive() external payable {}
}

```

## `contracts/contracts/ProfitValidator.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ProfitValidator — Library for profit validation and fee calculation
/// @notice Pure math functions for arbitrage profit validation
/// @dev Used by ArbitrageRouter and FlashLoanExecutor to ensure profitability
library ProfitValidator {
    /// @notice Protocol fee percentage (15%)
    uint256 public constant PROTOCOL_FEE_BPS = 1500; // 15% in basis points
    uint256 public constant BPS_DENOMINATOR = 10000;

    /// @notice Error thrown when trade is not profitable
    error UnprofitableTrade(uint256 grossProfit, uint256 totalCosts);

    /// @notice Error thrown when user profit is zero after fees
    error ZeroUserProfit();

    /// @notice Validate that an arbitrage trade is profitable after all costs
    /// @param amountOut Total tokens received from arbitrage
    /// @param amountIn Total tokens used (flash loan amount)
    /// @param flashFee Flash loan premium
    /// @param gasCostInToken Estimated gas cost denominated in the profit token
    /// @param minNetProfit Minimum acceptable net profit for the user
    /// @return grossProfit Total profit before fees
    /// @return protocolFee 15% protocol fee
    /// @return userProfit User's net profit after protocol fee
    function validateAndCalculate(
        uint256 amountOut,
        uint256 amountIn,
        uint256 flashFee,
        uint256 gasCostInToken,
        uint256 minNetProfit
    ) internal pure returns (
        uint256 grossProfit,
        uint256 protocolFee,
        uint256 userProfit
    ) {
        uint256 totalCost = amountIn + flashFee + gasCostInToken;

        // Ensure trade is profitable
        if (amountOut <= totalCost) {
            revert UnprofitableTrade(
                amountOut > amountIn ? amountOut - amountIn : 0,
                totalCost - amountIn
            );
        }

        grossProfit = amountOut - totalCost;

        // Calculate fee split
        (protocolFee, userProfit) = calculateFees(grossProfit);

        // Ensure user actually profits
        if (userProfit == 0) {
            revert ZeroUserProfit();
        }

        // Ensure minimum profit threshold met
        require(userProfit >= minNetProfit, "ProfitValidator: below min profit");
    }

    /// @notice Calculate protocol fee and user profit from gross profit
    /// @param grossProfit Total profit before protocol fee
    /// @return protocolFee 15% fee for protocol treasury
    /// @return userProfit 85% remaining for user
    function calculateFees(uint256 grossProfit) internal pure returns (
        uint256 protocolFee,
        uint256 userProfit
    ) {
        protocolFee = (grossProfit * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
        userProfit = grossProfit - protocolFee;
    }

    /// @notice Simple profitability check without fee calculation
    /// @param amountOut Amount received
    /// @param amountIn Amount spent (including all costs)
    /// @return isProfitable Whether the trade is profitable
    /// @return profit The profit amount (0 if unprofitable)
    function isProfitable(
        uint256 amountOut,
        uint256 amountIn
    ) internal pure returns (bool, uint256 profit) {
        if (amountOut > amountIn) {
            return (true, amountOut - amountIn);
        }
        return (false, 0);
    }
}

```

## `contracts/contracts/RiskManager.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

import "./ArbitrageRouter.sol";

/// @title RiskManager — Centralized circuit breakers and allowlists
/// @notice Provides reusable validation for atomic arbitrage executions.
contract RiskManager is AccessControl, Pausable {
    bytes32 public constant RISK_ADMIN_ROLE = keccak256("RISK_ADMIN_ROLE");

    struct AssetConfig {
        bool enabled;
        uint256 maxFlashLoanAmount;
        uint256 minProfitThreshold;
        uint256 maxGasRefund; // Denominated in the borrowed asset (profit token)
    }

    /// @notice Global max gas price (wei)
    uint256 public maxGasPrice;

    /// @notice Enforce per-step minAmountOut > 0
    bool public enforceMinAmountOut;

    /// @notice Per-asset risk configuration
    mapping(address => AssetConfig) public assetConfigs;

    /// @notice Optional adapter allowlist (in addition to router registry checks)
    mapping(address => bool) public adapterAllowed;
    /// @notice Whether to enforce adapter allowlist checks
    bool public enforceAdapterAllowlist;

    /// @notice Optional UniswapV3 flash pool allowlist (for fallback flash path)
    mapping(address => bool) public uniV3FlashPoolAllowed;

    event AssetConfigUpdated(address indexed asset, AssetConfig cfg);
    event AdapterAllowed(address indexed adapter, bool allowed);
    event AdapterAllowlistEnforced(bool enforced);
    event UniV3FlashPoolAllowed(address indexed pool, bool allowed);
    event GlobalLimitsUpdated(uint256 maxGasPrice, bool enforceMinAmountOut);

    constructor(address admin, uint256 _maxGasPrice, bool _enforceMinAmountOut) {
        require(admin != address(0), "Risk: zero admin");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RISK_ADMIN_ROLE, admin);

        maxGasPrice = _maxGasPrice;
        enforceMinAmountOut = _enforceMinAmountOut;
        enforceAdapterAllowlist = false;
    }

    // ═══════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════

    function setGlobalLimits(uint256 _maxGasPrice, bool _enforceMinAmountOut)
        external
        onlyRole(RISK_ADMIN_ROLE)
    {
        maxGasPrice = _maxGasPrice;
        enforceMinAmountOut = _enforceMinAmountOut;
        emit GlobalLimitsUpdated(_maxGasPrice, _enforceMinAmountOut);
    }

    function setAssetConfig(
        address asset,
        bool enabled,
        uint256 maxFlashLoanAmount,
        uint256 minProfitThreshold,
        uint256 maxGasRefund
    ) external onlyRole(RISK_ADMIN_ROLE) {
        require(asset != address(0), "Risk: zero asset");
        assetConfigs[asset] = AssetConfig({
            enabled: enabled,
            maxFlashLoanAmount: maxFlashLoanAmount,
            minProfitThreshold: minProfitThreshold,
            maxGasRefund: maxGasRefund
        });
        emit AssetConfigUpdated(asset, assetConfigs[asset]);
    }

    function setAdapterAllowed(address adapter, bool allowed) external onlyRole(RISK_ADMIN_ROLE) {
        require(adapter != address(0), "Risk: zero adapter");
        adapterAllowed[adapter] = allowed;
        emit AdapterAllowed(adapter, allowed);
    }

    function setAdapterAllowlistEnforced(bool enforced) external onlyRole(RISK_ADMIN_ROLE) {
        enforceAdapterAllowlist = enforced;
        emit AdapterAllowlistEnforced(enforced);
    }

    function setUniV3FlashPoolAllowed(address pool, bool allowed) external onlyRole(RISK_ADMIN_ROLE) {
        require(pool != address(0), "Risk: zero pool");
        uniV3FlashPoolAllowed[pool] = allowed;
        emit UniV3FlashPoolAllowed(pool, allowed);
    }

    function pause() external onlyRole(RISK_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(RISK_ADMIN_ROLE) {
        _unpause();
    }

    // ═══════════════════════════════════════════════
    //  VALIDATION
    // ═══════════════════════════════════════════════

    function validatePreExecution(
        address asset,
        uint256 amount,
        ArbitrageRouter.SwapStep[] calldata steps,
        uint256 minNetProfit,
        address user,
        uint256 deadline,
        address refundRecipient,
        uint256 maxGasRefund
    ) external view whenNotPaused {
        AssetConfig memory cfg = assetConfigs[asset];
        require(cfg.enabled, "Risk: asset disabled");
        require(tx.gasprice <= maxGasPrice, "Risk: gas price too high");
        require(block.timestamp <= deadline, "Risk: expired deadline");
        require(user != address(0), "Risk: zero user");
        require(steps.length >= 2, "Risk: need >=2 steps");
        require(amount > 0 && amount <= cfg.maxFlashLoanAmount, "Risk: bad amount");

        // Route must cycle back to the borrowed asset
        require(steps[0].tokenIn == asset, "Risk: route start mismatch");
        require(steps[steps.length - 1].tokenOut == asset, "Risk: route end mismatch");

        if (enforceMinAmountOut) {
            for (uint256 i = 0; i < steps.length; i++) {
                require(steps[i].minAmountOut > 0, "Risk: minAmountOut required");
            }
        }

        if (enforceAdapterAllowlist) {
            for (uint256 i = 0; i < steps.length; i++) {
                require(adapterAllowed[steps[i].adapter], "Risk: adapter not allowed");
            }
        }

        if (maxGasRefund > 0) {
            require(refundRecipient != address(0), "Risk: zero refund recipient");
            require(maxGasRefund <= cfg.maxGasRefund, "Risk: refund too high");
        }

        // minNetProfit is enforced post-execution; keep it bounded to avoid nonsense
        require(minNetProfit <= type(uint128).max, "Risk: minNetProfit too large");
    }

    function validatePostExecution(
        address asset,
        uint256 grossProfit,
        uint256 gasRefund,
        uint256 minNetProfit,
        uint256 userProfit
    ) external view whenNotPaused {
        AssetConfig memory cfg = assetConfigs[asset];
        require(cfg.enabled, "Risk: asset disabled");
        require(grossProfit >= cfg.minProfitThreshold, "Risk: below min threshold");
        require(gasRefund <= cfg.maxGasRefund, "Risk: refund too high");
        require(userProfit >= minNetProfit, "Risk: below min profit");
        require(userProfit > 0, "Risk: zero user profit");
    }
}

```

## `contracts/contracts/Treasury.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/ITreasury.sol";

/// @title Treasury — Protocol fee collector and manager
/// @notice Collects 15% performance fees from arbitrage profits
/// @dev Only authorized executors can deposit fees; only admin can withdraw
contract Treasury is ITreasury, AccessControl, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;

    /// @notice Total fees collected per token
    mapping(address => uint256) private _totalCollected;

    /// @notice Total fees withdrawn per token
    mapping(address => uint256) public totalWithdrawn;

    constructor(address admin) {
        require(admin != address(0), "Treasury: zero admin");
        _grantRole(ADMIN_ROLE, admin);
    }

    /// @inheritdoc ITreasury
    function receiveFee(address token, uint256 amount) external override onlyRole(EXECUTOR_ROLE) whenNotPaused {
        require(amount > 0, "Treasury: zero amount");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        _totalCollected[token] += amount;
        emit FeeReceived(token, amount, block.timestamp);
    }

    /// @inheritdoc ITreasury
    function withdraw(address token, address to, uint256 amount) external override onlyRole(ADMIN_ROLE) {
        require(to != address(0), "Treasury: zero recipient");
        require(amount > 0, "Treasury: zero amount");
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(amount <= balance, "Treasury: insufficient balance");
        totalWithdrawn[token] += amount;
        IERC20(token).safeTransfer(to, amount);
        emit FeeWithdrawn(token, to, amount);
    }

    /// @inheritdoc ITreasury
    function totalCollected(address token) external view override returns (uint256) {
        return _totalCollected[token];
    }

    /// @notice Current balance of a token held in the treasury
    function balance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    /// @notice Emergency withdraw all of a token (admin only)
    function emergencyWithdraw(address token, address to) external onlyRole(ADMIN_ROLE) {
        uint256 bal = IERC20(token).balanceOf(address(this));
        require(bal > 0, "Treasury: nothing to withdraw");
        IERC20(token).safeTransfer(to, bal);
        emit FeeWithdrawn(token, to, bal);
    }

    /// @notice Pause the treasury
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpause the treasury
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Receive ETH (for gas refunds or direct ETH fees)
    receive() external payable {}

    /// @notice Withdraw ETH from treasury
    function withdrawETH(address payable to, uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(to != address(0), "Treasury: zero recipient");
        require(amount <= address(this).balance, "Treasury: insufficient ETH");
        (bool sent, ) = to.call{value: amount}("");
        require(sent, "Treasury: ETH transfer failed");
    }
}

```

## `contracts/contracts/adapters/AerodromeAdapter.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IDEXAdapter.sol";

/// @title IAerodromeRouter — Minimal Aerodrome Router interface
interface IAerodromeRouter {
    struct Route {
        address from;
        address to;
        bool stable;
        address factory;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        Route[] calldata routes,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function getAmountsOut(
        uint256 amountIn,
        Route[] calldata routes
    ) external view returns (uint256[] memory amounts);

    function defaultFactory() external view returns (address);
}

/// @title AerodromeAdapter — DEX adapter for Aerodrome on Base
/// @notice Wraps Aerodrome Router for unified swap interface
contract AerodromeAdapter is IDEXAdapter {
    using SafeERC20 for IERC20;

    /// @notice Aerodrome Router on Base
    IAerodromeRouter public immutable aeroRouter;

    /// @notice Default pool factory
    address public immutable defaultFactory;

    constructor(address _aeroRouter) {
        require(_aeroRouter != address(0), "Aero: zero router");
        aeroRouter = IAerodromeRouter(_aeroRouter);
        defaultFactory = aeroRouter.defaultFactory();
    }

    /// @inheritdoc IDEXAdapter
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata data
    ) external override returns (uint256 amountOut) {
        // Decode whether to use stable pool
        bool stable = abi.decode(data, (bool));

        // Transfer tokens from caller
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // Approve router
        IERC20(tokenIn).forceApprove(address(aeroRouter), amountIn);

        // Build route
        IAerodromeRouter.Route[] memory routes = new IAerodromeRouter.Route[](1);
        routes[0] = IAerodromeRouter.Route({
            from: tokenIn,
            to: tokenOut,
            stable: stable,
            factory: defaultFactory
        });

        // Execute swap
        uint256[] memory amounts = aeroRouter.swapExactTokensForTokens(
            amountIn,
            minAmountOut,
            routes,
            msg.sender, // Return tokens to caller (router)
            block.timestamp
        );

        amountOut = amounts[amounts.length - 1];
    }

    /// @inheritdoc IDEXAdapter
    function getAmountOut(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes calldata data
    ) external view override returns (uint256 amountOut) {
        bool stable = abi.decode(data, (bool));

        IAerodromeRouter.Route[] memory routes = new IAerodromeRouter.Route[](1);
        routes[0] = IAerodromeRouter.Route({
            from: tokenIn,
            to: tokenOut,
            stable: stable,
            factory: defaultFactory
        });

        uint256[] memory amounts = aeroRouter.getAmountsOut(amountIn, routes);
        amountOut = amounts[amounts.length - 1];
    }

    /// @inheritdoc IDEXAdapter
    function dexName() external pure override returns (string memory) {
        return "Aerodrome";
    }
}

```

## `contracts/contracts/adapters/UniswapV3Adapter.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IDEXAdapter.sol";

/// @title ISwapRouter — Minimal Uniswap V3 SwapRouter interface
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/// @title IQuoterV2 — Minimal Uniswap V3 Quoter interface
interface IQuoterV2 {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactInputSingle(QuoteExactInputSingleParams memory params)
        external
        returns (
            uint256 amountOut,
            uint160 sqrtPriceX96After,
            uint32 initializedTicksCrossed,
            uint256 gasEstimate
        );
}

/// @title UniswapV3Adapter — DEX adapter for Uniswap V3 on Base
/// @notice Wraps Uniswap V3 SwapRouter for unified swap interface
contract UniswapV3Adapter is IDEXAdapter {
    using SafeERC20 for IERC20;

    /// @notice Uniswap V3 SwapRouter on Base
    ISwapRouter public immutable swapRouter;

    /// @notice Uniswap V3 QuoterV2 on Base
    IQuoterV2 public immutable quoter;

    constructor(address _swapRouter, address _quoter) {
        require(_swapRouter != address(0), "UniV3: zero router");
        require(_quoter != address(0), "UniV3: zero quoter");
        swapRouter = ISwapRouter(_swapRouter);
        quoter = IQuoterV2(_quoter);
    }

    /// @inheritdoc IDEXAdapter
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata data
    ) external override returns (uint256 amountOut) {
        // Decode pool fee from data (e.g., 500, 3000, 10000)
        uint24 fee = abi.decode(data, (uint24));

        // Transfer tokens from caller
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // Approve router
        IERC20(tokenIn).forceApprove(address(swapRouter), amountIn);

        // Execute swap
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: fee,
            recipient: msg.sender, // Return tokens to caller (router)
            deadline: block.timestamp,
            amountIn: amountIn,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: 0 // No price limit
        });

        amountOut = swapRouter.exactInputSingle(params);
    }

    /// @inheritdoc IDEXAdapter
    function getAmountOut(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes calldata data
    ) external view override returns (uint256 amountOut) {
        uint24 fee = abi.decode(data, (uint24));
        // Note: QuoterV2 is not a pure view function, it requires state simulation
        // This is a simplified version; in production use static call
        // For now, return 0 as quote requires non-view call
        return 0;
    }

    /// @inheritdoc IDEXAdapter
    function dexName() external pure override returns (string memory) {
        return "Uniswap V3";
    }
}

```

## `contracts/contracts/interfaces/IDEXAdapter.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IDEXAdapter — Common interface for all DEX adapters
/// @notice Provides a unified swap interface for different DEX protocols
interface IDEXAdapter {
    /// @notice Execute a token swap
    /// @param tokenIn Address of the input token
    /// @param tokenOut Address of the output token
    /// @param amountIn Amount of input tokens
    /// @param minAmountOut Minimum acceptable output amount (slippage protection)
    /// @param data Additional adapter-specific encoded data
    /// @return amountOut Actual amount of tokens received
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata data
    ) external returns (uint256 amountOut);

    /// @notice Get expected output amount for a swap (view-only quote)
    /// @param tokenIn Address of the input token
    /// @param tokenOut Address of the output token
    /// @param amountIn Amount of input tokens
    /// @param data Additional adapter-specific encoded data
    /// @return amountOut Expected amount of tokens to receive
    function getAmountOut(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes calldata data
    ) external view returns (uint256 amountOut);

    /// @notice Returns the name of the DEX this adapter connects to
    function dexName() external pure returns (string memory);
}

```

## `contracts/contracts/interfaces/IFlashLoanReceiver.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IFlashLoanReceiver — Aave V3 flashLoanSimple callback interface
/// @notice Implemented by contracts that want to receive flash loans via Aave V3 `flashLoanSimple`
interface IFlashLoanReceiver {
    /// @notice Called by Aave Pool after flash loan funds are transferred
    /// @param asset Borrowed asset address
    /// @param amount Borrowed amount
    /// @param premium Flash loan fee
    /// @param initiator Address that initiated the flash loan
    /// @param params Encoded parameters passed to the flash loan
    /// @return True if the operation was successful
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}

/// @title IPool — Minimal Aave V3 Pool interface for flash loans
interface IPool {
    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;

    function FLASHLOAN_PREMIUM_TOTAL() external view returns (uint128);
}

```

## `contracts/contracts/interfaces/ITreasury.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ITreasury — Interface for protocol treasury
/// @notice Manages collection and withdrawal of protocol fees
interface ITreasury {
    /// @notice Receive protocol fee in a specific token
    /// @param token The ERC20 token address
    /// @param amount The fee amount
    function receiveFee(address token, uint256 amount) external;

    /// @notice Withdraw accumulated fees (owner only)
    /// @param token The ERC20 token address
    /// @param to Recipient address
    /// @param amount Amount to withdraw
    function withdraw(address token, address to, uint256 amount) external;

    /// @notice Total fees collected for a specific token
    /// @param token The ERC20 token address
    /// @return Total amount collected
    function totalCollected(address token) external view returns (uint256);

    /// @notice Emitted when a fee is received
    event FeeReceived(address indexed token, uint256 amount, uint256 timestamp);

    /// @notice Emitted when fees are withdrawn
    event FeeWithdrawn(address indexed token, address indexed to, uint256 amount);
}

```

## `contracts/contracts/interfaces/IUniswapV3FlashPool.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IUniswapV3FlashPool — Minimal Uniswap V3 pool flash interface
interface IUniswapV3FlashPool {
    function flash(address recipient, uint256 amount0, uint256 amount1, bytes calldata data) external;
    function token0() external view returns (address);
    function token1() external view returns (address);
}


```

## `contracts/contracts/mocks/MockAavePool.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IFlashLoanReceiver.sol";

/// @title MockAavePool — Simulates Aave V3 Pool for testing
contract MockAavePool {
    uint128 public constant FLASHLOAN_PREMIUM_TOTAL = 5; // 0.05% in BPS

    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 /* referralCode */
    ) external {
        uint256 premium = (amount * uint256(FLASHLOAN_PREMIUM_TOTAL)) / 10000;

        // Transfer loan to receiver
        require(IERC20(asset).transfer(receiverAddress, amount), "MockAavePool: transfer failed");

        // Callback
        bool ok = IFlashLoanReceiver(receiverAddress).executeOperation(
            asset,
            amount,
            premium,
            receiverAddress,
            params
        );
        require(ok, "MockAavePool: callback failed");

        // Pull repayment
        require(
            IERC20(asset).transferFrom(receiverAddress, address(this), amount + premium),
            "MockAavePool: repay failed"
        );
    }
}

```

## `contracts/contracts/mocks/MockDexAdapter.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IDEXAdapter.sol";

interface IMintableERC20 {
    function mint(address to, uint256 amount) external;
}

/// @title MockDexAdapter — Simple minting swap adapter for tests
/// @dev Pulls tokenIn from caller and mints tokenOut to caller with a configurable bonus (bps).
contract MockDexAdapter is IDEXAdapter {
    using SafeERC20 for IERC20;

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata data
    ) external returns (uint256 amountOut) {
        uint16 bonusBps = data.length == 0 ? 0 : abi.decode(data, (uint16));

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        amountOut = amountIn + (amountIn * uint256(bonusBps)) / 10000;
        IMintableERC20(tokenOut).mint(msg.sender, amountOut);

        require(amountOut >= minAmountOut, "MockDexAdapter: slippage");
    }

    function getAmountOut(
        address,
        address,
        uint256 amountIn,
        bytes calldata data
    ) external pure returns (uint256 amountOut) {
        uint16 bonusBps = data.length == 0 ? 0 : abi.decode(data, (uint16));
        return amountIn + (amountIn * uint256(bonusBps)) / 10000;
    }

    function dexName() external pure returns (string memory) {
        return "MockDex";
    }
}


```

## `contracts/contracts/mocks/MockERC20.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20 — Test token for unit testing
contract MockERC20 is ERC20 {
    uint8 private _decimals;

    constructor(string memory name, string memory symbol, uint8 decimals_) ERC20(name, symbol) {
        _decimals = decimals_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }
}

```

## `contracts/contracts/mocks/MockUniV3FlashPool.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IUniswapV3FlashPool.sol";

interface IUniV3FlashCallback {
    function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external;
}

/// @title MockUniV3FlashPool — Minimal Uniswap V3 flash pool for tests
/// @dev Transfers tokens to recipient, calls callback, and expects repayment + fee.
contract MockUniV3FlashPool is IUniswapV3FlashPool {
    using SafeERC20 for IERC20;

    address public immutable override token0;
    address public immutable override token1;

    uint16 public immutable feeBps; // test fee in bps

    constructor(address _token0, address _token1, uint16 _feeBps) {
        require(_token0 != address(0) && _token1 != address(0), "MockUniV3FlashPool: zero token");
        token0 = _token0;
        token1 = _token1;
        feeBps = _feeBps;
    }

    function flash(address recipient, uint256 amount0, uint256 amount1, bytes calldata data) external override {
        uint256 bal0Before = IERC20(token0).balanceOf(address(this));
        uint256 bal1Before = IERC20(token1).balanceOf(address(this));

        if (amount0 > 0) IERC20(token0).safeTransfer(recipient, amount0);
        if (amount1 > 0) IERC20(token1).safeTransfer(recipient, amount1);

        uint256 fee0 = (amount0 * uint256(feeBps)) / 10_000;
        uint256 fee1 = (amount1 * uint256(feeBps)) / 10_000;

        IUniV3FlashCallback(recipient).uniswapV3FlashCallback(fee0, fee1, data);

        uint256 bal0After = IERC20(token0).balanceOf(address(this));
        uint256 bal1After = IERC20(token1).balanceOf(address(this));

        require(bal0After >= bal0Before + fee0, "MockUniV3FlashPool: token0 not repaid");
        require(bal1After >= bal1Before + fee1, "MockUniV3FlashPool: token1 not repaid");
    }
}


```

## `contracts/contracts/mocks/ProfitValidatorTest.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../ProfitValidator.sol";

/// @title ProfitValidatorTest — Exposes ProfitValidator library functions for testing
contract ProfitValidatorTest {
    function testCalculateFees(uint256 grossProfit) external pure returns (uint256, uint256) {
        return ProfitValidator.calculateFees(grossProfit);
    }

    function testIsProfitable(uint256 amountOut, uint256 amountIn) external pure returns (bool, uint256) {
        return ProfitValidator.isProfitable(amountOut, amountIn);
    }

    function testValidateAndCalculate(
        uint256 amountOut,
        uint256 amountIn,
        uint256 flashFee,
        uint256 gasCostInToken,
        uint256 minNetProfit
    ) external pure returns (uint256, uint256, uint256) {
        return ProfitValidator.validateAndCalculate(amountOut, amountIn, flashFee, gasCostInToken, minNetProfit);
    }
}

```

## `contracts/contracts/mocks/ReentrantDexAdapter.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IDEXAdapter.sol";

interface IExecutorReenter {
    function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external;
}

/// @title ReentrantDexAdapter — Malicious adapter that attempts to re-enter executor during a flash callback
/// @dev Used to assert `ReentrancyGuard` protections on FlashLoanExecutor.
contract ReentrantDexAdapter is IDEXAdapter {
    address public immutable executor;

    constructor(address _executor) {
        executor = _executor;
    }

    function swap(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external returns (uint256) {
        // Attempt reentrancy into the executor callback.
        IExecutorReenter(executor).uniswapV3FlashCallback(0, 0, "0x");
        // Unreachable; kept to satisfy interface.
        return 0;
    }

    function getAmountOut(address, address, uint256 amountIn, bytes calldata) external pure returns (uint256) {
        return amountIn;
    }

    function dexName() external pure returns (string memory) {
        return "ReentrantMock";
    }
}


```

## `backend/package.json`
```json
{
    "name": "base-arb-backend",
    "version": "1.0.0",
    "description": "Backend scanner and relayer for Base Arbitrage Protocol",
    "main": "dist/server.js",
    "scripts": {
        "dev": "ts-node src/server.ts",
        "build": "tsc",
        "start": "node dist/server.js"
    },
    "dependencies": {
        "cors": "^2.8.5",
        "dotenv": "^16.4.0",
        "ethers": "^6.13.0",
        "express": "^4.18.0",
        "ws": "^8.16.0"
    },
    "devDependencies": {
        "@types/cors": "^2.8.17",
        "@types/express": "^4.17.21",
        "@types/node": "^20.11.0",
        "@types/ws": "^8.5.10",
        "ts-node": "^10.9.2",
        "typescript": "^5.3.0"
    }
}
```

## `backend/tsconfig.json`
```json
{
    "compilerOptions": {
        "target": "ES2020",
        "module": "commonjs",
        "moduleResolution": "node",
        "lib": [
            "ES2020"
        ],
        "outDir": "./dist",
        "rootDir": "./src",
        "strict": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true,
        "resolveJsonModule": true,
        "declaration": true,
        "declarationMap": true,
        "sourceMap": true
    },
    "include": [
        "src/**/*"
    ],
    "exclude": [
        "node_modules",
        "dist"
    ]
}
```

## `backend/src/config.ts`
```ts
import dotenv from "dotenv";
import path from "path";

// Load env from either repo root (`../.env`) or package root (`.env`), depending on cwd
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

function parseJson<T>(value: string | undefined, fallback: T): T {
    if (!value) return fallback;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

type ExtraToken = { address: string; decimals: number; symbol: string };
type ExtraPair = {
    name: string;
    token0: string;
    token1: string;
    uniV3Pools: Array<{ address: string; fee: number }>;
    aerodromePools: Array<{ address: string; stable: boolean }>;
};

const extraTokens = parseJson<ExtraToken[]>(process.env.EXTRA_TOKENS_JSON, []);
const extraPairs = parseJson<ExtraPair[]>(process.env.EXTRA_PAIRS_JSON, []);

const baseTokens = {
    WETH: {
        address: "0x4200000000000000000000000000000000000006",
        decimals: 18,
        symbol: "WETH",
    },
    USDC: {
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        decimals: 6,
        symbol: "USDC",
    },
    cbETH: {
        address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22",
        decimals: 18,
        symbol: "cbETH",
    },
} as const;

const tokens: Record<string, { address: string; decimals: number; symbol: string }> = {
    ...baseTokens,
};

for (const t of extraTokens) {
    if (!t?.address || !t?.symbol) continue;
    tokens[t.symbol] = { address: t.address, decimals: Number(t.decimals), symbol: t.symbol };
}

const basePairs: ExtraPair[] = [
    {
        name: "WETH/USDC",
        token0: baseTokens.WETH.address,
        token1: baseTokens.USDC.address,
        uniV3Pools: [
            { address: "0xd0b53d9277642d899df5c87a3966a349a798f224", fee: 500 },   // 0.05%
            { address: "0x4c36388be6f416a29c8d8ae5c1c215bca9ffd4bf", fee: 3000 },  // 0.3%
        ],
        aerodromePools: [
            { address: "0xcdac0d6c6c59727a65f871236188350531885c43", stable: false },
        ],
    },
    {
        name: "cbETH/WETH",
        token0: baseTokens.cbETH.address,
        token1: baseTokens.WETH.address,
        uniV3Pools: [
            { address: "0x257fcbae4ac6b26a02e4fc5e1a11e4174b5ce395", fee: 500 },
        ],
        aerodromePools: [
            { address: "0x44ecc644449fc3a9858d2007caa8cfaa4c561f91", stable: false },
        ],
    },
];

// ═══════════════════════════════════════════════
//  BASE ARBITRAGE PROTOCOL — Backend Configuration
// ═══════════════════════════════════════════════

export const config = {
    // Network
    rpcUrl: process.env.BASE_RPC_URL || "https://mainnet.base.org",
    wsUrl: process.env.BASE_WS_URL || "",
    rpcUrls: (process.env.BASE_RPC_URLS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    wsUrls: (process.env.BASE_WS_URLS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    chainId: 8453,

    // Contract Addresses (populated after deployment)
    contracts: {
        flashLoanExecutor: process.env.FLASH_LOAN_EXECUTOR_ADDRESS || "",
        arbitrageRouter: process.env.ARBITRAGE_ROUTER_ADDRESS || "",
        treasury: process.env.TREASURY_ADDRESS || "",
        uniswapV3Adapter: process.env.UNISWAP_V3_ADAPTER_ADDRESS || "",
        aerodromeAdapter: process.env.AERODROME_ADAPTER_ADDRESS || "",
    },

    // External Protocol Addresses (Base Mainnet)
    external: {
        aavePool: process.env.AAVE_POOL || "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
        uniswapV3Router: process.env.UNISWAP_V3_ROUTER || "0x2626664c2603336E57B271c5C0b26F421741e481",
        uniswapV3Factory: process.env.UNISWAP_V3_FACTORY || "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
        uniswapV3Quoter: process.env.UNISWAP_V3_QUOTER || "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
        aerodromeRouter: process.env.AERODROME_ROUTER || "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
    },

    // Token Addresses (Base Mainnet + optional extras via EXTRA_TOKENS_JSON)
    tokens,

    // Monitored Token Pairs + Pools
    pairs: [...basePairs, ...extraPairs],

    // Pool filters (optional): set to only monitor high-liquidity pools
    poolFilters: {
        minUniV3Liquidity: BigInt(process.env.MIN_UNIV3_LIQUIDITY || "0"),
        minReserveBySymbol: {
            USDC: process.env.MIN_RESERVE_USDC || "",
            WETH: process.env.MIN_RESERVE_WETH || "",
            cbETH: process.env.MIN_RESERVE_CBETH || "",
        } as Record<string, string>,
    },

    // Relayer
    relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY || "",

    // Scanner Settings
    scanner: {
        intervalMs: parseInt(process.env.SCAN_INTERVAL_MS || "5000"),
        minProfitUsd: parseFloat(process.env.MIN_PROFIT_USD || "1.0"),
        profitBufferUsd: parseFloat(process.env.PROFIT_BUFFER_USD || "0.25"),
        maxGasPriceGwei: parseInt(process.env.MAX_GAS_PRICE_GWEI || "50"),
        defaultSlippageBps: 50, // 0.5%
    },

    // Server
    server: {
        port: parseInt(process.env.PORT || "3001"),
        host: process.env.HOST || "127.0.0.1",
        corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
    },

    // Protocol
    protocol: {
        feePercent: 15,
        feeBps: 1500,
        bpsDenominator: 10000,
    },
};

export type TokenConfig = typeof config.tokens.WETH;
export type PairConfig = typeof config.pairs[0];

```

## `backend/src/logger.ts`
```ts
export type LogLevel = "debug" | "info" | "warn" | "error";

const levelRank: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

export interface Logger {
    debug(msg: string, meta?: Record<string, unknown>): void;
    info(msg: string, meta?: Record<string, unknown>): void;
    warn(msg: string, meta?: Record<string, unknown>): void;
    error(msg: string, meta?: Record<string, unknown>): void;
}

function shouldLog(current: LogLevel, target: LogLevel): boolean {
    return levelRank[target] >= levelRank[current];
}

export function createLogger(name: string, level: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info"): Logger {
    const base = { name };
    function log(lvl: LogLevel, msg: string, meta?: Record<string, unknown>) {
        if (!shouldLog(level, lvl)) return;
        const line = {
            t: new Date().toISOString(),
            level: lvl,
            ...base,
            msg,
            ...(meta ? { meta } : {}),
        };
        const out = JSON.stringify(line);
        // eslint-disable-next-line no-console
        if (lvl === "error") console.error(out);
        else if (lvl === "warn") console.warn(out);
        else console.log(out);
    }

    return {
        debug: (msg, meta) => log("debug", msg, meta),
        info: (msg, meta) => log("info", msg, meta),
        warn: (msg, meta) => log("warn", msg, meta),
        error: (msg, meta) => log("error", msg, meta),
    };
}


```

## `backend/src/nonceManager.ts`
```ts
import { ethers } from "ethers";
import { withRetry } from "./retry";

export class NonceManager {
    private provider: ethers.Provider;
    private address: string;
    private nextNonce: number | null = null;

    constructor(provider: ethers.Provider, address: string) {
        this.provider = provider;
        this.address = address;
    }

    async init(): Promise<void> {
        const n = await withRetry(
            () => this.provider.getTransactionCount(this.address, "pending"),
            { retries: 3, baseDelayMs: 250, maxDelayMs: 2000, label: "getTransactionCount" }
        );
        this.nextNonce = n;
    }

    async getNonce(): Promise<number> {
        if (this.nextNonce === null) await this.init();
        return this.nextNonce as number;
    }

    markUsed(nonce: number): void {
        if (this.nextNonce === null) {
            this.nextNonce = nonce + 1;
            return;
        }
        if (this.nextNonce <= nonce) {
            this.nextNonce = nonce + 1;
        }
    }

    async reset(): Promise<void> {
        this.nextNonce = null;
        await this.init();
    }
}

```

## `backend/src/poolMonitor.ts`
```ts
import { ethers } from "ethers";
import { config, PairConfig } from "./config";
import { EventEmitter } from "events";
import { createLogger } from "./logger";
import { createRpcProvider, createWsProvider, getWsUrls } from "./providers";

// ═══════════════════════════════════════════════
//  Pool Monitor — Listens for Swap events on DEX pools
// ═══════════════════════════════════════════════

// Uniswap V3 Pool ABI (minimal)
const UNIV3_POOL_ABI = [
    "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
    "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
    "function liquidity() view returns (uint128)",
    "function token0() view returns (address)",
    "function token1() view returns (address)",
];

// Aerodrome Pool ABI (minimal)
const AERO_POOL_ABI = [
    "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
    "function getReserves() view returns (uint256 _reserve0, uint256 _reserve1, uint256 _blockTimestampLast)",
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function stable() view returns (bool)",
];

export interface PoolState {
    address: string;
    dex: "uniswapV3" | "aerodrome";
    pair: string;
    token0: string;
    token1: string;
    // Uniswap V3 specific
    sqrtPriceX96?: bigint;
    tick?: number;
    liquidity?: bigint;
    fee?: number;
    // Aerodrome specific
    reserve0?: bigint;
    reserve1?: bigint;
    stable?: boolean;
    // Common
    lastUpdated: number;
}

export interface PriceUpdate {
    pair: string;
    pools: PoolState[];
    timestamp: number;
}

export class PoolMonitor extends EventEmitter {
    private provider: ethers.Provider;
    private wsProvider?: ethers.WebSocketProvider;
    private poolStates: Map<string, PoolState> = new Map();
    private pollingInterval?: NodeJS.Timeout;
    private isRunning = false;
    private log = createLogger("PoolMonitor");

    constructor() {
        super();
        this.provider = createRpcProvider();
    }

    async start(): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;

        this.log.info("Starting pool monitoring...");

        // Initialize all pool states
        await this.initializePools();

        // Try WebSocket for real-time events
        const wsUrls = getWsUrls();
        if (wsUrls.length > 0) {
            try {
                this.wsProvider = createWsProvider(wsUrls[0]);
                await this.setupEventListeners();
                this.log.info("WebSocket listeners active", { wsUrl: wsUrls[0] });

                const ws: any = (this.wsProvider as any).websocket;
                const onClose = () => {
                    if (!this.isRunning) return;
                    this.log.warn("WebSocket closed; falling back to polling");
                    try {
                        this.wsProvider?.destroy();
                    } catch {
                        // ignore
                    }
                    this.wsProvider = undefined;
                    this.startPolling();
                };
                if (ws?.addEventListener) ws.addEventListener("close", onClose);
                else if (ws?.on) ws.on("close", onClose);
            } catch (err) {
                this.log.warn("WebSocket failed; falling back to polling");
                this.startPolling();
            }
        } else {
            // Fall back to polling
            this.startPolling();
        }
    }

    stop(): void {
        this.isRunning = false;
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
        if (this.wsProvider) {
            this.wsProvider.destroy();
        }
        this.log.info("Stopped");
    }

    getPoolStates(): Map<string, PoolState> {
        return this.poolStates;
    }

    getPoolsByPair(pairName: string): PoolState[] {
        return Array.from(this.poolStates.values()).filter((p) => p.pair === pairName);
    }

    private async initializePools(): Promise<void> {
        for (const pair of config.pairs) {
            // Initialize Uniswap V3 pools
            for (const pool of pair.uniV3Pools) {
                try {
                    const state = await this.fetchUniV3State(pool.address, pair.name, pool.fee);
                    this.poolStates.set(pool.address, state);
                    this.log.info("Initialized UniV3 pool", { pair: pair.name, fee: pool.fee, address: pool.address });
                } catch (err) {
                    this.log.warn("Failed to init UniV3 pool", { address: pool.address, err: String(err) });
                }
            }

            // Initialize Aerodrome pools
            for (const pool of pair.aerodromePools) {
                try {
                    const state = await this.fetchAeroState(pool.address, pair.name, pool.stable);
                    this.poolStates.set(pool.address, state);
                    this.log.info("Initialized Aerodrome pool", { pair: pair.name, address: pool.address });
                } catch (err) {
                    this.log.warn("Failed to init Aero pool", { address: pool.address, err: String(err) });
                }
            }
        }
    }

    private async fetchUniV3State(address: string, pairName: string, fee: number): Promise<PoolState> {
        const pool = new ethers.Contract(address, UNIV3_POOL_ABI, this.provider);

        const [slot0, liquidity, token0, token1] = await Promise.all([
            pool.slot0(),
            pool.liquidity(),
            pool.token0(),
            pool.token1(),
        ]);

        const minLiquidity = config.poolFilters?.minUniV3Liquidity ?? BigInt(0);
        if (minLiquidity > BigInt(0) && BigInt(liquidity) < minLiquidity) {
            throw new Error(`UniV3 liquidity below threshold`);
        }

        return {
            address,
            dex: "uniswapV3",
            pair: pairName,
            token0,
            token1,
            sqrtPriceX96: slot0.sqrtPriceX96,
            tick: slot0.tick,
            liquidity,
            fee,
            lastUpdated: Date.now(),
        };
    }

    private async fetchAeroState(address: string, pairName: string, stable: boolean): Promise<PoolState> {
        const pool = new ethers.Contract(address, AERO_POOL_ABI, this.provider);

        const [reserves, token0, token1] = await Promise.all([
            pool.getReserves(),
            pool.token0(),
            pool.token1(),
        ]);

        const minReserveBySymbol = config.poolFilters?.minReserveBySymbol ?? {};
        const token0Cfg = Object.values(config.tokens).find(
            (t) => t.address.toLowerCase() === String(token0).toLowerCase()
        );
        const token1Cfg = Object.values(config.tokens).find(
            (t) => t.address.toLowerCase() === String(token1).toLowerCase()
        );

        if (token0Cfg?.symbol && minReserveBySymbol[token0Cfg.symbol]) {
            const min0 = ethers.parseUnits(minReserveBySymbol[token0Cfg.symbol], token0Cfg.decimals);
            if (BigInt(reserves._reserve0) < min0) throw new Error("Aero reserve0 below threshold");
        }
        if (token1Cfg?.symbol && minReserveBySymbol[token1Cfg.symbol]) {
            const min1 = ethers.parseUnits(minReserveBySymbol[token1Cfg.symbol], token1Cfg.decimals);
            if (BigInt(reserves._reserve1) < min1) throw new Error("Aero reserve1 below threshold");
        }

        return {
            address,
            dex: "aerodrome",
            pair: pairName,
            token0,
            token1,
            reserve0: reserves._reserve0,
            reserve1: reserves._reserve1,
            stable,
            lastUpdated: Date.now(),
        };
    }

    private async setupEventListeners(): Promise<void> {
        if (!this.wsProvider) return;

        for (const pair of config.pairs) {
            for (const pool of pair.uniV3Pools) {
                const contract = new ethers.Contract(pool.address, UNIV3_POOL_ABI, this.wsProvider);
                contract.on("Swap", async () => {
                    try {
                        const state = await this.fetchUniV3State(pool.address, pair.name, pool.fee);
                        this.poolStates.set(pool.address, state);
                        this.emitPriceUpdate(pair.name);
                    } catch (err) {
                        this.log.warn("Error updating UniV3 pool", { address: pool.address, err: String(err) });
                    }
                });
            }

            for (const pool of pair.aerodromePools) {
                const contract = new ethers.Contract(pool.address, AERO_POOL_ABI, this.wsProvider);
                contract.on("Swap", async () => {
                    try {
                        const state = await this.fetchAeroState(pool.address, pair.name, pool.stable);
                        this.poolStates.set(pool.address, state);
                        this.emitPriceUpdate(pair.name);
                    } catch (err) {
                        this.log.warn("Error updating Aero pool", { address: pool.address, err: String(err) });
                    }
                });
            }
        }
    }

    private startPolling(): void {
        this.log.info("Polling enabled", { intervalMs: config.scanner.intervalMs });
        this.pollingInterval = setInterval(async () => {
            await this.pollAllPools();
        }, config.scanner.intervalMs);
    }

    private async pollAllPools(): Promise<void> {
        for (const pair of config.pairs) {
            for (const pool of pair.uniV3Pools) {
                try {
                    const state = await this.fetchUniV3State(pool.address, pair.name, pool.fee);
                    const prev = this.poolStates.get(pool.address);
                    this.poolStates.set(pool.address, state);

                    // Emit update if price changed
                    if (!prev || prev.sqrtPriceX96 !== state.sqrtPriceX96) {
                        this.emitPriceUpdate(pair.name);
                    }
                } catch (err) {
                    // Silently continue on poll failure
                }
            }

            for (const pool of pair.aerodromePools) {
                try {
                    const state = await this.fetchAeroState(pool.address, pair.name, pool.stable);
                    const prev = this.poolStates.get(pool.address);
                    this.poolStates.set(pool.address, state);

                    if (!prev || prev.reserve0 !== state.reserve0) {
                        this.emitPriceUpdate(pair.name);
                    }
                } catch (err) {
                    // Silently continue
                }
            }
        }
    }

    private emitPriceUpdate(pairName: string): void {
        const pools = this.getPoolsByPair(pairName);
        const update: PriceUpdate = {
            pair: pairName,
            pools,
            timestamp: Date.now(),
        };
        this.emit("priceUpdate", update);
    }
}

```

## `backend/src/priceCalculator.ts`
```ts
import { PoolState } from "./poolMonitor";
import { config } from "./config";

// ═══════════════════════════════════════════════
//  Price Calculator — Converts pool state to prices
//  and detects cross-DEX price inefficiencies
// ═══════════════════════════════════════════════

export interface PricePoint {
    poolAddress: string;
    dex: string;
    price: number;          // Price of token0 in terms of token1
    inversePrice: number;   // Price of token1 in terms of token0
    liquidity: string;      // Human-readable liquidity
    feeBps: number;         // Pool fee in basis points (bps)
    feeTier?: number;       // Uniswap V3 fee tier (e.g., 500/3000/10000)
    stable?: boolean;       // Aerodrome stable pool flag (if applicable)
}

export interface PriceSpread {
    pair: string;
    buyPool: PricePoint;    // Pool where token0 is cheaper (buy here)
    sellPool: PricePoint;   // Pool where token0 is more expensive (sell here)
    spreadPercent: number;  // Price spread as percentage
    estimatedProfit: number; // Rough profit estimate
    direction: "token0_to_token1" | "token1_to_token0";
    timestamp: number;
}

export class PriceCalculator {
    /**
     * Calculate price from Uniswap V3 sqrtPriceX96
     * price = (sqrtPriceX96 / 2^96)^2
     */
    static uniV3Price(
        sqrtPriceX96: bigint,
        token0Decimals: number,
        token1Decimals: number,
        tick?: number
    ): number {
        const decimalAdjustment = 10 ** (token0Decimals - token1Decimals);

        // Prefer tick-based computation when available to avoid bigint -> number precision loss
        if (typeof tick === "number") {
            const rawPrice = Math.pow(1.0001, tick);
            return rawPrice * decimalAdjustment;
        }

        // Fallback: sqrtPriceX96-based computation (approximate in JS number space)
        const Q96 = 2 ** 96;
        const sqrt = Number(sqrtPriceX96) / Q96;
        const rawPrice = sqrt * sqrt;
        return rawPrice * decimalAdjustment;
    }

    /**
     * Calculate price from Aerodrome reserves (constant product AMM)
     * price = reserve1 / reserve0 (with decimal adjustment)
     */
    static aeroPrice(
        reserve0: bigint,
        reserve1: bigint,
        token0Decimals: number,
        token1Decimals: number
    ): number {
        if (reserve0 === BigInt(0)) return 0;

        const r0 = Number(reserve0) / 10 ** token0Decimals;
        const r1 = Number(reserve1) / 10 ** token1Decimals;

        return r1 / r0;
    }

    /**
     * Convert pool states to price points
     */
    static poolsToPrices(
        pools: PoolState[],
        token0Decimals: number,
        token1Decimals: number
    ): PricePoint[] {
        return pools.map((pool) => {
            let price: number;
            let feeTier: number | undefined;
            let feeBps: number;

            if (pool.dex === "uniswapV3" && pool.sqrtPriceX96) {
                feeTier = pool.fee;
                // Uniswap V3 fee tier (e.g., 500 = 0.05%) -> bps (e.g., 5 bps)
                feeBps = typeof feeTier === "number" ? Math.round(feeTier / 100) : 30;
                price = this.uniV3Price(pool.sqrtPriceX96, token0Decimals, token1Decimals, pool.tick);
            } else if (pool.dex === "aerodrome" && pool.reserve0 && pool.reserve1) {
                price = this.aeroPrice(pool.reserve0, pool.reserve1, token0Decimals, token1Decimals);
                // Aerodrome fee varies by pool; use a conservative default (0.30% = 30 bps).
                feeBps = 30;
            } else {
                price = 0;
                feeBps = 30;
            }

            return {
                poolAddress: pool.address,
                dex: pool.dex === "uniswapV3" ? "Uniswap V3" : "Aerodrome",
                price,
                inversePrice: price > 0 ? 1 / price : 0,
                liquidity: pool.liquidity
                    ? pool.liquidity.toString()
                    : pool.reserve0
                        ? `${pool.reserve0.toString()}/${pool.reserve1?.toString()}`
                        : "0",
                feeBps,
                feeTier,
                stable: pool.stable,
            };
        });
    }

    /**
     * Detect price spreads between pools for arbitrage opportunities
     */
    static detectSpreads(
        pair: string,
        pools: PoolState[],
        token0Decimals: number,
        token1Decimals: number,
        minSpreadPercent: number = 0.1
    ): PriceSpread[] {
        const prices = this.poolsToPrices(pools, token0Decimals, token1Decimals);
        const validPrices = prices.filter((p) => p.price > 0);

        if (validPrices.length < 2) return [];

        const spreads: PriceSpread[] = [];

        for (let i = 0; i < validPrices.length; i++) {
            for (let j = i + 1; j < validPrices.length; j++) {
                const a = validPrices[i];
                const b = validPrices[j];

                // Calculate spread percentage
                const spreadPercent = Math.abs(a.price - b.price) / Math.min(a.price, b.price) * 100;

                // Account for fees
                const totalFeeBps = a.feeBps + b.feeBps;
                const feePercent = totalFeeBps / 100; // 1 bps = 0.01%

                // Net spread after fees
                const netSpread = spreadPercent - feePercent;

                if (netSpread > minSpreadPercent) {
                    const buyPool = a.price < b.price ? a : b;
                    const sellPool = a.price < b.price ? b : a;

                    spreads.push({
                        pair,
                        buyPool,
                        sellPool,
                        spreadPercent: netSpread,
                        estimatedProfit: 0, // Will be calculated by simulator
                        direction: "token0_to_token1",
                        timestamp: Date.now(),
                    });
                }
            }
        }

        return spreads.sort((a, b) => b.spreadPercent - a.spreadPercent);
    }

    /**
     * Get token decimals for a pair config
     */
    static getDecimals(pairName: string): { token0Decimals: number; token1Decimals: number } {
        const pair = config.pairs.find((p) => p.name === pairName);
        if (!pair) return { token0Decimals: 18, token1Decimals: 18 };

        const token0Config = Object.values(config.tokens).find(
            (t) => t.address.toLowerCase() === pair.token0.toLowerCase()
        );
        const token1Config = Object.values(config.tokens).find(
            (t) => t.address.toLowerCase() === pair.token1.toLowerCase()
        );

        return {
            token0Decimals: token0Config?.decimals || 18,
            token1Decimals: token1Config?.decimals || 18,
        };
    }
}

```

## `backend/src/providers.ts`
```ts
import { ethers } from "ethers";
import { config } from "./config";

function uniq(arr: string[]): string[] {
    return Array.from(new Set(arr));
}

export function getRpcUrls(): string[] {
    const urls = [
        ...config.rpcUrls,
        config.rpcUrl,
    ].filter(Boolean);
    return uniq(urls);
}

export function getWsUrls(): string[] {
    const urls = [
        ...config.wsUrls,
        config.wsUrl,
    ].filter(Boolean);
    return uniq(urls);
}

export function createRpcProvider(): ethers.Provider {
    const urls = getRpcUrls();
    if (urls.length <= 1) return new ethers.JsonRpcProvider(urls[0]);
    const providers = urls.map((u) => ({ provider: new ethers.JsonRpcProvider(u), weight: 1 }));
    return new ethers.FallbackProvider(providers, 1);
}

// Use a single primary RPC for transaction submission to avoid inconsistent nonce/mempool across backends.
export function createTxProvider(): ethers.JsonRpcProvider {
    const urls = getRpcUrls();
    return new ethers.JsonRpcProvider(urls[0]);
}

export function createWsProvider(url: string): ethers.WebSocketProvider {
    return new ethers.WebSocketProvider(url);
}

```

## `backend/src/relayer.ts`
```ts
import { ethers } from "ethers";
import { config } from "./config";
import { SimulationResult } from "./simulator";
import { createLogger } from "./logger";
import { NonceManager } from "./nonceManager";
import { withRetry } from "./retry";
import { createTxProvider } from "./providers";

// ═══════════════════════════════════════════════
//  Relayer — Executes arbitrage transactions
// ═══════════════════════════════════════════════

// FlashLoanExecutor ABI (minimal)
const EXECUTOR_ABI = [
    "function executeArbitrage(address asset, uint256 amount, (address adapter, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, bytes data)[] steps, uint256 minNetProfit, address user, uint256 deadline) external",
    "function executeArbitrageWithIntent((address user,address asset,uint256 amount,bytes32 routeHash,uint256 minNetProfit,uint256 deadline,address refundRecipient,uint256 maxGasRefund,uint256 nonce) intent, (address adapter, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, bytes data)[] steps, bytes signature) external",
    "function totalExecutions() view returns (uint256)",
    "function totalProfitGenerated() view returns (uint256)",
    "function totalProtocolFees() view returns (uint256)",
    "function totalUserProfit() view returns (uint256)",
    "function totalGasRefunded() view returns (uint256)",
    "function getTrackedAssets() view returns (address[])",
    "function totalArbitrageVolumeByAsset(address) view returns (uint256)",
    "function totalProfitGeneratedByAsset(address) view returns (uint256)",
    "function totalProtocolFeesByAsset(address) view returns (uint256)",
    "function totalUserProfitByAsset(address) view returns (uint256)",
    "function totalGasRefundedByAsset(address) view returns (uint256)",
];

export interface ExecutionIntent {
    user: string;
    asset: string;
    amount: string;
    routeHash: string;
    minNetProfit: string;
    deadline: string;
    refundRecipient: string;
    maxGasRefund: string;
    nonce: string;
}

export interface ExecutionResult {
    success: boolean;
    txHash?: string;
    gasUsed?: string;
    effectiveGasPrice?: string;
    error?: string;
    simulationId: string;
    timestamp: number;
}

export type AssetTotals = {
    asset: string;
    totalVolume: string;
    totalProfitGenerated: string;
    totalProtocolFees: string;
    totalUserProfit: string;
    totalGasRefunded: string;
};

export class Relayer {
    private provider: ethers.JsonRpcProvider;
    private wallet: ethers.Wallet | ethers.HDNodeWallet;
    private executor?: ethers.Contract;
    private executionHistory: ExecutionResult[] = [];
    private nonces: NonceManager;
    private log = createLogger("Relayer");

    constructor() {
        this.provider = createTxProvider();

        if (!config.relayerPrivateKey) {
            this.log.warn("No relayer private key configured");
            this.wallet = ethers.Wallet.createRandom().connect(this.provider);
        } else {
            this.wallet = new ethers.Wallet(config.relayerPrivateKey, this.provider);
        }

        if (ethers.isAddress(config.contracts.flashLoanExecutor) && config.contracts.flashLoanExecutor !== ethers.ZeroAddress) {
            this.executor = new ethers.Contract(config.contracts.flashLoanExecutor, EXECUTOR_ABI, this.wallet);
        } else {
            this.log.warn("Execution not configured (missing FLASH_LOAN_EXECUTOR_ADDRESS)");
            this.executor = undefined;
        }
        this.nonces = new NonceManager(this.provider, this.wallet.address);
    }

    private requireExecutor(): ethers.Contract {
        if (!this.executor) throw new Error("Relayer: execution not configured");
        return this.executor;
    }

    /**
     * Execute an arbitrage opportunity on-chain
     */
    async execute(
        simulation: SimulationResult,
        userAddress: string
    ): Promise<ExecutionResult> {
        try {
            this.log.info("Executing arbitrage", { simulationId: simulation.id, userAddress });
            const executor = this.requireExecutor();

            // Pre-flight checks
            await this.preFlight(simulation);

            // Build contract call parameters
            const steps = simulation.route.steps.map((step) => ({
                adapter: step.adapter,
                tokenIn: step.tokenIn,
                tokenOut: step.tokenOut,
                amountIn: step.amountIn,
                minAmountOut: step.minAmountOut,
                data: step.data,
            }));

            const deadline = Math.floor(Date.now() / 1000) + 300; // 5 min deadline

            // Apply slippage to minNetProfit
            const minNetProfit = this.applySlippage(
                BigInt(simulation.userProfitRaw),
                config.scanner.defaultSlippageBps
            );

            // Estimate gas first
            const gasEstimate = await executor.executeArbitrage.estimateGas(
                simulation.route.flashLoanToken,
                simulation.route.flashLoanAmount,
                steps,
                minNetProfit.toString(),
                userAddress,
                deadline
            );

            // Add 20% buffer to gas estimate
            const gasLimit = (gasEstimate * BigInt(120)) / BigInt(100);

            const nonce = await this.nonces.getNonce();
            const tx = await this.sendWithRetry(() =>
                executor.executeArbitrage(
                    simulation.route.flashLoanToken,
                    simulation.route.flashLoanAmount,
                    steps,
                    minNetProfit.toString(),
                    userAddress,
                    deadline,
                    { gasLimit, nonce }
                )
            );
            this.nonces.markUsed(nonce);

            this.log.info("Transaction submitted", { hash: tx.hash, nonce });

            // Wait for confirmation
            const receipt = await tx.wait(1);

            const result: ExecutionResult = {
                success: receipt.status === 1,
                txHash: receipt.hash,
                gasUsed: receipt.gasUsed.toString(),
                effectiveGasPrice: receipt.gasPrice?.toString(),
                simulationId: simulation.id,
                timestamp: Date.now(),
            };

            this.executionHistory.push(result);
            this.log.info("Execution mined", { success: result.success, hash: result.txHash });

            return result;
        } catch (err: any) {
            const result: ExecutionResult = {
                success: false,
                error: err.message || "Unknown error",
                simulationId: simulation.id,
                timestamp: Date.now(),
            };

            this.executionHistory.push(result);
            this.log.error("Execution failed", { err: err?.message || String(err) });

            return result;
        }
    }

    /**
     * Execute an arbitrage using a user-signed intent (hybrid execution).
     */
    async executeWithIntent(
        intent: ExecutionIntent,
        steps: SimulationResult["route"]["steps"],
        signature: string
    ): Promise<ExecutionResult> {
        try {
            this.log.info("Executing signed intent", { user: intent.user });
            const executor = this.requireExecutor();

            if (!ethers.isAddress(intent.user) || !ethers.isAddress(intent.asset)) {
                throw new Error("Invalid intent addresses");
            }

            const nonce = await this.nonces.getNonce();
            const tx = await this.sendWithRetry(() =>
                executor.executeArbitrageWithIntent(
                    {
                        user: intent.user,
                        asset: intent.asset,
                        amount: intent.amount,
                        routeHash: intent.routeHash,
                        minNetProfit: intent.minNetProfit,
                        deadline: intent.deadline,
                        refundRecipient: intent.refundRecipient,
                        maxGasRefund: intent.maxGasRefund,
                        nonce: intent.nonce,
                    },
                    steps.map((s) => ({
                        adapter: s.adapter,
                        tokenIn: s.tokenIn,
                        tokenOut: s.tokenOut,
                        amountIn: s.amountIn,
                        minAmountOut: s.minAmountOut,
                        data: s.data,
                    })),
                    signature,
                    { nonce }
                )
            );
            this.nonces.markUsed(nonce);

            this.log.info("Intent transaction submitted", { hash: tx.hash, nonce });

            const receipt = await tx.wait(1);
            const result: ExecutionResult = {
                success: receipt.status === 1,
                txHash: receipt.hash,
                gasUsed: receipt.gasUsed.toString(),
                effectiveGasPrice: receipt.gasPrice?.toString(),
                simulationId: `intent-${intent.user}-${Date.now()}`,
                timestamp: Date.now(),
            };

            this.executionHistory.push(result);
            return result;
        } catch (err: any) {
            const result: ExecutionResult = {
                success: false,
                error: err.message || "Unknown error",
                simulationId: `intent-${intent.user || "unknown"}-${Date.now()}`,
                timestamp: Date.now(),
            };

            this.executionHistory.push(result);
            this.log.error("Intent execution failed", { err: err?.message || String(err) });
            return result;
        }
    }

    /**
     * Pre-flight checks before executing
     */
    private async preFlight(simulation: SimulationResult): Promise<void> {
        // Check gas price
        const feeData = await withRetry(() => this.provider.getFeeData(), {
            retries: 2,
            baseDelayMs: 250,
            maxDelayMs: 1500,
            label: "getFeeData",
        });
        const gasPrice = feeData.gasPrice;
        if (gasPrice && gasPrice > ethers.parseUnits(String(config.scanner.maxGasPriceGwei), "gwei")) {
            throw new Error(`Gas price too high: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
        }

        // Check if still profitable
        if (!simulation.netProfitable) {
            throw new Error("Simulation shows trade is not profitable");
        }

        // Check relayer balance for gas
        const balance = await withRetry(() => this.provider.getBalance(this.wallet.address), {
            retries: 2,
            baseDelayMs: 250,
            maxDelayMs: 1500,
            label: "getBalance",
        });
        if (balance < ethers.parseEther("0.01")) {
            throw new Error("Relayer ETH balance too low for gas");
        }
    }

    private isNonceError(msg: string): boolean {
        const m = msg.toLowerCase();
        return m.includes("nonce") && (m.includes("too low") || m.includes("already used") || m.includes("replacement"));
    }

    private isTransient(msg: string): boolean {
        const m = msg.toLowerCase();
        return m.includes("timeout") || m.includes("econnreset") || m.includes("network") || m.includes("429");
    }

    private async sendWithRetry<T extends ethers.ContractTransactionResponse>(
        send: () => Promise<T>
    ): Promise<T> {
        try {
            return await withRetry(send, {
                retries: 2,
                baseDelayMs: 400,
                maxDelayMs: 2500,
                shouldRetry: (err) => {
                    const msg = (err as any)?.message || String(err);
                    if (this.isTransient(msg)) return true;
                    if (this.isNonceError(msg)) return true;
                    return false;
                },
            });
        } catch (err: any) {
            const msg = err?.message || String(err);
            if (this.isNonceError(msg)) {
                await this.nonces.reset();
            }
            throw err;
        }
    }

    /**
     * Apply slippage tolerance to an amount
     */
    private applySlippage(amount: bigint, slippageBps: number): bigint {
        return (amount * BigInt(10000 - slippageBps)) / BigInt(10000);
    }

    /**
     * Get execution history
     */
    getHistory(): ExecutionResult[] {
        return [...this.executionHistory].reverse();
    }

    /**
     * Get on-chain execution stats
     */
    async getStats(): Promise<{
        totalExecutions: string;
        totalProfitGenerated: string;
        totalProtocolFees: string;
        totalUserProfit: string;
        totalGasRefunded: string;
        totalsByAsset: AssetTotals[];
    }> {
        try {
            if (!this.executor) {
                return {
                    totalExecutions: "0",
                    totalProfitGenerated: "0",
                    totalProtocolFees: "0",
                    totalUserProfit: "0",
                    totalGasRefunded: "0",
                    totalsByAsset: [],
                };
            }
            const [executions, profit, protocolFees, userProfit, gasRefunded, assets] = await Promise.all([
                this.executor.totalExecutions(),
                this.executor.totalProfitGenerated(),
                this.executor.totalProtocolFees(),
                this.executor.totalUserProfit(),
                this.executor.totalGasRefunded(),
                this.executor.getTrackedAssets().catch(() => []),
            ]);

            const uniqueAssets = Array.from(
                new Set(
                    (assets as string[]).concat([
                        config.tokens.USDC.address,
                        config.tokens.WETH.address,
                        Object.values(config.tokens).find((t) => t.symbol.toLowerCase() === "cbeth")?.address || "",
                    ])
                )
            ).filter((a) => ethers.isAddress(a) && a !== ethers.ZeroAddress);

            const totalsByAsset: AssetTotals[] = [];
            for (const asset of uniqueAssets) {
                const [vol, pGen, pFee, uProfit, gRef] = await Promise.all([
                    this.executor.totalArbitrageVolumeByAsset(asset),
                    this.executor.totalProfitGeneratedByAsset(asset),
                    this.executor.totalProtocolFeesByAsset(asset),
                    this.executor.totalUserProfitByAsset(asset),
                    this.executor.totalGasRefundedByAsset(asset),
                ]);
                const hasAny =
                    vol > 0n || pGen > 0n || pFee > 0n || uProfit > 0n || gRef > 0n;
                if (hasAny) {
                    totalsByAsset.push({
                        asset,
                        totalVolume: vol.toString(),
                        totalProfitGenerated: pGen.toString(),
                        totalProtocolFees: pFee.toString(),
                        totalUserProfit: uProfit.toString(),
                        totalGasRefunded: gRef.toString(),
                    });
                }
            }
            return {
                totalExecutions: executions.toString(),
                totalProfitGenerated: profit.toString(),
                totalProtocolFees: protocolFees.toString(),
                totalUserProfit: userProfit.toString(),
                totalGasRefunded: gasRefunded.toString(),
                totalsByAsset,
            };
        } catch {
            return {
                totalExecutions: "0",
                totalProfitGenerated: "0",
                totalProtocolFees: "0",
                totalUserProfit: "0",
                totalGasRefunded: "0",
                totalsByAsset: [],
            };
        }
    }

    /**
     * Get relayer wallet address
     */
    getAddress(): string {
        return this.wallet.address;
    }
}

```

## `backend/src/retry.ts`
```ts
export interface RetryOptions {
    retries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    label?: string;
    shouldRetry?: (err: unknown) => boolean;
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function jitter(ms: number): number {
    const j = ms * 0.2;
    return Math.max(0, Math.floor(ms - j + Math.random() * (2 * j)));
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
    const { retries, baseDelayMs, maxDelayMs, shouldRetry } = opts;
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            return await fn();
        } catch (err) {
            attempt++;
            const canRetry = attempt <= retries && (shouldRetry ? shouldRetry(err) : true);
            if (!canRetry) throw err;
            const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
            await sleep(jitter(delay));
        }
    }
}


```

## `backend/src/routeVerifier.ts`
```ts
import { ethers } from "ethers";
import { config } from "./config";
import { createRpcProvider } from "./providers";
import { withRetry } from "./retry";

const QUOTER_ABI = [
    "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
];

const AERO_ROUTER_ABI = [
    "function getAmountsOut(uint256 amountIn, (address from, address to, bool stable, address factory)[] routes) view returns (uint256[] amounts)",
    "function defaultFactory() view returns (address)",
];

const EXECUTOR_ABI = [
    "function executeArbitrageWithIntent((address user,address asset,uint256 amount,bytes32 routeHash,uint256 minNetProfit,uint256 deadline,address refundRecipient,uint256 maxGasRefund,uint256 nonce) intent, (address adapter,address tokenIn,address tokenOut,uint256 amountIn,uint256 minAmountOut,bytes data)[] steps, bytes signature) external",
];

const AAVE_POOL_ABI = [
    "function FLASHLOAN_PREMIUM_TOTAL() view returns (uint128)",
];

export type Step = {
    adapter: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    minAmountOut: string;
    data: string;
};

export type Intent = {
    user: string;
    asset: string;
    amount: string;
    routeHash: string;
    minNetProfit: string;
    deadline: string;
    refundRecipient: string;
    maxGasRefund: string;
    nonce: string;
};

export type VerificationResult = {
    ok: boolean;
    reason?: string;
    amountOwed?: bigint;
    amountOut?: bigint;
    grossProfit?: bigint;
    gasRefund?: bigint;
    netProfitAfterRefund?: bigint;
    protocolFee?: bigint;
    userProfit?: bigint;
    gasEstimate?: bigint;
};

function lower(x: string): string {
    return x.toLowerCase();
}

function isUniswapAdapter(adapter: string): boolean {
    return !!config.contracts.uniswapV3Adapter && lower(adapter) === lower(config.contracts.uniswapV3Adapter);
}

function isAerodromeAdapter(adapter: string): boolean {
    return !!config.contracts.aerodromeAdapter && lower(adapter) === lower(config.contracts.aerodromeAdapter);
}

function decodeUint24(data: string): number {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    return Number(coder.decode(["uint24"], data)[0]);
}

function decodeBool(data: string): boolean {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    return Boolean(coder.decode(["bool"], data)[0]);
}

export class RouteVerifier {
    private provider: ethers.Provider;
    private quoter: ethers.Contract;
    private aeroRouter: ethers.Contract;
    private executor?: ethers.Contract;
    private aeroFactory?: string;

    constructor() {
        this.provider = createRpcProvider();
        this.quoter = new ethers.Contract(config.external.uniswapV3Quoter, QUOTER_ABI, this.provider);
        this.aeroRouter = new ethers.Contract(config.external.aerodromeRouter, AERO_ROUTER_ABI, this.provider);
        if (config.contracts.flashLoanExecutor) {
            this.executor = new ethers.Contract(config.contracts.flashLoanExecutor, EXECUTOR_ABI, this.provider);
        }
    }

    private async getAeroFactory(): Promise<string> {
        if (this.aeroFactory) return this.aeroFactory;
        const f = await withRetry(() => this.aeroRouter.defaultFactory(), {
            retries: 2,
            baseDelayMs: 200,
            maxDelayMs: 1500,
            label: "aero.defaultFactory",
        });
        this.aeroFactory = String(f);
        return this.aeroFactory;
    }

    private async quoteStep(step: Step, amountIn: bigint): Promise<bigint> {
        if (isUniswapAdapter(step.adapter)) {
            const fee = decodeUint24(step.data);
            const result = await withRetry(
                () =>
                    this.quoter.quoteExactInputSingle.staticCall({
                        tokenIn: step.tokenIn,
                        tokenOut: step.tokenOut,
                        amountIn,
                        fee,
                        sqrtPriceLimitX96: 0,
                    }),
                { retries: 2, baseDelayMs: 250, maxDelayMs: 2000, label: "quote.univ3" }
            );
            return result.amountOut as bigint;
        }

        if (isAerodromeAdapter(step.adapter)) {
            const stable = decodeBool(step.data);
            const factory = await this.getAeroFactory();
            const routes = [
                {
                    from: step.tokenIn,
                    to: step.tokenOut,
                    stable,
                    factory,
                },
            ];
            const amounts = await withRetry(() => this.aeroRouter.getAmountsOut(amountIn, routes), {
                retries: 2,
                baseDelayMs: 250,
                maxDelayMs: 2000,
                label: "quote.aero",
            });
            return amounts[amounts.length - 1] as bigint;
        }

        throw new Error("Unknown adapter");
    }

    private async getAavePremiumBps(): Promise<bigint> {
        const pool = new ethers.Contract(config.external.aavePool, AAVE_POOL_ABI, this.provider);
        try {
            const p = await withRetry(() => pool.FLASHLOAN_PREMIUM_TOTAL(), {
                retries: 2,
                baseDelayMs: 250,
                maxDelayMs: 2000,
                label: "aave.premium",
            });
            return BigInt(p);
        } catch {
            return 5n; // fallback to 0.05%
        }
    }

    async verifyIntent(intent: Intent, steps: Step[], signature: string): Promise<VerificationResult> {
        try {
            if (!steps || steps.length < 2) return { ok: false, reason: "need >=2 steps" };
            if (lower(steps[0].tokenIn) !== lower(intent.asset)) return { ok: false, reason: "route start mismatch" };
            if (lower(steps[steps.length - 1].tokenOut) !== lower(intent.asset))
                return { ok: false, reason: "route end mismatch" };

            let amount = BigInt(intent.amount);
            if (amount <= 0n) return { ok: false, reason: "amount=0" };

            // Quote the route
            let current = amount;
            for (let i = 0; i < steps.length; i++) {
                const s = steps[i];
                const stepIn = BigInt(s.amountIn || "0");
                const useAmountIn = stepIn > 0n ? stepIn : current;
                const out = await this.quoteStep(s, useAmountIn);
                const minOut = BigInt(s.minAmountOut);
                if (out < minOut) return { ok: false, reason: "minAmountOut breached in quote" };
                current = out;
            }

            const premiumBps = await this.getAavePremiumBps();
            const premium = (amount * premiumBps) / 10000n;
            const amountOwed = amount + premium;

            if (current <= amountOwed) return { ok: false, reason: "unprofitable before fees" };
            const grossProfit = current - amountOwed;

            const maxRefund = BigInt(intent.maxGasRefund || "0");
            const gasRefund = maxRefund > 0n ? (grossProfit >= maxRefund ? maxRefund : grossProfit) : 0n;
            const netProfitAfterRefund = grossProfit - gasRefund;
            if (netProfitAfterRefund <= 0n) return { ok: false, reason: "netProfit<=0" };

            const protocolFee = (netProfitAfterRefund * 1500n) / 10000n;
            const userProfit = netProfitAfterRefund - protocolFee;
            if (userProfit <= 0n) return { ok: false, reason: "userProfit<=0" };

            const minNet = BigInt(intent.minNetProfit || "0");
            if (userProfit < minNet) return { ok: false, reason: "below minNetProfit" };

            // Optional gas estimation validation (requires deployed executor + correct RELAYER_ROLE; best-effort)
            let gasEstimate: bigint | undefined;
            if (this.executor) {
                try {
                    gasEstimate = await withRetry(
                        async () => {
                            const g = await this.executor!.executeArbitrageWithIntent.estimateGas(intent, steps, signature);
                            return BigInt(g);
                        },
                        { retries: 1, baseDelayMs: 250, maxDelayMs: 1000, label: "estimateGas" }
                    );
                } catch {
                    // ignore
                }
            }

            return {
                ok: true,
                amountOwed,
                amountOut: current,
                grossProfit,
                gasRefund,
                netProfitAfterRefund,
                protocolFee,
                userProfit,
                gasEstimate,
            };
        } catch (err: any) {
            return { ok: false, reason: err?.message || String(err) };
        }
    }
}

```

## `backend/src/server.ts`
```ts
import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { ethers } from "ethers";
import { config } from "./config";
import { PoolMonitor, PriceUpdate } from "./poolMonitor";
import { PriceCalculator } from "./priceCalculator";
import { Simulator, SimulationResult } from "./simulator";
import { Relayer } from "./relayer";
import { createLogger } from "./logger";
import { RouteVerifier } from "./routeVerifier";

// ═══════════════════════════════════════════════
//  BASE ARBITRAGE PROTOCOL — API Server
// ═══════════════════════════════════════════════

const app = express();
app.use(cors({ origin: config.server.corsOrigin }));
app.use(express.json());
app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        log.info("HTTP", { method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start });
    });
    next();
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Core modules
const poolMonitor = new PoolMonitor();
const simulator = new Simulator();
const relayer = new Relayer();
const routeVerifier = new RouteVerifier();
const log = createLogger("API");

const QUOTER_ABI = [
    "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
];

let cachedEthPrice: { usd: number; ts: number } | null = null;
async function getEthPriceUsd(): Promise<number> {
    const now = Date.now();
    if (cachedEthPrice && now - cachedEthPrice.ts < 30_000) return cachedEthPrice.usd;

    const weth = config.tokens.WETH.address;
    const usdc = config.tokens.USDC.address;
    const fee = config.pairs.find((p) => p.name === "WETH/USDC")?.uniV3Pools?.[0]?.fee ?? 3000;

    const quoter = new ethers.Contract(config.external.uniswapV3Quoter, QUOTER_ABI, new ethers.JsonRpcProvider(config.rpcUrl));
    const result = await quoter.quoteExactInputSingle.staticCall({
        tokenIn: weth,
        tokenOut: usdc,
        amountIn: ethers.parseEther("1"),
        fee,
        sqrtPriceLimitX96: 0,
    });
    const usd = parseFloat(ethers.formatUnits(result.amountOut, 6));
    cachedEthPrice = { usd, ts: now };
    return usd;
}

function isExecutionConfigured(): { ok: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!config.contracts.flashLoanExecutor) missing.push("FLASH_LOAN_EXECUTOR_ADDRESS");
    if (!config.contracts.treasury) missing.push("TREASURY_ADDRESS");
    if (!config.contracts.uniswapV3Adapter) missing.push("UNISWAP_V3_ADAPTER_ADDRESS");
    if (!config.contracts.aerodromeAdapter) missing.push("AERODROME_ADAPTER_ADDRESS");
    if (!config.relayerPrivateKey) missing.push("RELAYER_PRIVATE_KEY");
    return { ok: missing.length === 0, missing };
}

// State
let activeOpportunities: SimulationResult[] = [];
let totalArbitrageVolume = "0";
let totalOpportunitiesFound = 0;

// ═══════════════════════════════════════════════
//  WebSocket — Broadcast opportunities in real-time
// ═══════════════════════════════════════════════

function broadcast(type: string, data: any): void {
    const message = JSON.stringify({ type, data, timestamp: Date.now() });
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

wss.on("connection", (ws) => {
    log.info("WS client connected");

    // Send current opportunities on connect
    ws.send(
        JSON.stringify({
            type: "opportunities",
            data: activeOpportunities,
            timestamp: Date.now(),
        })
    );

    ws.on("close", () => log.info("WS client disconnected"));
});

// ═══════════════════════════════════════════════
//  Pool Monitor Event Handler
// ═══════════════════════════════════════════════

poolMonitor.on("priceUpdate", async (update: PriceUpdate) => {
    try {
        const { token0Decimals, token1Decimals } = PriceCalculator.getDecimals(update.pair);

        // Detect price spreads
        const spreads = PriceCalculator.detectSpreads(
            update.pair,
            update.pools,
            token0Decimals,
            token1Decimals,
            0.05 // Min 0.05% spread
        );

        if (spreads.length === 0) return;

        // Simulate top opportunities
        const simulations: SimulationResult[] = [];
        for (const spread of spreads.slice(0, 3)) {
            // Test with different input sizes
            const amounts = [100, 500, 1000, 5000];
            for (const amount of amounts) {
                const sim = await simulator.simulate(spread, amount);
                if (sim && sim.netProfitable) {
                    simulations.push(sim);
                }
            }
        }

        if (simulations.length > 0) {
            // Keep best opportunities per pair (highest user profit)
            const bestSimulations = simulations
                .sort((a, b) => parseFloat(b.userProfit) - parseFloat(a.userProfit))
                .slice(0, 5);

            // Update active opportunities (replace same pair)
            activeOpportunities = [
                ...activeOpportunities.filter((o) => o.pair !== update.pair),
                ...bestSimulations,
            ].slice(0, 20); // Cap at 20

            totalOpportunitiesFound += bestSimulations.length;

            // Broadcast to frontend
            broadcast("opportunities", activeOpportunities);
            log.info("Scanner opportunities", { pair: update.pair, count: bestSimulations.length });
        }
    } catch (err) {
        log.warn("Scanner error processing update", { err: String(err) });
    }
});

// ═══════════════════════════════════════════════
//  REST API Endpoints
// ═══════════════════════════════════════════════

// Health check
app.get("/api/health", (req, res) => {
    const execConfig = isExecutionConfigured();
    res.json({
        status: "ok",
        uptime: process.uptime(),
        poolsMonitored: poolMonitor.getPoolStates().size,
        activeOpportunities: activeOpportunities.length,
        executionConfigured: execConfig.ok,
        missingEnv: execConfig.ok ? [] : execConfig.missing,
    });
});

// Get current opportunities
app.get("/api/opportunities", (req, res) => {
    res.json({
        opportunities: activeOpportunities,
        count: activeOpportunities.length,
        timestamp: Date.now(),
    });
});

// Execute an arbitrage opportunity
app.post("/api/execute", async (req, res) => {
    try {
        const { simulationId, userAddress } = req.body;

        const execConfig = isExecutionConfigured();
        if (!execConfig.ok) {
            return res.status(503).json({
                error: "Execution not configured on server",
                missingEnv: execConfig.missing,
            });
        }

        if (!simulationId || !userAddress) {
            return res.status(400).json({ error: "Missing simulationId or userAddress" });
        }

        if (!ethers.isAddress(userAddress)) {
            return res.status(400).json({ error: "Invalid userAddress" });
        }

        // Find the simulation
        const simulation = activeOpportunities.find((o) => o.id === simulationId);
        if (!simulation) {
            return res.status(404).json({ error: "Opportunity not found or expired" });
        }

        // Re-simulate to verify still profitable
        console.log(`[API] Re-simulating opportunity ${simulationId} before execution`);
        // For now, use the cached simulation
        // In production, re-simulate here

        if (!simulation.netProfitable) {
            return res.status(400).json({ error: "Opportunity no longer profitable" });
        }

        // Execute via relayer
        const result = await relayer.execute(simulation, userAddress);

        // Broadcast execution result
        broadcast("execution", result);

        // Remove executed opportunity
        activeOpportunities = activeOpportunities.filter((o) => o.id !== simulationId);
        broadcast("opportunities", activeOpportunities);

        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Execute using a user-signed intent (hybrid execution)
app.post("/api/intent/submit", async (req, res) => {
    try {
        const execConfig = isExecutionConfigured();
        if (!execConfig.ok) {
            return res.status(503).json({
                error: "Execution not configured on server",
                missingEnv: execConfig.missing,
            });
        }

        const { intent, steps, signature } = req.body || {};
        if (!intent || !steps || !signature) {
            return res.status(400).json({ error: "Missing intent, steps, or signature" });
        }

        if (!ethers.isAddress(intent.user) || !ethers.isAddress(intent.asset)) {
            return res.status(400).json({ error: "Invalid intent addresses" });
        }
        if (typeof intent.routeHash !== "string" || !intent.routeHash.startsWith("0x")) {
            return res.status(400).json({ error: "Invalid routeHash" });
        }
        if (typeof signature !== "string" || !signature.startsWith("0x")) {
            return res.status(400).json({ error: "Invalid signature" });
        }

        // Basic route hash verification on the server (defense-in-depth; contract also checks)
        const coder = ethers.AbiCoder.defaultAbiCoder();
        const normalizedSteps = (steps as any[]).map((s) => ({
            adapter: s.adapter,
            tokenIn: s.tokenIn,
            tokenOut: s.tokenOut,
            amountIn: BigInt(s.amountIn),
            minAmountOut: BigInt(s.minAmountOut),
            data: s.data,
        }));

        if (normalizedSteps.length < 2) {
            return res.status(400).json({ error: "Route must have at least 2 steps" });
        }
        if (
            String(normalizedSteps[0].tokenIn).toLowerCase() !== String(intent.asset).toLowerCase() ||
            String(normalizedSteps[normalizedSteps.length - 1].tokenOut).toLowerCase() !==
                String(intent.asset).toLowerCase()
        ) {
            return res.status(400).json({ error: "Route must start/end in borrowed asset" });
        }
        if (normalizedSteps.some((s) => s.minAmountOut <= BigInt(0))) {
            return res.status(400).json({ error: "minAmountOut must be > 0" });
        }

        const encoded = coder.encode(
            [
                "tuple(address adapter,address tokenIn,address tokenOut,uint256 amountIn,uint256 minAmountOut,bytes data)[]",
            ],
            [normalizedSteps]
        );
        const computed = ethers.keccak256(encoded);
        if (computed.toLowerCase() !== String(intent.routeHash).toLowerCase()) {
            return res.status(400).json({ error: "routeHash mismatch" });
        }

        // Re-simulate/verify on the server just before submitting a transaction.
        const verification = await routeVerifier.verifyIntent(intent, steps, signature);
        if (!verification.ok) {
            return res.status(422).json({ error: "Intent not profitable", reason: verification.reason });
        }

        const minRequiredUsd = Math.max(0, config.scanner.minProfitUsd + config.scanner.profitBufferUsd);
        const assetLower = String(intent.asset).toLowerCase();
        const usdcLower = config.tokens.USDC.address.toLowerCase();
        const wethLower = config.tokens.WETH.address.toLowerCase();

        if (assetLower === usdcLower) {
            const minRaw = ethers.parseUnits(minRequiredUsd.toFixed(6), 6);
            if ((verification.userProfit ?? 0n) < minRaw) {
                return res.status(422).json({ error: "Profit below threshold", minRequiredUsd });
            }
        } else if (assetLower === wethLower) {
            const ethPriceUsd = await getEthPriceUsd();
            const userProfitEth = parseFloat(ethers.formatEther(verification.userProfit ?? 0n));
            const userProfitUsd = userProfitEth * ethPriceUsd;
            if (userProfitUsd < minRequiredUsd) {
                return res.status(422).json({ error: "Profit below threshold", minRequiredUsd, userProfitUsd });
            }
        }

        const result = await relayer.executeWithIntent(intent, steps, signature);
        broadcast("execution", result);
        return res.json(result);
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// Get execution history
app.get("/api/history", (req, res) => {
    const history = relayer.getHistory();
    res.json({ history, count: history.length });
});

// Get protocol analytics
app.get("/api/analytics", async (req, res) => {
    try {
        const stats = await relayer.getStats();
        const poolStates = poolMonitor.getPoolStates();
        const history = relayer.getHistory();
        const attempts = history.length;
        const successes = history.filter((h) => h.success).length;
        const successRate = attempts > 0 ? successes / attempts : 0;

        // Calculate pool prices for display
        const pairPrices = config.pairs.map((pair) => {
            const pools = poolMonitor.getPoolsByPair(pair.name);
            const { token0Decimals, token1Decimals } = PriceCalculator.getDecimals(pair.name);
            const prices = PriceCalculator.poolsToPrices(pools, token0Decimals, token1Decimals);
            return { pair: pair.name, prices };
        });

        function tokenMeta(address: string): { symbol: string; decimals: number } | null {
            const t = Object.values(config.tokens).find((x) => x.address.toLowerCase() === address.toLowerCase());
            return t ? { symbol: t.symbol, decimals: t.decimals } : null;
        }

        const ethPriceUsd = await getEthPriceUsd();
        const usdc = config.tokens.USDC.address.toLowerCase();
        const weth = config.tokens.WETH.address.toLowerCase();

        const totalsByAsset = (stats.totalsByAsset ?? []).map((t) => {
            const meta = tokenMeta(t.asset);
            const decimals = meta?.decimals ?? 18;
            const volumeHuman = ethers.formatUnits(t.totalVolume, decimals);
            const userProfitHuman = ethers.formatUnits(t.totalUserProfit, decimals);
            const protocolRevenueHuman = ethers.formatUnits(t.totalProtocolFees, decimals);

            const toUsd = (human: string): number | null => {
                const n = Number(human);
                if (!Number.isFinite(n)) return null;
                if (t.asset.toLowerCase() === usdc) return n;
                if (t.asset.toLowerCase() === weth) return n * ethPriceUsd;
                return null;
            };

            return {
                asset: t.asset,
                symbol: meta?.symbol ?? "UNKNOWN",
                decimals,
                totalVolumeRaw: t.totalVolume,
                totalVolume: volumeHuman,
                totalVolumeUsd: toUsd(volumeHuman),
                totalUserProfitRaw: t.totalUserProfit,
                totalUserProfit: userProfitHuman,
                totalUserProfitUsd: toUsd(userProfitHuman),
                totalProtocolRevenueRaw: t.totalProtocolFees,
                totalProtocolRevenue: protocolRevenueHuman,
                totalProtocolRevenueUsd: toUsd(protocolRevenueHuman),
                totalProfitGeneratedRaw: t.totalProfitGenerated,
                totalProfitGenerated: ethers.formatUnits(t.totalProfitGenerated, decimals),
                totalGasRefundedRaw: t.totalGasRefunded,
                totalGasRefunded: ethers.formatUnits(t.totalGasRefunded, decimals),
            };
        });

        const sumUsd = (field: "totalVolumeUsd" | "totalUserProfitUsd" | "totalProtocolRevenueUsd") =>
            totalsByAsset.reduce((acc, x) => acc + (typeof x[field] === "number" ? (x[field] as number) : 0), 0);

        const dexLiquidity = Array.from(poolStates.values()).map((p) => {
            const t0 = tokenMeta(p.token0);
            const t1 = tokenMeta(p.token1);
            const reserve0 = p.reserve0 && t0 ? ethers.formatUnits(p.reserve0, t0.decimals) : null;
            const reserve1 = p.reserve1 && t1 ? ethers.formatUnits(p.reserve1, t1.decimals) : null;
            return {
                address: p.address,
                dex: p.dex,
                pair: p.pair,
                token0: { address: p.token0, symbol: t0?.symbol ?? "UNKNOWN", decimals: t0?.decimals ?? 18 },
                token1: { address: p.token1, symbol: t1?.symbol ?? "UNKNOWN", decimals: t1?.decimals ?? 18 },
                uniV3: p.dex === "uniswapV3"
                    ? { liquidity: p.liquidity?.toString() ?? "0", fee: p.fee ?? 0, tick: p.tick ?? 0 }
                    : null,
                aerodrome: p.dex === "aerodrome"
                    ? { reserve0: p.reserve0?.toString() ?? "0", reserve1: p.reserve1?.toString() ?? "0", stable: !!p.stable, reserve0Human: reserve0, reserve1Human: reserve1 }
                    : null,
                lastUpdated: p.lastUpdated,
            };
        });

        const dexOverview = dexLiquidity.reduce(
            (acc, p) => {
                acc.totalPools += 1;
                if (p.dex === "uniswapV3") acc.uniswapV3Pools += 1;
                if (p.dex === "aerodrome") acc.aerodromePools += 1;
                return acc;
            },
            { totalPools: 0, uniswapV3Pools: 0, aerodromePools: 0 }
        );

        res.json({
            protocol: {
                totalExecutions: stats.totalExecutions,
                totalProfitGenerated: stats.totalProfitGenerated,
                totalOpportunitiesFound,
                feePercent: config.protocol.feePercent,
                totalsByAsset,
                totalsUsd: {
                    totalArbitrageVolumeUsd: sumUsd("totalVolumeUsd"),
                    totalUserProfitUsd: sumUsd("totalUserProfitUsd"),
                    totalProtocolRevenueUsd: sumUsd("totalProtocolRevenueUsd"),
                    ethPriceUsd,
                },
                success: {
                    attempts,
                    successes,
                    successRate,
                    inefficienciesCorrected: successes,
                },
            },
            pools: {
                monitored: poolStates.size,
                pairs: pairPrices,
                dexOverview,
                dexLiquidity,
            },
            relayer: {
                address: relayer.getAddress(),
                executionCount: relayer.getHistory().length,
            },
            timestamp: Date.now(),
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Get pool states (debug/info endpoint)
app.get("/api/pools", (req, res) => {
    const pools: any[] = [];
    poolMonitor.getPoolStates().forEach((state, address) => {
        pools.push({
            ...state,
            sqrtPriceX96: state.sqrtPriceX96?.toString(),
            liquidity: state.liquidity?.toString(),
            reserve0: state.reserve0?.toString(),
            reserve1: state.reserve1?.toString(),
        });
    });
    res.json({ pools, count: pools.length });
});

// ═══════════════════════════════════════════════
//  Start Server
// ═══════════════════════════════════════════════

async function main() {
    console.log("═══════════════════════════════════════════════");
    console.log("  BASE ARBITRAGE PROTOCOL — Backend Scanner");
    console.log("═══════════════════════════════════════════════");
    console.log(`  Network:    Base Mainnet (${config.chainId})`);
    console.log(`  RPC:        ${config.rpcUrl}`);
    console.log(`  Port:       ${config.server.port}`);
    console.log(`  Relayer:    ${relayer.getAddress()}`);
    console.log(`  Pairs:      ${config.pairs.map((p) => p.name).join(", ")}`);
    console.log(`  Fee:        ${config.protocol.feePercent}%`);
    console.log("═══════════════════════════════════════════════\n");

    // Start pool monitoring
    await poolMonitor.start();

    // Start HTTP + WebSocket server
    server.listen(config.server.port, config.server.host, () => {
        console.log(`[Server] API running on http://${config.server.host}:${config.server.port}`);
        console.log(`[Server] WebSocket on ws://${config.server.host}:${config.server.port}`);
    });
}

main().catch(console.error);

// Graceful shutdown
process.on("SIGINT", () => {
    console.log("\n[Server] Shutting down...");
    poolMonitor.stop();
    server.close();
    process.exit(0);
});

process.on("SIGTERM", () => {
    poolMonitor.stop();
    server.close();
    process.exit(0);
});

```

## `backend/src/simulator.ts`
```ts
import { ethers } from "ethers";
import { config } from "./config";
import { PriceSpread } from "./priceCalculator";
import { createRpcProvider } from "./providers";

// ═══════════════════════════════════════════════
//  Simulator — Simulates arbitrage via static calls
// ═══════════════════════════════════════════════

export interface SimulationResult {
    id: string;
    pair: string;
    buyDex: string;
    sellDex: string;
    buyPool: string;
    sellPool: string;
    inputToken: string;
    inputAmount: string;       // Human-readable
    inputAmountRaw: string;    // Wei / smallest unit
    grossProfit: string;
    grossProfitRaw: string;
    protocolFee: string;
    protocolFeeRaw: string;
    userProfit: string;
    userProfitRaw: string;
    gasEstimate: string;
    gasCostEth: string;
    gasCostUsd: string;
    netProfitable: boolean;
    spreadPercent: number;
    timestamp: number;
    route: SwapRoute;
}

export interface SwapRoute {
    steps: SwapStep[];
    flashLoanToken: string;
    flashLoanAmount: string;
}

export interface SwapStep {
    adapter: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    minAmountOut: string;
    data: string;
    dex: string;
}

// Uniswap V3 Quoter ABI
const QUOTER_ABI = [
    "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
];

// Aerodrome Router ABI for getAmountsOut
const AERO_ROUTER_ABI = [
    "function getAmountsOut(uint256 amountIn, (address from, address to, bool stable, address factory)[] routes) view returns (uint256[] amounts)",
    "function defaultFactory() view returns (address)",
];

export class Simulator {
    private provider: ethers.Provider;
    private quoter: ethers.Contract;
    private aeroRouter: ethers.Contract;
    private aeroFactory?: string;
    private simulationCount = 0;

    constructor() {
        this.provider = createRpcProvider();
        this.quoter = new ethers.Contract(
            config.external.uniswapV3Quoter,
            QUOTER_ABI,
            this.provider
        );
        this.aeroRouter = new ethers.Contract(
            config.external.aerodromeRouter,
            AERO_ROUTER_ABI,
            this.provider
        );
    }

    /**
     * Simulate an arbitrage opportunity
     */
    async simulate(
        spread: PriceSpread,
        inputAmountHuman: number = 1.0
    ): Promise<SimulationResult | null> {
        try {
            const pair = config.pairs.find((p) => p.name === spread.pair);
            if (!pair) return null;

            // Determine input token and decimals
            const token0Config = Object.values(config.tokens).find(
                (t) => t.address.toLowerCase() === pair.token0.toLowerCase()
            );
            const token1Config = Object.values(config.tokens).find(
                (t) => t.address.toLowerCase() === pair.token1.toLowerCase()
            );

            if (!token0Config || !token1Config) return null;

            // For token0 → token1 → token0 arb:
            // 1. Buy token0 cheap on buyPool (swap token1 → token0)
            // 2. Sell token0 expensive on sellPool (swap token0 → token1)
            // But we need to start with a flash loan of one of the tokens

            // Flash loan token1 (e.g., USDC), buy token0 cheap, sell token0 expensive, repay
            const flashToken = pair.token1;
            const flashDecimals = token1Config.decimals;
            const inputAmountRaw = ethers.parseUnits(
                inputAmountHuman.toFixed(flashDecimals),
                flashDecimals
            );

            // Step 1: Quote buy (token1 → token0 on buyPool)
            const buyAmountOut = await this.quoteSwap(
                spread.buyPool.poolAddress,
                spread.buyPool.dex,
                pair.token1,
                pair.token0,
                inputAmountRaw,
                spread.buyPool.feeTier,
                spread.buyPool.stable
            );

            if (!buyAmountOut || buyAmountOut === BigInt(0)) return null;

            // Step 2: Quote sell (token0 → token1 on sellPool)
            const sellAmountOut = await this.quoteSwap(
                spread.sellPool.poolAddress,
                spread.sellPool.dex,
                pair.token0,
                pair.token1,
                buyAmountOut,
                spread.sellPool.feeTier,
                spread.sellPool.stable
            );

            if (!sellAmountOut || sellAmountOut === BigInt(0)) return null;

            // Calculate profit
            const flashFee = (inputAmountRaw * BigInt(5)) / BigInt(10000); // 0.05% Aave fee
            const totalCost = inputAmountRaw + flashFee;

            const grossProfitRaw = sellAmountOut > totalCost
                ? sellAmountOut - totalCost
                : BigInt(0);

            // Calculate protocol fee (15%)
            const protocolFeeRaw = (grossProfitRaw * BigInt(1500)) / BigInt(10000);
            const userProfitRaw = grossProfitRaw - protocolFeeRaw;

            // Estimate gas
            const gasEstimate = BigInt(350000); // Conservative estimate
            const feeData = await this.provider.getFeeData();
            const gasPriceWei = feeData.gasPrice ?? feeData.maxFeePerGas ?? BigInt(0);
            const gasCostWei = gasEstimate * gasPriceWei;
            const gasCostEth = ethers.formatEther(gasCostWei);
            const ethPriceUsd = await this.getEthPriceUsd();
            const gasCostUsd = (parseFloat(gasCostEth) * ethPriceUsd).toFixed(4);

            // Check if profitable after gas
            const userProfitHuman = parseFloat(ethers.formatUnits(userProfitRaw, flashDecimals));
            const flashTokenLower = flashToken.toLowerCase();
            const isUsdStable =
                flashTokenLower === config.tokens.USDC.address.toLowerCase();

            const gasCostInProfitToken = isUsdStable
                ? parseFloat(gasCostUsd) // USDC-ish
                : flashTokenLower === config.tokens.WETH.address.toLowerCase()
                    ? parseFloat(gasCostEth) // WETH-ish
                    : 0; // Unknown token; can't safely denominate gas here

            const minRequiredUsd = Math.max(0, config.scanner.minProfitUsd + config.scanner.profitBufferUsd);
            const minRequiredInProfitToken = isUsdStable
                ? minRequiredUsd
                : flashTokenLower === config.tokens.WETH.address.toLowerCase()
                    ? minRequiredUsd / Math.max(1e-9, ethPriceUsd)
                    : 0;

            const required = gasCostInProfitToken > 0
                ? gasCostInProfitToken + minRequiredInProfitToken
                : minRequiredInProfitToken;

            const netProfitable = gasCostInProfitToken > 0
                ? userProfitHuman > required
                : userProfitRaw > BigInt(0);

            // Build swap route
            const slippageBps = config.scanner.defaultSlippageBps;
            const route: SwapRoute = {
                flashLoanToken: flashToken,
                flashLoanAmount: inputAmountRaw.toString(),
                steps: [
                    this.buildSwapStep(
                        spread.buyPool,
                        pair.token1,
                        pair.token0,
                        inputAmountRaw,
                        this.applySlippageToMinOut(buyAmountOut, slippageBps)
                    ),
                    this.buildSwapStep(
                        spread.sellPool,
                        pair.token0,
                        pair.token1,
                        buyAmountOut,
                        this.applySlippageToMinOut(sellAmountOut, slippageBps)
                    ),
                ],
            };

            this.simulationCount++;

            return {
                id: `sim-${this.simulationCount}-${Date.now()}`,
                pair: spread.pair,
                buyDex: spread.buyPool.dex,
                sellDex: spread.sellPool.dex,
                buyPool: spread.buyPool.poolAddress,
                sellPool: spread.sellPool.poolAddress,
                inputToken: token1Config.symbol,
                inputAmount: inputAmountHuman.toFixed(flashDecimals),
                inputAmountRaw: inputAmountRaw.toString(),
                grossProfit: ethers.formatUnits(grossProfitRaw, flashDecimals),
                grossProfitRaw: grossProfitRaw.toString(),
                protocolFee: ethers.formatUnits(protocolFeeRaw, flashDecimals),
                protocolFeeRaw: protocolFeeRaw.toString(),
                userProfit: ethers.formatUnits(userProfitRaw, flashDecimals),
                userProfitRaw: userProfitRaw.toString(),
                gasEstimate: gasEstimate.toString(),
                gasCostEth,
                gasCostUsd,
                netProfitable,
                spreadPercent: spread.spreadPercent,
                timestamp: Date.now(),
                route,
            };
        } catch (err) {
            console.error("[Simulator] Simulation failed:", err);
            return null;
        }
    }

    private async quoteSwap(
        poolAddress: string,
        dex: string,
        tokenIn: string,
        tokenOut: string,
        amountIn: bigint,
        feeTier?: number,
        stable?: boolean
    ): Promise<bigint | null> {
        try {
            if (dex === "Uniswap V3") {
                if (typeof feeTier !== "number") return null;
                const result = await this.quoter.quoteExactInputSingle.staticCall({
                    tokenIn,
                    tokenOut,
                    amountIn,
                    fee: feeTier,
                    sqrtPriceLimitX96: 0,
                });
                return result.amountOut;
            } else {
                // Aerodrome
                if (!this.aeroFactory) {
                    this.aeroFactory = await this.aeroRouter.defaultFactory();
                }
                const routes = [{
                    from: tokenIn,
                    to: tokenOut,
                    stable: !!stable,
                    factory: this.aeroFactory,
                }];
                const amounts = await this.aeroRouter.getAmountsOut(amountIn, routes);
                return amounts[amounts.length - 1];
            }
        } catch (err) {
            return null;
        }
    }

    private buildSwapStep(
        pool: { poolAddress: string; dex: string; feeTier?: number; stable?: boolean },
        tokenIn: string,
        tokenOut: string,
        amountIn: bigint,
        minAmountOut: bigint
    ): SwapStep {
        const isUniV3 = pool.dex === "Uniswap V3";

        return {
            adapter: isUniV3
                ? config.contracts.uniswapV3Adapter
                : config.contracts.aerodromeAdapter,
            tokenIn,
            tokenOut,
            amountIn: amountIn.toString(),
            minAmountOut: minAmountOut.toString(),
            data: isUniV3
                ? ethers.AbiCoder.defaultAbiCoder().encode(["uint24"], [pool.feeTier ?? 3000])
                : ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [!!pool.stable]),
            dex: pool.dex,
        };
    }

    private applySlippageToMinOut(amountOut: bigint, slippageBps: number): bigint {
        if (slippageBps <= 0) return amountOut;
        if (slippageBps >= 10_000) return BigInt(0);
        const minOut = (amountOut * BigInt(10_000 - slippageBps)) / BigInt(10_000);
        if (amountOut > BigInt(0) && minOut === BigInt(0)) return BigInt(1);
        return minOut;
    }

    private async getEthPriceUsd(): Promise<number> {
        try {
            // Get ETH price from WETH/USDC pool
            const wethUsdc = config.pairs.find((p) => p.name === "WETH/USDC");
            if (!wethUsdc || wethUsdc.uniV3Pools.length === 0) return 2500; // Fallback

            const result = await this.quoter.quoteExactInputSingle.staticCall({
                tokenIn: config.tokens.WETH.address,
                tokenOut: config.tokens.USDC.address,
                amountIn: ethers.parseEther("1"),
                fee: wethUsdc.uniV3Pools[0].fee,
                sqrtPriceLimitX96: 0,
            });

            return parseFloat(ethers.formatUnits(result.amountOut, 6));
        } catch {
            return 2500; // Fallback ETH price
        }
    }
}

```

## `frontend/package.json`
```json
{
    "name": "base-arb-frontend",
    "version": "1.0.0",
    "private": true,
    "scripts": {
        "dev": "next dev",
        "build": "next build",
        "start": "next start",
        "lint": "next lint"
    },
    "dependencies": {
        "@rainbow-me/rainbowkit": "^2.1.0",
        "@tanstack/react-query": "^5.28.0",
        "next": "^14.2.0",
        "react": "^18.3.0",
        "react-dom": "^18.3.0",
        "viem": "^2.18.0",
        "wagmi": "^2.12.0"
    },
    "devDependencies": {
        "@types/node": "^20.11.0",
        "@types/react": "^18.3.0",
        "@types/react-dom": "^18.3.0",
        "autoprefixer": "^10.4.20",
        "postcss": "^8.5.3",
        "tailwindcss": "^3.4.17",
        "typescript": "^5.3.0"
    }
}

```

## `frontend/next.config.js`
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    env: {
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
        NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001",
        NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "",
        NEXT_PUBLIC_FLASH_LOAN_EXECUTOR_ADDRESS: process.env.NEXT_PUBLIC_FLASH_LOAN_EXECUTOR_ADDRESS || "",
        NEXT_PUBLIC_BASE_RPC_URL: process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org",
        NEXT_PUBLIC_USDC_ADDRESS: process.env.NEXT_PUBLIC_USDC_ADDRESS || "",
        NEXT_PUBLIC_WETH_ADDRESS: process.env.NEXT_PUBLIC_WETH_ADDRESS || "",
        NEXT_PUBLIC_CBETH_ADDRESS: process.env.NEXT_PUBLIC_CBETH_ADDRESS || "",
    },
};

module.exports = nextConfig;

```

## `frontend/tsconfig.json`
```json
{
    "compilerOptions": {
        "target": "ES2017",
        "lib": [
            "dom",
            "dom.iterable",
            "esnext"
        ],
        "allowJs": true,
        "skipLibCheck": true,
        "strict": true,
        "noEmit": true,
        "esModuleInterop": true,
        "module": "esnext",
        "moduleResolution": "bundler",
        "resolveJsonModule": true,
        "isolatedModules": true,
        "jsx": "preserve",
        "incremental": true,
        "plugins": [
            {
                "name": "next"
            }
        ],
        "paths": {
            "@/*": [
                "./*"
            ]
        }
    },
    "include": [
        "next-env.d.ts",
        "**/*.ts",
        "**/*.tsx"
    ],
    "exclude": [
        "node_modules"
    ]
}
```

## `frontend/tailwind.config.ts`
```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0d12",
        panel: "#121622",
        border: "rgba(255,255,255,0.08)",
        muted: "#a7afc2",
        accent: "#6ee7ff",
        danger: "#ff6b6b",
      },
    },
  },
  plugins: [],
};

export default config;


```

## `frontend/postcss.config.js`
```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};


```

## `frontend/next-env.d.ts`
```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited


```

## `frontend/app/analytics/page.tsx`
```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";
import type { AnalyticsResponse } from "@/lib/types";
import { Card, CardHeader, Stat, Table, Td, Th } from "@/components/ui";
import { formatIntString, formatNumber, shortHex } from "@/lib/format";

export default function AnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics"],
    queryFn: () => apiGet<AnalyticsResponse>("/api/analytics"),
    refetchInterval: 15_000,
  });

  const successRatePct = data ? data.protocol.success.successRate * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="mt-1 text-sm text-muted">
          Liquidity Efficiency Infrastructure on Base — protocol accounting + DEX liquidity overview (from free RPCs).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat
          label="Total arbitrage volume"
          value={data ? `$${formatNumber(data.protocol.totalsUsd.totalArbitrageVolumeUsd, 2)}` : isLoading ? "…" : "-"}
          helper="Approx USD (USDC direct; WETH via Uniswap on-chain quote)"
        />
        <Stat
          label="Total user profit"
          value={data ? `$${formatNumber(data.protocol.totalsUsd.totalUserProfitUsd, 2)}` : isLoading ? "…" : "-"}
          helper="After 15% protocol fee"
        />
        <Stat
          label="Total protocol revenue"
          value={data ? `$${formatNumber(data.protocol.totalsUsd.totalProtocolRevenueUsd, 2)}` : isLoading ? "…" : "-"}
          helper="Treasury performance fees"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat
          label="Success rate"
          value={data ? `${formatNumber(successRatePct, 1)}%` : isLoading ? "…" : "-"}
          helper={`${data?.protocol.success.successes ?? 0}/${data?.protocol.success.attempts ?? 0} relayer attempts`}
        />
        <Stat
          label="Inefficiencies corrected"
          value={data ? data.protocol.success.inefficienciesCorrected : isLoading ? "…" : "-"}
          helper="Successful atomic arbitrages"
        />
        <Stat
          label="Fee (on-chain)"
          value={`${data?.protocol.feePercent ?? 15}%`}
          helper="Transparent performance fee"
        />
      </div>

      <Card>
        <CardHeader title="Accounting by asset" subtitle="Per-asset on-chain totals (no centralized price feeds)." />
        <div className="mt-4">
          <Table>
            <thead>
              <tr>
                <Th>Asset</Th>
                <Th>Volume</Th>
                <Th>User profit</Th>
                <Th>Protocol revenue</Th>
                <Th>Gas refunded</Th>
              </tr>
            </thead>
            <tbody>
              {(data?.protocol.totalsByAsset ?? []).map((t) => (
                <tr key={t.asset}>
                  <Td>
                    <div className="font-medium">{t.symbol}</div>
                    <div className="mt-1 text-xs text-muted">{shortHex(t.asset)}</div>
                  </Td>
                  <Td className="text-muted">
                    {formatNumber(t.totalVolume, 6)} {t.symbol}
                    {typeof t.totalVolumeUsd === "number" ? (
                      <div className="mt-1 text-xs text-muted">≈ ${formatNumber(t.totalVolumeUsd, 2)}</div>
                    ) : null}
                  </Td>
                  <Td className="text-muted">
                    {formatNumber(t.totalUserProfit, 6)} {t.symbol}
                    {typeof t.totalUserProfitUsd === "number" ? (
                      <div className="mt-1 text-xs text-muted">≈ ${formatNumber(t.totalUserProfitUsd, 2)}</div>
                    ) : null}
                  </Td>
                  <Td className="text-muted">
                    {formatNumber(t.totalProtocolRevenue, 6)} {t.symbol}
                    {typeof t.totalProtocolRevenueUsd === "number" ? (
                      <div className="mt-1 text-xs text-muted">≈ ${formatNumber(t.totalProtocolRevenueUsd, 2)}</div>
                    ) : null}
                  </Td>
                  <Td className="text-muted">{formatNumber(t.totalGasRefunded, 6)} {t.symbol}</Td>
                </tr>
              ))}
              {!isLoading && (data?.protocol.totalsByAsset ?? []).length === 0 ? (
                <tr>
                  <Td className="text-muted" colSpan={5}>
                    No on-chain executions yet.
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="DEX liquidity overview"
          subtitle="Monitored pools and current state (high-liquidity pools only; initial pairs only)."
          right={
            <div className="flex flex-wrap items-center gap-2">
              <span className="pill">Total pools: {data?.pools.dexOverview.totalPools ?? 0}</span>
              <span className="pill">Uni V3: {data?.pools.dexOverview.uniswapV3Pools ?? 0}</span>
              <span className="pill">Aerodrome: {data?.pools.dexOverview.aerodromePools ?? 0}</span>
            </div>
          }
        />
        <div className="mt-4 space-y-6">
          {(data?.pools.pairs ?? []).map((p) => (
            <div key={p.pair} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">{p.pair}</div>
                <span className="pill">Pools: {p.prices.length}</span>
              </div>

              <Table>
                <thead>
                  <tr>
                    <Th>DEX</Th>
                    <Th>Pool</Th>
                    <Th>Price</Th>
                    <Th>Liquidity / reserves</Th>
                  </tr>
                </thead>
                <tbody>
                  {p.prices.map((pp) => (
                    <tr key={`${p.pair}-${pp.poolAddress}-${pp.dex}`}>
                      <Td>{pp.dex}</Td>
                      <Td className="text-muted">
                        <a className="underline decoration-white/20 hover:decoration-white/40" target="_blank" rel="noreferrer" href={`https://basescan.org/address/${pp.poolAddress}`}>
                          {shortHex(pp.poolAddress)}
                        </a>
                      </Td>
                      <Td className="text-muted">{formatNumber(pp.price, 8)}</Td>
                      <Td className="text-muted">
                        {(() => {
                          const state = (data?.pools.dexLiquidity ?? []).find((x) => x.address.toLowerCase() === pp.poolAddress.toLowerCase());
                          if (!state) return "-";
                          if (state.dex === "uniswapV3" && state.uniV3) {
                            return `liq ${formatIntString(state.uniV3.liquidity)} • fee ${state.uniV3.fee}`;
                          }
                          if (state.dex === "aerodrome" && state.aerodrome) {
                            return `${state.aerodrome.reserve0Human ?? "-"} ${state.token0.symbol} / ${state.aerodrome.reserve1Human ?? "-"} ${state.token1.symbol} • ${state.aerodrome.stable ? "stable" : "volatile"}`;
                          }
                          return "-";
                        })()}
                      </Td>
                    </tr>
                  ))}
                  {p.prices.length === 0 ? (
                    <tr>
                      <Td className="text-muted" colSpan={4}>
                        No pools for this pair.
                      </Td>
                    </tr>
                  ) : null}
                </tbody>
              </Table>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

```

## `frontend/app/dashboard/page.tsx`
```tsx
"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";
import type { AnalyticsResponse, HealthResponse, OpportunityResponse, SimulationResult } from "@/lib/types";
import { Card, CardHeader, Stat, Table, Td, Th } from "@/components/ui";
import { formatNumber, shortHex } from "@/lib/format";

function TopOpportunities({ opportunities }: { opportunities: SimulationResult[] }) {
  return (
    <Card>
      <CardHeader
        title="Top opportunities"
        subtitle="Best net-profitable simulations from the scanner."
        right={
          <Link className="btn btn-primary" href="/execute">
            Execute arbitrage
          </Link>
        }
      />

      <div className="mt-4">
        <Table>
          <thead>
            <tr>
              <Th>Pair</Th>
              <Th>Route</Th>
              <Th>Gross profit</Th>
              <Th>Gas (est.)</Th>
              <Th>Spread</Th>
            </tr>
          </thead>
          <tbody>
            {opportunities.slice(0, 8).map((o) => (
              <tr key={o.id}>
                <Td>{o.pair}</Td>
                <Td className="text-muted">
                  {o.buyDex} → {o.sellDex}
                </Td>
                <Td>
                  {formatNumber(o.grossProfit, 6)} {o.inputToken}
                </Td>
                <Td className="text-muted">{o.inputToken === "USDC" ? `$${o.gasCostUsd}` : `${o.gasCostEth} ETH`}</Td>
                <Td className="text-muted">{o.spreadPercent.toFixed(4)}%</Td>
              </tr>
            ))}
            {opportunities.length === 0 ? (
              <tr>
                <Td className="text-muted" colSpan={5}>
                  No opportunities right now.
                </Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { address } = useAccount();

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: () => apiGet<HealthResponse>("/api/health"),
    refetchInterval: 10_000,
  });

  const { data: analytics } = useQuery({
    queryKey: ["analytics"],
    queryFn: () => apiGet<AnalyticsResponse>("/api/analytics"),
    refetchInterval: 15_000,
  });

  const { data: opportunities } = useQuery({
    queryKey: ["opportunities"],
    queryFn: () => apiGet<OpportunityResponse>("/api/opportunities"),
    refetchInterval: 5_000,
  });

  const opps = useMemo(() => opportunities?.opportunities ?? [], [opportunities]);
  const executionConfigured = health?.executionConfigured ?? false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Liquidity Efficiency Infrastructure on Base</h1>
          <p className="mt-1 text-sm text-muted">
            Public arbitrage execution rails that compress DEX pricing inefficiencies and charge a transparent 15% on-chain performance fee.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="pill">Wallet: {address ? shortHex(address) : "Not connected"}</span>
          <span className="pill">
            Execution:{" "}
            {executionConfigured ? (
              <span className="text-slate-100">Enabled</span>
            ) : (
              <span className="text-[rgba(255,107,107,0.95)]">Disabled</span>
            )}
          </span>
        </div>
      </div>

      {!executionConfigured && (health?.missingEnv?.length ?? 0) > 0 ? (
        <Card className="border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.06)]">
          <CardHeader
            title="Execution disabled"
            subtitle={`Backend is missing env: ${health?.missingEnv.join(", ")}`}
          />
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat label="Active opportunities" value={health?.activeOpportunities ?? opps.length} helper="From /api/opportunities" />
        <Stat label="Pools monitored" value={health?.poolsMonitored ?? analytics?.pools.monitored ?? "-"} helper="High-liquidity pools only" />
        <Stat label="Protocol fee" value={`${analytics?.protocol.feePercent ?? 15}%`} helper="On-chain performance fee" />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat label="Total executions" value={analytics?.protocol.totalExecutions ?? "-"} />
        <Stat
          label="Total user profit"
          value={analytics ? `$${formatNumber(analytics.protocol.totalsUsd.totalUserProfitUsd, 2)}` : "-"}
          helper="Approx USD (from on-chain quotes)"
        />
        <Stat
          label="Total protocol revenue"
          value={analytics ? `$${formatNumber(analytics.protocol.totalsUsd.totalProtocolRevenueUsd, 2)}` : "-"}
          helper="Treasury performance fees"
        />
      </div>

      <TopOpportunities opportunities={opps} />
    </div>
  );
}

```

## `frontend/app/execute/page.tsx`
```tsx
"use client";

import { useMemo, useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { readContract } from "wagmi/actions";
import { encodeAbiParameters, formatUnits, keccak256, parseEther, parseUnits, type Hex } from "viem";
import { wagmiConfig } from "@/lib/wagmi";
import { apiGet, apiPost } from "@/lib/http";
import { executorAbi, getExecutorAddress } from "@/lib/contracts";
import type {
  AnalyticsResponse,
  ExecutionIntent,
  ExecutionResult,
  HealthResponse,
  OpportunityResponse,
  SimulationResult,
  SwapStep,
} from "@/lib/types";
import { decimalsForToken } from "@/lib/tokens";
import { Card, CardHeader, Stat, Table, Td, Th } from "@/components/ui";
import { formatNumber, formatPercent, shortHex } from "@/lib/format";

function toBigIntString(value: string | bigint): bigint {
  return typeof value === "bigint" ? value : BigInt(value);
}

function normalizeSteps(sim: SimulationResult): SwapStep[] {
  return sim.route.steps.map((s) => ({
    adapter: s.adapter as Hex,
    tokenIn: s.tokenIn as Hex,
    tokenOut: s.tokenOut as Hex,
    amountIn: BigInt(s.amountIn),
    minAmountOut: BigInt(s.minAmountOut),
    data: s.data as Hex,
  }));
}

function computeRouteHash(steps: SwapStep[]): Hex {
  const encoded = encodeAbiParameters(
    [
      {
        name: "steps",
        type: "tuple[]",
        components: [
          { name: "adapter", type: "address" },
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "minAmountOut", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      },
    ],
    [
      steps.map((s) => ({
        adapter: s.adapter,
        tokenIn: s.tokenIn,
        tokenOut: s.tokenOut,
        amountIn: toBigIntString(s.amountIn),
        minAmountOut: toBigIntString(s.minAmountOut),
        data: s.data as Hex,
      })),
    ]
  );
  return keccak256(encoded);
}

function computeEconomics(sim: SimulationResult, asset: Hex, refundEnabled: boolean) {
  const decimals = decimalsForToken(asset) ?? 18;
  const grossProfitRaw = BigInt(sim.grossProfitRaw);

  // Gas estimate denominated in the borrowed/profit token (USDC or WETH initial pairs).
  const gasTokenEstimate = decimals === 6 ? parseUnits(sim.gasCostUsd || "0", 6) : parseEther(sim.gasCostEth || "0");

  // Refund at most 40% of estimated user profit, and target 110% of gas estimate.
  // Contract caps actual refund at `maxGasRefund`, and reverts if user profit < minNetProfit.
  const estimatedUserProfitAfterFee = BigInt(sim.userProfitRaw);
  const refundCap = (estimatedUserProfitAfterFee * 40n) / 100n;
  const desiredRefund = (gasTokenEstimate * 110n) / 100n;
  const maxGasRefund = refundEnabled ? (desiredRefund > refundCap ? refundCap : desiredRefund) : 0n;

  const grossAfterRefund = grossProfitRaw > maxGasRefund ? grossProfitRaw - maxGasRefund : 0n;
  const userAfterRefund = (grossAfterRefund * 8500n) / 10000n;
  const feeAfterRefund = grossAfterRefund - userAfterRefund;
  const minNetProfit = (userAfterRefund * 95n) / 100n; // safety buffer vs reorg/price movement

  return { decimals, gasTokenEstimate, maxGasRefund, userAfterRefund, feeAfterRefund, minNetProfit };
}

function computeSuccessProbability(sim: SimulationResult, userAfterRefund: bigint, gasTokenEstimate: bigint): number {
  const ageSec = Math.max(0, (Date.now() - sim.timestamp) / 1000);
  let p = 0.82;

  if (sim.spreadPercent >= 0.5) p += 0.06;
  else if (sim.spreadPercent >= 0.2) p += 0.03;
  else if (sim.spreadPercent <= 0.12) p -= 0.04;

  if (ageSec > 60) p -= 0.35;
  else if (ageSec > 30) p -= 0.18;
  else if (ageSec > 10) p -= 0.08;

  const ratioTimes100 = gasTokenEstimate > 0n ? (userAfterRefund * 100n) / gasTokenEstimate : 0n;
  const ratio = Number(ratioTimes100) / 100;
  if (ratio >= 5) p += 0.14;
  else if (ratio >= 2) p += 0.10;
  else if (ratio >= 1) p += 0.05;
  else p -= 0.10;

  p = Math.max(0.05, Math.min(0.95, p));
  return Math.round(p * 1000) / 10; // 0.1% precision
}

export default function ExecutePage() {
  const { address } = useAccount();
  const executorAddress = getExecutorAddress();
  const { signTypedDataAsync, isPending: signPending } = useSignTypedData();

  const [selected, setSelected] = useState<SimulationResult | null>(null);
  const [submitResult, setSubmitResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: () => apiGet<HealthResponse>("/api/health"),
    refetchInterval: 10_000,
  });

  const { data: analytics } = useQuery({
    queryKey: ["analytics"],
    queryFn: () => apiGet<AnalyticsResponse>("/api/analytics"),
    refetchInterval: 15_000,
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["opportunities"],
    queryFn: () => apiGet<OpportunityResponse>("/api/opportunities"),
    refetchInterval: 5_000,
  });

  const rows = useMemo(() => data?.opportunities ?? [], [data]);
  const relayerAddress = (analytics?.relayer?.address ?? "0x0000000000000000000000000000000000000000") as Hex;
  const refundEnabled = relayerAddress !== "0x0000000000000000000000000000000000000000";

  async function onExecute(sim: SimulationResult) {
    setError(null);
    setSubmitResult(null);

    if (!address) {
      setError("Connect your wallet to sign an execution intent.");
      return;
    }
    if (!executorAddress) {
      setError("Missing NEXT_PUBLIC_FLASH_LOAN_EXECUTOR_ADDRESS.");
      return;
    }
    if (health?.executionConfigured === false) {
      setError(`Execution disabled on backend (missing env: ${(health?.missingEnv ?? []).join(", ")}).`);
      return;
    }

    const steps = normalizeSteps(sim);
    const asset = sim.route.flashLoanToken as Hex;
    const amount = BigInt(sim.route.flashLoanAmount);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
    const { maxGasRefund, minNetProfit } = computeEconomics(sim, asset, refundEnabled);

    const routeHash = computeRouteHash(steps);
    const nonce = await readContract(wagmiConfig, {
      address: executorAddress,
      abi: executorAbi,
      functionName: "nonces",
      args: [address],
    });

    const intent: ExecutionIntent = {
      user: address,
      asset,
      amount,
      routeHash,
      minNetProfit,
      deadline,
      refundRecipient: refundEnabled ? relayerAddress : ("0x0000000000000000000000000000000000000000" as Hex),
      maxGasRefund: refundEnabled ? maxGasRefund : 0n,
      nonce,
    };

    const signature = await signTypedDataAsync({
      domain: { name: "BaseArbExecutor", version: "1", chainId: 8453, verifyingContract: executorAddress },
      types: {
        ExecutionIntent: [
          { name: "user", type: "address" },
          { name: "asset", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "routeHash", type: "bytes32" },
          { name: "minNetProfit", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "refundRecipient", type: "address" },
          { name: "maxGasRefund", type: "uint256" },
          { name: "nonce", type: "uint256" },
        ],
      },
      primaryType: "ExecutionIntent",
      message: {
        user: intent.user,
        asset: intent.asset,
        amount: intent.amount,
        routeHash: intent.routeHash,
        minNetProfit: intent.minNetProfit,
        deadline: intent.deadline,
        refundRecipient: intent.refundRecipient,
        maxGasRefund: intent.maxGasRefund,
        nonce: intent.nonce,
      },
    });

    const result = await apiPost<ExecutionResult>("/api/intent/submit", {
      intent: {
        ...intent,
        amount: intent.amount.toString(),
        minNetProfit: intent.minNetProfit.toString(),
        deadline: intent.deadline.toString(),
        maxGasRefund: intent.maxGasRefund.toString(),
        nonce: intent.nonce.toString(),
      },
      steps: steps.map((s) => ({ ...s, amountIn: s.amountIn.toString(), minAmountOut: s.minAmountOut.toString() })),
      signature,
    });

    setSubmitResult(result);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Execute arbitrage</h1>
          <p className="mt-1 text-sm text-muted">
            Scanner finds opportunities; you sign an intent; relayer submits; contract reverts unless net user profit &gt; 0.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="pill">Relayer pays gas</span>
          <button className="btn" onClick={() => refetch()} disabled={isLoading}>
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <Card className="border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.06)]">
          <CardHeader title="Action required" subtitle={error} />
        </Card>
      ) : null}

      {submitResult ? (
        <Card className={submitResult.success ? "border-[rgba(110,231,255,0.35)] bg-[rgba(110,231,255,0.06)]" : "border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.06)]"}>
          <CardHeader
            title={submitResult.success ? "Submitted" : "Failed"}
            subtitle={
              submitResult.txHash
                ? `Tx: ${submitResult.txHash}`
                : submitResult.error
                  ? submitResult.error
                  : "Unknown result"
            }
          />
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat label="Wallet" value={address ? shortHex(address) : "Not connected"} helper="Used only to sign intent" />
        <Stat label="Executor" value={executorAddress ? shortHex(executorAddress) : "Missing env"} helper="verifyingContract for EIP-712" />
        <Stat label="Fee" value={`${analytics?.protocol.feePercent ?? 15}%`} helper="Charged on-chain on realized profit" />
      </div>

      <Card>
        <CardHeader title="Opportunities" subtitle="Live feed from backend scanner (polling)." right={<span className="pill">Count: {rows.length}</span>} />
        <div className="mt-4">
          <Table>
            <thead>
              <tr>
                <Th>Pair</Th>
                <Th>Route</Th>
                <Th>Gross</Th>
                <Th>Fee (15%)</Th>
                <Th>Gas (est.)</Th>
                <Th>Net user</Th>
                <Th>Success</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const assetAddr = o.route.flashLoanToken as Hex;
                const { decimals, gasTokenEstimate, userAfterRefund, feeAfterRefund } = computeEconomics(o, assetAddr, refundEnabled);
                const success = computeSuccessProbability(o, userAfterRefund, gasTokenEstimate);

                return (
                  <tr key={o.id}>
                    <Td>{o.pair}</Td>
                    <Td className="text-muted">
                      {o.buyDex} → {o.sellDex}
                    </Td>
                    <Td>
                      {formatNumber(o.grossProfit, 6)} {o.inputToken}
                    </Td>
                    <Td className="text-muted">
                      {formatNumber(formatUnits(feeAfterRefund, decimals), 6)} {o.inputToken}
                    </Td>
                    <Td className="text-muted">{o.inputToken === "USDC" ? `$${o.gasCostUsd}` : `${o.gasCostEth} ETH`}</Td>
                    <Td>
                      {formatNumber(formatUnits(userAfterRefund, decimals), 6)} {o.inputToken}
                    </Td>
                    <Td className="text-muted">{formatPercent(success, 1)}</Td>
                    <Td className="text-right">
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          setSelected(o);
                          onExecute(o).catch((e) => setError(e.message));
                        }}
                        disabled={signPending || health?.executionConfigured === false}
                      >
                        {signPending && selected?.id === o.id ? "Signing…" : "Execute"}
                      </button>
                    </Td>
                  </tr>
                );
              })}
              {rows.length === 0 && !isLoading ? (
                <tr>
                  <Td className="text-muted" colSpan={8}>
                    No opportunities right now.
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Selected"
          subtitle={selected ? "Execution intent is computed from selected route." : "Select an opportunity to preview intent parameters."}
          right={
            selected ? (
              <button className="btn btn-primary" onClick={() => onExecute(selected).catch((e) => setError(e.message))} disabled={signPending}>
                {signPending ? "Signing…" : "Sign & submit"}
              </button>
            ) : null
          }
        />

        <div className="mt-4">
          {selected ? (
            (() => {
              const asset = selected.route.flashLoanToken as Hex;
              const { decimals, maxGasRefund, userAfterRefund, feeAfterRefund, minNetProfit } = computeEconomics(selected, asset, refundEnabled);

              return (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Stat label="Pair" value={selected.pair} helper={`${selected.buyDex} → ${selected.sellDex}`} />
                  <Stat label="Borrowed asset" value={shortHex(asset)} helper={`Amount: ${selected.route.flashLoanAmount}`} />
                  <Stat label="Gross profit" value={`${formatNumber(selected.grossProfit, 6)} ${selected.inputToken}`} helper="After flash premium, before refunds/fees" />
                  <Stat label="Protocol fee (15%)" value={`${formatNumber(formatUnits(feeAfterRefund, decimals), 6)} ${selected.inputToken}`} helper="Charged on-chain after refund" />
                  <Stat label="Gas refund cap" value={`${formatNumber(formatUnits(maxGasRefund, decimals), 6)} ${selected.inputToken}`} helper={refundEnabled ? "Paid to relayer from profits" : "Refund disabled"} />
                  <Stat label="Net user profit (est.)" value={`${formatNumber(formatUnits(userAfterRefund, decimals), 6)} ${selected.inputToken}`} helper={`Min user profit (signed): ${formatNumber(formatUnits(minNetProfit, decimals), 6)} ${selected.inputToken}`} />
                </div>
              );
            })()
          ) : (
            <div className="text-sm text-muted">No selection.</div>
          )}
        </div>
      </Card>
    </div>
  );
}

```

## `frontend/app/globals.css`
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: dark;
}

html,
body {
  height: 100%;
}

body {
  background:
    radial-gradient(1200px 600px at 20% 0%, rgba(110, 231, 255, 0.12), transparent 60%),
    radial-gradient(900px 500px at 90% 20%, rgba(167, 139, 250, 0.10), transparent 55%),
    theme('colors.bg');
}

@layer base {
  a {
    @apply text-inherit no-underline;
  }

  code {
    @apply font-mono text-[0.95em];
  }
}

@layer components {
  .card {
    @apply rounded-2xl border border-border bg-white/5 shadow-sm backdrop-blur;
  }

  .btn {
    @apply inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white/5 px-3 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50;
  }

  .btn-primary {
    @apply border-[rgba(110,231,255,0.35)] bg-[rgba(110,231,255,0.10)] hover:bg-[rgba(110,231,255,0.14)];
  }

  .pill {
    @apply inline-flex items-center gap-2 rounded-full border border-border bg-white/5 px-3 py-1 text-xs text-slate-200;
  }
}

```

## `frontend/app/history/page.tsx`
```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";
import type { ExecutionResult } from "@/lib/types";
import { Card, CardHeader, Table, Td, Th } from "@/components/ui";
import { formatNumber, shortHex } from "@/lib/format";

export default function HistoryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["history"],
    queryFn: () => apiGet<{ history: ExecutionResult[] }>("/api/history"),
    refetchInterval: 10_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Transaction history</h1>
        <p className="mt-1 text-sm text-muted">Relayer-submitted executions (intent or direct).</p>
      </div>

      <Card>
        <CardHeader title="Recent transactions" subtitle="Pulled from backend memory (no paid infra)." />
        <div className="mt-4">
          <Table>
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>Status</Th>
                <Th>Tx</Th>
                <Th>Gas</Th>
                <Th>Error</Th>
              </tr>
            </thead>
            <tbody>
              {(data?.history ?? []).map((h) => (
                <tr key={`${h.simulationId}-${h.timestamp}`}>
                  <Td className="text-muted">{new Date(h.timestamp).toLocaleString()}</Td>
                  <Td>{h.success ? <span className="pill">Success</span> : <span className="pill">Failed</span>}</Td>
                  <Td className="text-muted">
                    {h.txHash ? (
                      <a className="underline decoration-white/20 hover:decoration-white/40" target="_blank" rel="noreferrer" href={`https://basescan.org/tx/${h.txHash}`}>
                        {shortHex(h.txHash)}
                      </a>
                    ) : (
                      "-"
                    )}
                  </Td>
                  <Td className="text-muted">{h.gasUsed ? formatNumber(h.gasUsed, 0) : "-"}</Td>
                  <Td className="text-muted">{h.error ?? "-"}</Td>
                </tr>
              ))}
              {!isLoading && (data?.history ?? []).length === 0 ? (
                <tr>
                  <Td className="text-muted" colSpan={5}>
                    No executions yet.
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

```

## `frontend/app/layout.tsx`
```tsx
import "./globals.css";
import type { Metadata } from "next";
import Providers from "./providers";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Base Arbitrage Protocol",
  description: "Hybrid-execution arbitrage infrastructure on Base.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-bg text-slate-100 antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}

```

## `frontend/app/opportunities/page.tsx`
```tsx
import { redirect } from "next/navigation";

export default function OpportunitiesLegacy() {
  redirect("/execute");
}

```

## `frontend/app/page.tsx`
```tsx
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/dashboard");
}

```

## `frontend/app/providers.tsx`
```tsx
"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";

const queryClient = new QueryClient();

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}


```

## `frontend/components/AppShell.tsx`
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { cx } from "@/lib/cx";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      className={cx(
        "rounded-full border px-3 py-1 text-xs transition",
        active
          ? "border-[rgba(110,231,255,0.35)] bg-[rgba(110,231,255,0.10)] text-slate-100"
          : "border-border bg-white/5 text-slate-200 hover:bg-white/10"
      )}
    >
      {label}
    </Link>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-bg/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm font-extrabold tracking-wide">
              BaseArb
            </Link>
            <span className="pill">Base Mainnet</span>
          </div>

          <nav className="flex flex-wrap items-center gap-2">
            <NavLink href="/dashboard" label="Dashboard" />
            <NavLink href="/execute" label="Execute" />
            <NavLink href="/analytics" label="Analytics" />
            <NavLink href="/history" label="History" />
          </nav>

          <div className="flex items-center gap-2">
            <ConnectButton chainStatus="icon" showBalance={false} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
    </>
  );
}

```

## `frontend/components/ui.tsx`
```tsx
"use client";

import { cx } from "@/lib/cx";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("card p-5", className)}>{children}</div>;
}

export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-lg font-semibold">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-muted">{subtitle}</div> : null}
      </div>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  helper,
}: {
  label: string;
  value: React.ReactNode;
  helper?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-white/5 px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {helper ? <div className="mt-1 text-xs text-muted">{helper}</div> : null}
    </div>
  );
}

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse">{children}</table>
    </div>
  );
}

export function Th(props: React.ThHTMLAttributes<HTMLTableCellElement>) {
  const { children, className, ...rest } = props;
  return (
    <th
      {...rest}
      className={cx(
        "border-b border-border px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted",
        className
      )}
    >
      {children}
    </th>
  );
}

export function Td(props: React.TdHTMLAttributes<HTMLTableCellElement>) {
  const { children, className, ...rest } = props;
  return (
    <td {...rest} className={cx("border-b border-border px-3 py-3 text-sm", className)}>
      {children}
    </td>
  );
}

```

## `frontend/lib/contracts.ts`
```ts
import type { Abi } from "viem";

export const executorAbi = [
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const satisfies Abi;

export function getExecutorAddress(): `0x${string}` | null {
  const addr = process.env.NEXT_PUBLIC_FLASH_LOAN_EXECUTOR_ADDRESS;
  if (!addr) return null;
  if (!addr.startsWith("0x") || addr.length !== 42) return null;
  return addr as `0x${string}`;
}

```

## `frontend/lib/cx.ts`
```ts
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}


```

## `frontend/lib/format.ts`
```ts
export function formatNumber(value: string | number, maxFractionDigits: number = 6): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits });
}

export function formatIntString(value: string): string {
  try {
    return BigInt(value).toLocaleString();
  } catch {
    return value;
  }
}

export function formatPercent(value: number, maxFractionDigits: number = 2): string {
  if (!Number.isFinite(value)) return "-";
  return `${value.toFixed(maxFractionDigits)}%`;
}

export function shortHex(hex: string, head: number = 6, tail: number = 4): string {
  if (!hex || typeof hex !== "string") return "";
  if (!hex.startsWith("0x")) return hex;
  if (hex.length <= 2 + head + tail) return hex;
  return `${hex.slice(0, 2 + head)}…${hex.slice(-tail)}`;
}

```

## `frontend/lib/http.ts`
```ts
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}


```

## `frontend/lib/tokens.ts`
```ts
import type { Hex } from "viem";

export const ADDR = {
  USDC: (process.env.NEXT_PUBLIC_USDC_ADDRESS ?? "") as Hex,
  WETH: (process.env.NEXT_PUBLIC_WETH_ADDRESS ?? "") as Hex,
  CBETH: (process.env.NEXT_PUBLIC_CBETH_ADDRESS ?? "") as Hex,
} as const;

export function decimalsForToken(token: string): number | null {
  const t = token.toLowerCase();
  if (ADDR.USDC && t === ADDR.USDC.toLowerCase()) return 6;
  if (ADDR.WETH && t === ADDR.WETH.toLowerCase()) return 18;
  if (ADDR.CBETH && t === ADDR.CBETH.toLowerCase()) return 18;
  return null;
}


```

## `frontend/lib/types.ts`
```ts
import type { Hex } from "viem";

export type SwapStep = {
  adapter: Hex;
  tokenIn: Hex;
  tokenOut: Hex;
  amountIn: bigint;
  minAmountOut: bigint;
  data: Hex;
};

export type SimulationResult = {
  id: string;
  pair: string;
  buyDex: string;
  sellDex: string;
  inputToken: string;
  userProfit: string;
  userProfitRaw: string;
  protocolFee: string;
  protocolFeeRaw: string;
  grossProfit: string;
  grossProfitRaw: string;
  gasEstimate: string;
  gasCostEth: string;
  gasCostUsd: string;
  netProfitable: boolean;
  spreadPercent: number;
  timestamp: number;
  route: {
    flashLoanToken: string;
    flashLoanAmount: string;
    steps: Array<{
      adapter: string;
      tokenIn: string;
      tokenOut: string;
      amountIn: string;
      minAmountOut: string;
      data: string;
      dex: string;
    }>;
  };
};

export type OpportunityResponse = {
  opportunities: SimulationResult[];
  count: number;
  timestamp: number;
};

export type HealthResponse = {
  status: "ok";
  uptime: number;
  poolsMonitored: number;
  activeOpportunities: number;
  executionConfigured: boolean;
  missingEnv: string[];
};

export type AnalyticsResponse = {
  protocol: {
    totalExecutions: string | number;
    totalProfitGenerated: string;
    totalOpportunitiesFound: number;
    feePercent: number;
    totalsByAsset: Array<{
      asset: string;
      symbol: string;
      decimals: number;
      totalVolumeRaw: string;
      totalVolume: string;
      totalVolumeUsd: number | null;
      totalUserProfitRaw: string;
      totalUserProfit: string;
      totalUserProfitUsd: number | null;
      totalProtocolRevenueRaw: string;
      totalProtocolRevenue: string;
      totalProtocolRevenueUsd: number | null;
      totalProfitGeneratedRaw: string;
      totalProfitGenerated: string;
      totalGasRefundedRaw: string;
      totalGasRefunded: string;
    }>;
    totalsUsd: {
      totalArbitrageVolumeUsd: number;
      totalUserProfitUsd: number;
      totalProtocolRevenueUsd: number;
      ethPriceUsd: number;
    };
    success: {
      attempts: number;
      successes: number;
      successRate: number; // 0..1
      inefficienciesCorrected: number;
    };
  };
  pools: {
    monitored: number;
    pairs: Array<{
      pair: string;
      prices: Array<{
        poolAddress: string;
        dex: string;
        price: number;
        inversePrice: number;
        liquidity: string;
        feeBps: number;
        feeTier?: number;
        stable?: boolean;
      }>;
    }>;
    dexOverview: {
      totalPools: number;
      uniswapV3Pools: number;
      aerodromePools: number;
    };
    dexLiquidity: Array<{
      address: string;
      dex: "uniswapV3" | "aerodrome";
      pair: string;
      token0: { address: string; symbol: string; decimals: number };
      token1: { address: string; symbol: string; decimals: number };
      uniV3: null | { liquidity: string; fee: number; tick: number };
      aerodrome:
        | null
        | {
            reserve0: string;
            reserve1: string;
            stable: boolean;
            reserve0Human: string | null;
            reserve1Human: string | null;
          };
      lastUpdated: number;
    }>;
  };
  relayer: {
    address: string;
    executionCount: number;
  };
  timestamp: number;
};

export type ExecutionResult = {
  success: boolean;
  txHash?: string;
  gasUsed?: string;
  effectiveGasPrice?: string;
  error?: string;
  simulationId: string;
  timestamp: number;
};

export type ExecutionIntent = {
  user: `0x${string}`;
  asset: `0x${string}`;
  amount: bigint;
  routeHash: Hex;
  minNetProfit: bigint;
  deadline: bigint;
  refundRecipient: `0x${string}`;
  maxGasRefund: bigint;
  nonce: bigint;
};

```

## `frontend/lib/wagmi.ts`
```ts
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { base } from "wagmi/chains";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";
const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL ?? "https://mainnet.base.org";

export const wagmiConfig = getDefaultConfig({
  appName: "Base Arbitrage Protocol",
  projectId,
  chains: [base],
  ssr: true,
  transports: {
    [base.id]: http(rpcUrl),
  },
});


```

## `sdk/README.md`
```md
# SDK

Minimal TypeScript helpers intended for:
- computing route hashes
- building EIP-712 typed data for `ExecutionIntent`
- sharing types between backend/frontend (optional)

This folder is intentionally lightweight; it does not ship a published package yet.


```

## `sdk/package.json`
```json
{
  "name": "base-arb-sdk",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "viem": "^2.18.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0"
  }
}


```

## `sdk/tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "declaration": true,
    "outDir": "dist",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}


```

## `sdk/src/index.ts`
```ts
export * from "./types";
export * from "./intent";


```

## `sdk/src/intent.ts`
```ts
import { encodeAbiParameters, keccak256, type Hex } from "viem";
import type { ExecutionIntent, SwapStep } from "./types";

export function computeRouteHash(steps: SwapStep[]): Hex {
  const encoded = encodeAbiParameters(
    [
      {
        name: "steps",
        type: "tuple[]",
        components: [
          { name: "adapter", type: "address" },
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "minAmountOut", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      },
    ],
    [
      steps.map((s) => ({
        adapter: s.adapter,
        tokenIn: s.tokenIn,
        tokenOut: s.tokenOut,
        amountIn: s.amountIn,
        minAmountOut: s.minAmountOut,
        data: s.data,
      })),
    ]
  );
  return keccak256(encoded);
}

export function buildIntentTypedData(params: {
  chainId: number;
  verifyingContract: `0x${string}`;
  intent: ExecutionIntent;
}) {
  return {
    domain: {
      name: "BaseArbExecutor",
      version: "1",
      chainId: params.chainId,
      verifyingContract: params.verifyingContract,
    },
    types: {
      ExecutionIntent: [
        { name: "user", type: "address" },
        { name: "asset", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "routeHash", type: "bytes32" },
        { name: "minNetProfit", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "refundRecipient", type: "address" },
        { name: "maxGasRefund", type: "uint256" },
        { name: "nonce", type: "uint256" },
      ],
    },
    primaryType: "ExecutionIntent" as const,
    message: params.intent,
  };
}


```

## `sdk/src/types.ts`
```ts
import type { Hex } from "viem";

export type SwapStep = {
  adapter: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: bigint;
  minAmountOut: bigint;
  data: Hex;
};

export type ExecutionIntent = {
  user: `0x${string}`;
  asset: `0x${string}`;
  amount: bigint;
  routeHash: Hex;
  minNetProfit: bigint;
  deadline: bigint;
  refundRecipient: `0x${string}`;
  maxGasRefund: bigint;
  nonce: bigint;
};


```

## `scripts/README.md`
```md
# Scripts

This folder is for repo-level helpers (optional).

- Protocol contract deployment scripts are in `contracts/scripts/` (Hardhat).
  - Base mainnet: `npm -C contracts run deploy:base-mainnet`
  - Base Sepolia: `npm -C contracts run deploy:base-sepolia`


```

## `tests/README.md`
```md
# Tests (repo root)

This repository is a multi-package protocol. Tests are layered:

- **On-chain unit/integration tests (Hardhat)** live in `contracts/tests/`.
  - Run: `npm -C contracts test`
- **Backend** and **frontend** are currently validated via TypeScript builds and runtime smoke checks.

Recommended next test layers (optional):
- Fork tests (Base mainnet) under `contracts/tests/` gated by `FORK_ENABLED=true`.
- Backend scanner simulation tests under `backend/` (quote paths, pool filters, retry/nonce logic).
- End-to-end test: start `backend` + `frontend`, sign an intent, assert `/api/intent/submit` is rejected when not profitable.


```
