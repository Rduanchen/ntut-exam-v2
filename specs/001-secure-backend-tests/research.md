# Phase 0: Research & Clarifications

## Decisions

- **Decision:** Use Vitest (`vi.mock`) for all test isolations.
  - **Rationale:** Vitest is already installed in the backend (`vitest` 4.1.8 in `package.json`) and is the chosen testing framework for the project. `vi.mock` natively supports ESM and commonjs mocking, which is essential to mock `fs` and `socket.io` to ensure test data isolation and prevent actual side-effects.
  - **Alternatives considered:** Jest (heavy, not installed), Mocha (outdated, lacks built-in mocking like Vitest).

- **Decision:** In-memory or isolated Temp SQLite for database mocking.
  - **Rationale:** Prevents tests from corrupting the real development or production databases. Ensures tests run concurrently without race conditions over database state.
  - **Alternatives considered:** Transactional rollbacks (can be flaky if not handled properly across concurrent async tests).

*(No `NEEDS CLARIFICATION` remained in the Technical Context.)*
