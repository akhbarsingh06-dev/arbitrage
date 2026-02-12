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

