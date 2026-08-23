# Implementation Plan: Comprehensive Backend Tests

**Branch**: `002-comprehensive-backend-tests` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-comprehensive-backend-tests/spec.md`

## Summary

Bring the backend test suite from 9 ad-hoc service tests to full coverage of all 16 services
(unit) and all 13 controllers (integration, via `supertest`), and reorganize `backend/test/`
into `unit/` + `integration/` + `fixtures/` + `helpers/`.

The enabling technical move is a **testability seam**: `src/index.ts` currently builds the
Express app and calls `startServer()` at module load, so it cannot be imported by a test.
We extract `createApp()` into `src/app.ts`. This is not speculative — `test/crypto.test.ts`
already hand-duplicates the app assembly (its own `express()`, its own router mounting, its
own error handler) precisely because no seam exists. The seam removes that duplication and
lets integration tests exercise the *real* global error handler, which spec.md:39 requires.

The second key decision is that user-facing integration tests speak the **real AES-GCM wire
protocol** rather than switching on the `LOAD_TEST_MODE=pure` bypass. `test/crypto.test.ts`
already contains a working end-to-end client flow (key exchange → register-device → login →
session token → encrypted request) that we promote into a reusable `TestClient` helper.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js (CommonJS, target ES2022), `strict: true`

**Primary Dependencies**: Express 4.19, Sequelize 6.37 + sequelize-typescript 2.1, Zod 3.23,
socket.io 4.7, piston-judger 0.1.1, Winston. Test: Vitest 4.1.8, **supertest (to be added)**

**Storage**: SQLite. Production writes a file; tests force `DB_STORAGE=:memory:` via
`test/setup.ts` before any import

**Testing**: Vitest 4.1.8 (`globals: true`, node environment), `test/setup.ts` as global setup.
Type checking of test code is enforced by `tsconfig.test.json`, wired into `npm run test`

**Target Platform**: Linux/macOS server (single host, deployed per exam venue)

**Project Type**: Web application — `backend/` (Express API) + `frontend/` (Vue admin dashboard).
This feature touches `backend/` only

**Performance Goals**: Whole suite < 20s (SC-003). Current baseline: 53 tests / 14 files in ~0.9s,
so the budget is ample; supertest adds in-process HTTP with no real sockets

**Constraints**: No real network calls (Piston and socket.io must be mocked); no test may write
a database file; tests must not depend on execution order

**Scale/Scope**: 16 services, 13 controllers across 18 route files, **46 HTTP endpoints**.
Existing: 9 service test files + 6 unit tests from feature 001

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Type Safety**: `tsconfig.test.json` now includes `test/**/*` under `strict: true` and gates
      `npm run test`. Previously `tsconfig.json` had `"include": ["src/**/*"]` only, so test code was
      never type-checked — the direct cause of the fixture drift found on 2026-08-23. Fixture builders
      are typed against `ExamConfig` from `src/schemas/config.schema.ts`, so a schema change breaks
      compilation rather than silently rotting the tests.
- [x] **Async & Concurrency**: Vitest runs test *files* in parallel worker processes; each worker gets
      its own module registry and therefore its own `:memory:` database, so parallelism is safe by
      construction. Within a file, tests run serially against a per-test `sync({ force: true })`.
      See research R4 for the connection-pool caveat and its mitigation.
- [x] **Security & Stability**: The `LOAD_TEST_MODE=pure` crypto bypass is explicitly rejected as a
      test harness (research R2). A dedicated guard test asserts the bypass is inactive by default,
      so the suite cannot silently ship with authentication disabled.
- [x] **Low Coupling**: Extracting `createApp()` from `src/index.ts` separates app composition from
      process lifecycle (listen, DB connect, Piston probe, socket bootstrap) — a coupling reduction
      that also removes the duplicated assembly in `test/crypto.test.ts`.
- [x] **Testability**: Every service is a static class with injectable-by-mock dependencies; the seam
      makes every endpoint reachable in-process. 100% coverage remains aspirational (see Complexity
      Tracking) but nothing in the design blocks it.

**Deviation — Principle III (Strict Branching Strategy)**: this work is being planned on `main`.
The constitution states direct commits to `main` are *strictly prohibited* and that work MUST occur
on `feat/XXX`. Recorded here rather than silently ignored — see Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/002-comprehensive-backend-tests/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── test-harness.md
├── checklists/
│   └── requirements.md
└── spec.md
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── app.ts                  # NEW — createApp(): assembles middleware, routers, error handler
│   ├── index.ts                # CHANGED — imports createApp(), keeps listen/DB/Piston/socket bootstrap
│   ├── config/database.config.ts
│   ├── controllers/            # 13 files (admin/ 10, user/ 3) — 46 endpoints
│   ├── middlewares/
│   ├── models/                 # 10 models
│   ├── routes/                 # 18 route files
│   ├── schemas/
│   └── services/               # 16 services — unit-test targets
├── test/
│   ├── setup.ts                # global: :memory: DB, socket + piston mocks, per-test reset
│   ├── fixtures/               # typed data builders (ExamConfig, User, Device, Submission)
│   ├── helpers/                # TestClient (real AES-GCM wire protocol), adminRequest()
│   ├── unit/
│   │   └── services/           # one file per service (16)
│   └── integration/
│       └── controllers/        # one file per controller (13), admin/ + user/
├── tsconfig.json               # src only (build)
├── tsconfig.test.json          # src + test (type-check gate)
└── vitest.config.ts            # coverage include widened to src/services + src/controllers
```

**Structure Decision**: Web application layout, backend-only. Test tree mirrors the source tree
(`test/unit/services/<name>.service.test.ts` ↔ `src/services/<name>.service.ts`) so that a missing
test is visible as a missing file rather than requiring a coverage report to detect — this is what
makes SC-001 and SC-002 checkable by `ls`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Modifying `src/` (extract `src/app.ts`) in a test-only feature | FR-002 requires supertest against the real controllers *and* the real global error handler (spec.md:39). `src/index.ts` calls `startServer()` at import time — connecting the file DB, probing Piston, binding a port — so it can never be imported by a test | Re-assembling a throwaway Express app inside each test (what `test/crypto.test.ts` does today) tests a *different* app than production: a different error handler, no `cors`, no body-size limits. It would let a routing or error-handling regression pass unnoticed, defeating FR-002's purpose |
| Working on `main` instead of `feat/002-comprehensive-backend-tests` | Not needed — this is an oversight, not a requirement | Constitution III is unambiguous. **Recommended action: branch before implementation begins.** Left as a decision for the maintainer rather than silently branching |
| 100% line coverage (Constitution VI) not achievable within this feature | This feature covers `src/services/` and `src/controllers/`. `src/sockets/`, `src/utils/`, `src/middlewares/`, and `src/models/` are out of scope per spec.md:65-69 | Widening scope to the whole `src/` tree would make the feature unbounded. Coverage thresholds are therefore set on the two in-scope directories only; whole-tree coverage stays an open roadmap item |
