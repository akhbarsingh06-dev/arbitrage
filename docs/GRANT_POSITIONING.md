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

