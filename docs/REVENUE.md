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

