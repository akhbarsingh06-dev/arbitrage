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
