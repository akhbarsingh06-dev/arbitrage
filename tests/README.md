# Tests (repo root)

This repository is a multi-package protocol. Tests are layered:

- **On-chain unit/integration tests (Hardhat)** live in `contracts/tests/`.
  - Run: `npm -C contracts test`
- **Backend** and **frontend** are currently validated via TypeScript builds and runtime smoke checks.

Recommended next test layers (optional):
- Fork tests (Base mainnet) under `contracts/tests/` gated by `FORK_ENABLED=true`.
- Backend scanner simulation tests under `backend/` (quote paths, pool filters, retry/nonce logic).
- End-to-end test: start `backend` + `frontend`, sign an intent, assert `/api/intent/submit` is rejected when not profitable.

