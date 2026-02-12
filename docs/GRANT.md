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

