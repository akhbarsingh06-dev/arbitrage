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
