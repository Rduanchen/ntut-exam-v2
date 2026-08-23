---
description: "Task list for 002-comprehensive-backend-tests"
---

# Tasks: Comprehensive Backend Tests

**Input**: Design documents from `/specs/002-comprehensive-backend-tests/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/test-harness.md, quickstart.md

**Tests**: This feature *is* the tests. Every task below produces or relocates test code, except the
`src/` changes in Phase 2 which are the testability seam justified in plan.md Complexity Tracking.

**Organization**: Grouped by user story. Note the deliberate **phase reordering** below.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Web app layout, backend only. All paths are relative to the repository root.
Source: `backend/src/`, tests: `backend/test/`.

## Phase ordering decision (deviation from spec priority)

spec.md labels US3 (folder reorganization) as **P2**, below US1/US2. This task list sequences US3
**before** them anyway.

Reason: US1 and US2 create 30 new test files. Writing them into the current layout and then moving
them means touching every new file twice, and the migration is where the risky edits live — removing
5 per-file `new Sequelize(...)` instances (research R4) and splitting `test/crypto.test.ts`. Doing
that against 15 existing files is a bounded change; doing it against 45 is not.

US3 stays independently testable and independently valuable: after Phase 3 the suite is fully
reorganized and still green, with no new coverage yet.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies, folder skeleton, and test-environment configuration.

- [X] T001 Add `supertest` and `@types/supertest` as dev dependencies via `pnpm add -D supertest @types/supertest` in `backend/`
- [X] T002 Create the test folder skeleton `backend/test/{fixtures,helpers,unit/services,integration/controllers/admin,integration/controllers/user,integration/routes}` with a `.gitkeep` in each empty directory
- [X] T003 [P] Widen coverage reporting to `src/services/**` and `src/controllers/**` in `backend/vitest.config.ts`, replacing the two feature-001 entries; do not set a threshold (research R8)
- [X] T004 [P] Force `pool: { max: 1 }` when `process.env.DB_STORAGE === ':memory:'` in `backend/src/config/database.config.ts`, so the one-connection invariant for in-memory SQLite is explicit rather than incidental (research R4)

**Checkpoint**: `npm run test` still passes; no behaviour change yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The testability seam and the shared harness. **No user story can start until this is done.**

**⚠️ T005–T007 modify `src/`.** This is the single sanctioned source change (plan.md Complexity
Tracking). It must be behaviour-preserving.

- [X] T005 Create `backend/src/app.ts` exporting `createApp(): express.Express`, moving the middleware stack, routers, `/health`, `/`, and the global error handler out of `backend/src/index.ts:20-70` in **exactly** the order listed in contracts/test-harness.md C1; it must not connect the DB, probe Piston, create a server, or bind a port
- [X] T006 Rewire `backend/src/index.ts` to `import { createApp } from "./app"`, keeping only process lifecycle (`initDatabase`, `checkPistonServer`, `http.createServer`, socket namespace init, `listen`, LOAD_TEST_MODE banner)
- [X] T007 Verify the extraction is behaviour-preserving: `npm run build` succeeds, and `GET /` and `GET /health` return the responses documented in quickstart.md "Verifying the createApp() extraction"
- [X] T008 Harden `backend/test/setup.ts`: set `process.env.ADMIN_TOKEN` to a fixed test value, add a global `vi.mock` for `piston-judger`, and keep the existing `:memory:` forcing and socket.io mock (research R5, data-model.md §5)
- [X] T009 [P] Create `backend/test/fixtures/exam-config.fixture.ts` exporting `buildExamConfig(overrides?): ExamConfig` typed against `src/schemas/config.schema.ts`, returning a schema-valid config including `environmentVariables.startPassword` and a `specialRules` builder (data-model.md §1)
- [X] T010 [P] Create `backend/test/fixtures/identity.fixture.ts` exporting `buildUser()` and `buildDeviceKey()`, with `clientAesKey` hex-encoded to satisfy `DeviceService.getAesKey` (`src/services/device.service.ts:123`)
- [X] T011 [P] Create `backend/test/fixtures/exam-data.fixture.ts` exporting `buildSubmission()`, `buildScoreBoard()`, and `buildViolation()` per data-model.md §1
- [X] T012 [P] Create `backend/test/helpers/admin-request.ts` exporting `adminRequest(app, token?)` that attaches `x-admin-token` from `process.env.ADMIN_TOKEN` (contracts C3)
- [X] T013 Create `backend/test/helpers/test-client.ts` implementing the `TestClient` class in contracts C2, promoting the working end-to-end flow from `backend/test/crypto.test.ts:168-296` onto supertest, including the four tamper escape hatches
- [X] T014 Create `backend/test/integration/security-guard.test.ts` asserting `process.env.LOAD_TEST_MODE` is unset for the whole suite, so the crypto bypass can never be silently enabled (research R2)

**Checkpoint**: harness ready; `npm run test` green; no test coverage added yet.

---

## Phase 3: User Story 3 - Test Folder Reorganization (Priority: P2, sequenced first)

**Goal**: `backend/test/` cleanly separated into `unit/` and `integration/`, with one database strategy.

**Independent Test**: `ls backend/test/*.test.ts` returns nothing and `npm run test` passes with the
same test count as before the migration.

**Constraint**: this phase must not weaken a single assertion. The six feature-001 files encode
security acceptance criteria; they move verbatim apart from import paths.

- [X] T015 [P] [US3] Move `backend/test/anti-cheat.service.test.ts` to `backend/test/unit/services/anti-cheat.service.test.ts`, deleting its local `new Sequelize(...)` and relying on the singleton from `test/setup.ts` (research R4)
- [X] T016 [P] [US3] Move `backend/test/code-storage.service.test.ts` to `backend/test/unit/services/code-storage.service.test.ts`, deleting its local `new Sequelize(...)`
- [X] T017 [P] [US3] Move `backend/test/exam-config.service.test.ts` to `backend/test/unit/services/exam-config.service.test.ts`, deleting its local `new Sequelize(...)` and replacing the inline `validConfig` literal with `buildExamConfig()`
- [X] T018 [P] [US3] Move `backend/test/init.service.test.ts` to `backend/test/unit/services/init.service.test.ts`, deleting its local `new Sequelize(...)` and its hand-maintained model list, and replacing `validConfig` with `buildExamConfig()`
- [X] T019 [P] [US3] Move `backend/test/judger.service.test.ts` to `backend/test/unit/services/judger.service.test.ts`, deleting its local `new Sequelize(...)` and replacing the inline `mockConfig` with `buildExamConfig()`
- [X] T020 [P] [US3] Move `backend/test/system-settings.service.test.ts` to `backend/test/unit/services/system-settings.service.test.ts`, deleting its local `new Sequelize(...)`
- [X] T021 [P] [US3] Move `backend/test/user-action-log.service.test.ts` to `backend/test/unit/services/user-action-log.service.test.ts`, deleting its local `new Sequelize(...)`
- [X] T022 [US3] Split `backend/test/crypto.test.ts` part 1: extract the `CryptoService Primitives` block (lines 88-135) into `backend/test/unit/services/crypto.service.test.ts`
- [X] T023 [US3] Split `backend/test/crypto.test.ts` part 2: extract the `Replay Protection Service` block (lines 136-166) into `backend/test/unit/services/replay-protection.service.test.ts`
- [X] T024 [US3] Split `backend/test/crypto.test.ts` part 3: rewrite the `End-to-End Cryptographic API Scenarios` and `Admin security operations` blocks (lines 167-405) onto `createApp()` + `TestClient` in `backend/test/integration/controllers/user/user.controller.test.ts` and `backend/test/integration/controllers/admin/admin-security.controller.test.ts`, then delete `backend/test/crypto.test.ts` and its hand-built Express app and `fetch`-based client
- [X] T025 [P] [US3] Move the four judger tests `backend/test/unit/judger.{isolation,network,timeout,truncation}.test.ts` into `backend/test/unit/services/judger.service.test.ts` as named `describe` blocks preserving their original titles, so the feature-001 acceptance criteria stay traceable
- [X] T026 [P] [US3] Move the two auth tests `backend/test/unit/auth.{ip-fallback,rebinding}.test.ts` into `backend/test/unit/services/auth.service.test.ts` as named `describe` blocks preserving their original titles
- [X] T027 [US3] Move `backend/test/utils/mockFactories.ts` into `backend/test/fixtures/`, folding `createMockPayload`/`createMockSession`/`setupTestUser` into the typed builders from T009-T011 and updating all importers; remove the now-empty `backend/test/utils/`
- [X] T028 [US3] Verify FR-004/SC-004 per quickstart.md Step 5: `backend/test/` contains only `setup.ts`, `fixtures/`, `helpers/`, `unit/`, `integration/`, and the suite passes with no net loss of assertions

**Checkpoint**: reorganization complete, suite green, single database strategy, zero loose files.

---

## Phase 4: User Story 1 - Service Logic Unit Tests (Priority: P1)

**Goal**: All 16 `src/services/` files have a dedicated unit test covering core logic branches with
no real external calls (FR-001, SC-001).

**Independent Test**: quickstart.md Step 3 prints nothing.

**Note**: T029-T035 are the seven services with no test today. T036-T038 deepen existing coverage
where the migration revealed gaps.

- [X] T029 [P] [US1] Create `backend/test/unit/services/binding.service.test.ts` covering the 6 exported methods of `src/services/binding.service.ts`, including the TA-approved rebinding path and IP clearing on unbind (data-model.md §3 device binding lifecycle)
- [X] T030 [P] [US1] Create `backend/test/unit/services/device.service.test.ts` covering `src/services/device.service.ts`, including `getAesKey` throwing 401 for an unregistered UUID (line 121) and `deleteKey` throwing 404 (line 132)
- [X] T031 [P] [US1] Create `backend/test/unit/services/exam-config-parser.service.test.ts` covering the 3 methods of `src/services/exam-config-parser.service.ts`, driven by `buildExamConfig()` variants
- [X] T032 [P] [US1] Create `backend/test/unit/services/exam-state.service.test.ts` covering `ExamStateService` and the `ExamState` enum transitions in `src/services/exam-state.service.ts`, including the socket-notification failure path that currently only warns
- [X] T033 [P] [US1] Create `backend/test/unit/services/exam.service.test.ts` covering `ExamService` in `src/services/exam.service.ts`
- [X] T034 [P] [US1] Create `backend/test/unit/services/message.service.test.ts` covering the five exported functions of `src/services/message.service.ts` (note: this module exports `const` arrow functions, not a static class) including `getLatestMessageVersion` and `getMessagesAfterId`
- [X] T035 [P] [US1] Create `backend/test/unit/services/replay-protection.service.test.ts` — if T023 produced this file, extend it to cover nonce TTL eviction and the timestamp-drift boundary rather than duplicating it
- [X] T036 [P] [US1] Extend `backend/test/unit/services/anti-cheat.service.test.ts` to cover the `checkUserAction` IP-fallback branch (`src/services/anti-cheat.service.ts:15-20`) and to assert that a repeat violation does **not** fire a second socket alert (lines 87-101, data-model.md §3)
- [X] T037 [P] [US1] Extend `backend/test/unit/services/system-settings.service.test.ts` to cover `PROTECTED_SETTINGS_KEYS` for every protected key, not just `[0]`
- [X] T038 [P] [US1] Extend `backend/test/unit/services/code-storage.service.test.ts` to cover all 6 methods of `src/services/code-storage.service.ts`
- [X] T039 [US1] Verify FR-001/SC-001 per quickstart.md Step 3 and record the measured coverage of `src/services/**` from `npx vitest run --coverage`

**Checkpoint**: 16/16 services have dedicated unit tests; suite green.

---

## Phase 5: User Story 2 - Controller Integration Tests (Priority: P1)

**Goal**: All 13 controllers exercised over real HTTP via `supertest` against `createApp()`, covering
46 endpoints with at least one success and one failure case each (FR-002, SC-002, spec.md:38-39).

**Independent Test**: quickstart.md Step 4 prints nothing and reports 13 files using `supertest`.

**Auth pattern**: admin controllers use `adminRequest()` (T012); user controllers use `TestClient`
(T013) speaking the real AES-GCM protocol — never `LOAD_TEST_MODE=pure` (research R2).

- [X] T040 [P] [US2] Create `backend/test/integration/controllers/admin/admin-anticheat.controller.test.ts` covering 3 endpoints in `src/routes/admin/admin-anticheat.route.ts` (`GET /logs`, `GET /logs/:studentID`, `PUT /status`) plus the 401 no-token case
- [X] T041 [P] [US2] Create `backend/test/integration/controllers/admin/exam-config.controller.test.ts` covering **6** endpoints — the 3 in `src/routes/admin/admin-config.route.ts` plus the 3 in `admin-init.route.ts`, which dispatch to `ExamConfigController.initializeDatabase`/`.resetDatabase`/`.getSystemInitStatus` (contracts C4)
- [X] T042 [P] [US2] Create `backend/test/integration/controllers/admin/admin-exam-state.controller.test.ts` covering 2 endpoints in `src/routes/admin/admin-exam-state.route.ts`
- [X] T043 [P] [US2] Create `backend/test/integration/controllers/admin/admin-judger.controller.test.ts` covering `POST /judge/:testId`, asserting the Piston mock is used and no real sandbox call is made
- [X] T044 [P] [US2] Create `backend/test/integration/controllers/admin/admin-log.controller.test.ts` covering 2 endpoints in `src/routes/admin/admin-log.route.ts`
- [X] T045 [P] [US2] Create `backend/test/integration/controllers/admin/admin-message.controller.test.ts` covering the 1 endpoint in `src/routes/admin/admin-message.route.ts`
- [X] T046 [P] [US2] Create `backend/test/integration/controllers/admin/score.controller.test.ts` covering the 1 endpoint in `src/routes/admin/admin-score.route.ts`
- [X] T047 [P] [US2] Extend `backend/test/integration/controllers/admin/admin-security.controller.test.ts` (created in T024) to cover all 3 endpoints in `src/routes/admin/admin-security.route.ts` including the wrong-token 401 branch
- [X] T048 [P] [US2] Create `backend/test/integration/controllers/admin/admin-submission.controller.test.ts` covering 6 endpoints in `src/routes/admin/admin-submission.route.ts` including `GET /:testId/export`
- [X] T049 [P] [US2] Create `backend/test/integration/controllers/admin/connection.controller.test.ts` covering **9** endpoints in `src/routes/admin/connection.route.ts` — settings, device listing, unbind, delete, and the TA approve/reject/unblock request flow (largest single file)
- [X] T050 [P] [US2] Extend `backend/test/integration/controllers/user/user.controller.test.ts` (created in T024) to cover all 7 endpoints across `src/routes/user/user-auth.route.ts` (4) and `user-exam.route.ts` (3)
- [X] T051 [P] [US2] Create `backend/test/integration/controllers/user/user-log.controller.test.ts` covering `POST /user/log`, asserting the `actionType: 'alert'` + `details.type` contract reaches `AntiCheatService` (`src/controllers/user/user-log.controller.ts:29`) and that the 401 missing-testId and 400 missing-actionType branches return correctly
- [X] T052 [P] [US2] Create `backend/test/integration/controllers/user/user-submission.controller.test.ts` covering 3 endpoints in `src/routes/user/user-submission.route.ts`
- [X] T053 [P] [US2] Create `backend/test/integration/routes/admin-system-info.test.ts` covering `GET /admin/system-info`, whose handler is defined inline in `src/routes/admin/admin-system-info.route.ts:9` with no controller file; assert it reports no warnings when `LOAD_TEST_MODE` is unset and the correct warning for each of `pure`/`simulation`/`true` (contracts C4)
- [X] T054 [US2] Create `backend/test/integration/error-handling.test.ts` asserting the **real** global error handler from `createApp()` returns `{ error, code? }` with the status from `err.statusCode`, covering a 400, a 401, a 404, and a 500 (spec.md:39, contracts C1)
- [X] T055 [US2] Create `backend/test/integration/crypto-negative.test.ts` using the `TestClient` tamper hatches to assert 400 on missing crypto fields, 401 on a tampered GCM tag, 401 on a replayed nonce, 401 on timestamp drift, and 401 on a session token bound to a different `device_uuid` (`src/middlewares/user-crypto.middleware.ts:32,51-56`)
- [X] T056 [US2] Create `backend/test/unit/middlewares/admin.middleware.test.ts` unit-testing `requirePermission` directly for the 403 branch, which is unreachable over HTTP because `verifyAdminToken` always injects `SUPER_ADMIN` (contracts C3)
- [X] T057 [US2] Verify FR-002/SC-002 per quickstart.md Step 4 and confirm all 46 endpoints appear in at least one test

**Checkpoint**: all controllers and all 46 endpoints covered; suite green.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T058 Verify FR-003 per quickstart.md Step 6: delete `backend/database.sqlite`, run the suite, confirm no database file is recreated
- [X] T059 Verify SC-003 by running `npm run test` in `backend/` and checking the reported Duration is under 20 seconds; investigate any single file over ~2s for a real timer or unmocked network call
- [X] T060 Verify the anti-drift gate per quickstart.md Step 2: break a fixture's type, confirm `npm run test` exits non-zero with a TS error rather than a runtime failure, then restore
- [X] T061 Verify the security guard per quickstart.md Step 7: no test sets `LOAD_TEST_MODE` except the guard test itself
- [X] T062 [P] Run `npm run lint` in `backend/` (which lints `backend/src` and `backend/test`) and confirm the changed test files introduce no new errors beyond the repository's pre-existing baseline
- [X] T063 [P] Record the measured coverage floor for `src/services/**` and `src/controllers/**` in `specs/002-comprehensive-backend-tests/research.md` under R8, as input for the follow-up that enforces a threshold
- [X] T064 Update `knowledge/vision.md` "測試覆蓋率對齊" milestone status and add the fixture-drift lesson to `knowledge/experience.md` (the 2026-08-23 finding: test code excluded from `tsconfig.json` let fixtures rot for two months undetected)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Phase 1 — **BLOCKS everything else**
  - T005 → T006 → T007 (strictly sequential; same files)
  - T013 depends on T005 (needs `createApp()`) and on T001 (needs supertest)
- **US3 (Phase 3)**: depends on Phase 2. Sequenced before US1/US2 by the decision recorded above
  - T015-T021 are mutually parallel (distinct files)
  - T022, T023, T024 all edit/delete `test/crypto.test.ts` — **strictly sequential**
  - T024 depends on T013 (`TestClient`)
  - T027 depends on T009-T011 and on T015-T026 (all importers must be updated first)
- **US1 (Phase 4)**: depends on Phase 2; independent of US2
- **US2 (Phase 5)**: depends on Phase 2 and on T024 (which creates two of its files)
- **Polish (Phase 6)**: depends on US1 and US2

### User Story Dependencies

- **US3 (P2)**: depends only on Foundational. Delivers value alone (clean tree, one DB strategy)
- **US1 (P1)**: depends on Foundational. Runs in parallel with US2
- **US2 (P1)**: depends on Foundational + T024. Runs in parallel with US1

### Parallel Opportunities

- Phase 1: T003, T004
- Phase 2: T009, T010, T011, T012 (four independent files)
- Phase 3: T015-T021 (seven migrations), and T025/T026
- Phase 4: T029-T038 (ten independent files) — the widest parallel window
- Phase 5: T040-T053 (fourteen independent files)
- Cross-story: all of Phase 4 and Phase 5 can run concurrently once T024 is done

---

## Implementation Strategy

### MVP scope

**Phase 1 + Phase 2 + Phase 3 (US3)**. This delivers a reorganized, type-checked, single-strategy
test suite with a working supertest harness and a real-crypto test client — and it is where the
structural risk lives. Everything after it is repetitive file-by-file work that parallelizes cleanly.

### Incremental delivery

1. Phase 1 + 2 → harness ready, suite green, `createApp()` seam in place
2. Phase 3 (US3) → **STOP AND VALIDATE**: `ls backend/test/` clean, same assertion count, green
3. Phase 4 (US1) → 16/16 services covered
4. Phase 5 (US2) → 13/13 controllers and 46/46 endpoints covered
5. Phase 6 → verification sweep and knowledge base update

### Risk notes

- **T005-T007 is the only source change.** If `/health` or the error-response shape changes, the
  extraction is wrong — revert rather than adjusting the tests to match.
- **T024 is the highest-risk single task**: it deletes a 406-line file that currently contains the
  only end-to-end crypto coverage in the repository. Do not delete `test/crypto.test.ts` until its
  replacements pass.
- **Branch first.** Constitution III prohibits direct commits to `main`; this work is currently
  planned on `main` (plan.md Complexity Tracking).
