---
description: "Task list for 004-judge-backend-migration"
---

# Tasks: Judge Backend Migration

**Input**: Design documents from `/specs/004-judge-backend-migration/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/admin-judging-api.md ✅, quickstart.md ✅

**Tests**: MANDATORY (Constitution VI; spec NFR-TEST).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to

## Path Conventions

Paths are relative to the repository root `ntut-exam-v2/host/`. Backend sources live under `backend/src/`, tests under `backend/test/`, and the frontend under `frontend/src/`.

---

## Phase 1: Setup

- [X] T001 Create branch `feat/004-judge-backend-migration` from `develop` (Constitution III)
- [X] T002 Upgrade `piston-judger` to `^0.2.0` in `backend/package.json`
- [X] T003 Upgrade `p-limit` from `3.1.0` to `^7.3.1` in `backend/package.json` — v7 exposes a settable `concurrency` that also drains the queue when raised (research D1)
- [X] T004 Declare `engines: { "node": ">=20.19.0" }` in `backend/package.json` — `p-limit@7` is ESM-only and requires Node's `require(ESM)` support. **Verified boundary: works on 20.20.2, fails on 20.18.0 with `ERR_REQUIRE_ESM`**
- [X] T005 Pin `Dockerfile` to an explicit Node version satisfying `>=20.19.0` instead of the floating `node:20-alpine` tag — a rebuild against an older 20.x would fail at startup with an error that looks nothing like its cause
- [X] T006 Record the baseline in `backend/`: `npm install && npm test`, capturing the current pass count so later failures are attributable to this feature

**Checkpoint**: Dependencies current, runtime constraint declared and pinned, baseline recorded.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: no user story work can begin until this phase completes. Every story either uses the limiter, the settings, or the migrated test doubles.

- [X] T007 Define a closed `SubmissionStatus` union (`Pending` | `Judging` | `Graded` | `SystemError`) in `backend/src/types/` and apply it to `backend/src/models/submission.model.ts`, replacing the unconstrained string (research S2, data-model § SubmissionStatus)
- [X] T008 Replace every `"Error"` write with `"SystemError"` across `backend/src/`, and add a startup normalisation for any historical `"Error"` rows — the old value already meant "the system could not judge this", it was merely named as though the student owned it (research D3)
- [X] T009 [P] Create `backend/src/config/judge.config.ts` resolving `compileTimeout`, `compileMemoryLimit`, `maxConcurrentJobs` and `maxSystemRetries` in the order stored-config → environment (first-run seed only) → documented default, reporting each effective value **with its origin** (`config` | `env` | `default` | `clamped`) per data-model § EffectiveSetting
- [X] T010 [P] Extend `judgerSettings` in `backend/src/schemas/config.schema.ts` with the four new fields, **each optional with a default** — this is what makes an absent field fall back to the default instead of retaining the previous value, with no merge logic to get wrong (FR-015)
- [X] T011 [P] Delete the unused `CPU_TIME_LIMIT_MS`, `WALL_TIME_LIMIT_MS` and `MEMORY_LIMIT_KB` from `backend/src/constants/piston.config.ts`. **Keep the module** — it still provides `CONFIG.languages` to the config schema and the startup probe (research S5, FR-021)
- [X] T012 Create `backend/src/services/judge-limiter.ts` owning a module-level `p-limit` singleton, the ceiling clamp, and a setter that applies a new ceiling to already-queued work. It MUST expose a way to observe in-flight count so tests can assert the ceiling (data-model § ExecutionSlot)
- [X] T013 Update both test mock layers to the 0.2.0 contract: the global `piston-judger` mock in `backend/test/setup.ts` and the per-scenario overrides in `backend/test/unit/services/judger.service.test.ts` (research S9)

**Checkpoint**: `npm test` type-checks and runs. Type layer, settings, and limiter available to every story.

---

## Phase 3: User Story 1 — A student is never marked down for a busy machine (Priority: P1) 🎯 MVP

**Goal**: A system-attributed verdict never reaches a student's score; it is retried, and if it survives retries the submission is recorded as a system failure rather than a wrong answer.

**Independent test**: quickstart V1 — drive judging with a scripted system-terminated compile stage; confirm the score is *unchanged* (not zeroed), the work is retried, and the submission ends in the system-failure state without being counted wrong.

### Tests for US1

- [X] T014 [P] [US1] Add a scripted execution double in `backend/test/fixtures/` producing verdicts by attribution — system-terminated compile, genuine compiler diagnostic, execution-failure arm, and normal completion
- [X] T015 [US1] Test in `backend/test/unit/services/judger.service.test.ts`: a system-attributed verdict leaves the student's score **unchanged** and does not mark the submission graded (SC-001)
- [X] T016 [US1] Test: a system-attributed verdict is retried up to the configured maximum (FR-003)
- [X] T017 [US1] Test: once retries are exhausted the submission ends in `SystemError`, carries no score, and is **not** counted among wrong answers (FR-005)
- [X] T018 [US1] Test: a submission-attributed verdict is graded and is **never** retried — guards the opposite failure, where a fix blames the system for everything (FR-004, contract G2)
- [X] T019 [US1] Test: an unreachable backend produces a system failure verdict rather than an unhandled error (FR-010 of the library contract; spec US1 AS5)
- [X] T020 [US1] Test: a submission whose test cases mix system and student failures is not scored as if fully evaluated (spec Edge Cases)

### Implementation for US1

- [X] T021 [US1] Migrate `backend/src/services/judger.service.ts` to the 0.2.0 types: **delete the `executeRes.success === false || executeRes.error || !executeRes.run` pre-check** — `judge()` now accepts the failure arm, and that pre-check is the bypassed-abstraction smell the library fix was built to remove (FR-001, contract G6)
- [X] T022 [US1] Remove every `any` from the judging path in `backend/src/services/judger.service.ts`, reading attribution and stage facts from the typed verdict (NFR-TYPE, SC-006)
- [X] T023 [US1] Implement retry of the **individual execution** — not the whole submission — in `backend/src/services/judger.service.ts`, so one bad test case does not re-run every passing one at the moment the machine is already saturated (research D2)
- [X] T024 [US1] Route retries through the limiter from T012. **A retry that bypasses the ceiling adds load exactly when the machine is failing** (data-model § ExecutionSlot)
- [X] T025 [US1] Exclude system-attributed results from scoring and from wrong-answer counts in the scoreboard sync in `backend/src/services/judger.service.ts` (FR-002)
- [X] T026 [US1] Correct the misleading comment in `backend/src/services/judger.service.ts` that claims the query selects pending submissions — there is no status filter and every submission is re-judged on every trigger (research S1). **Fix the comment, not the behaviour**: changing what gets re-judged is a semantic change outside this specification, and is recorded for a separate decision

**Checkpoint**: US1 tests green. The production incident is closed on the backend side.

---

## Phase 4: User Story 2 — The system queues instead of collapsing (Priority: P1)

**Goal**: Executions in flight never exceed the configured ceiling, counted across the whole process.

**Independent test**: quickstart V2 — fire several independent judging requests **simultaneously** and assert the observed maximum in flight never exceeds the ceiling.

**⚠️ Ships with User Story 3.** A ceiling without asynchronous judging converts a wrong verdict into a held connection.

### Tests for US2

- [ ] T027 [P] [US2] Test in `backend/test/unit/services/judge-limiter.test.ts`: with ceiling *N*, work submitted **concurrently** never exceeds *N* in flight, asserting the observed maximum rather than an average. **A sequentially-written test passes with no limiter at all** — the work must genuinely overlap (SC-002, quickstart V2)
- [ ] T028 [US2] Test: the ceiling applies **across** independent judging requests — with ceiling *N* and *k* simultaneous requests, the maximum in flight is *N*, not *N × k* (FR-006, spec US2 AS2)
- [ ] T029 [US2] Test: retries are subject to the ceiling too, verified while retries are being consumed (quickstart V3)
- [ ] T030 [US2] Test: lowering and raising the ceiling takes effect on queued work without a restart, and no moment exceeds the higher of the two values (FR-008, quickstart V4)
- [ ] T031 [US2] Test: zero, negative and absurdly large ceilings are each clamped and reported as `clamped`, and **none produces unlimited concurrency** (FR-019, contract G8)

### Implementation for US2

- [ ] T032 [US2] Wrap the piston execution call in `backend/src/services/judger.service.ts` with the global limiter, so the ceiling holds regardless of how callers above batch or parallelise (FR-007)
- [ ] T033 [US2] Delete the per-request `pLimit(5)` from `backend/src/services/judger.service.ts` — constructed per request, it admitted *5N* executions for *N* simultaneous requests, which is no ceiling at all
- [ ] T034 [US2] Drive the limiter's ceiling from `judge.config.ts`, applying clamping and recording `clamped` provenance (FR-019)

**Checkpoint**: US2 tests green. Load produces queueing rather than a cliff.

---

## Phase 5: User Story 3 — Triggering judging returns immediately (Priority: P1)

**Goal**: Judging is accepted immediately with a handle, runs in the background, and announces completion.

**Independent test**: quickstart V5 — with work queued, a further request is acknowledged in under a second, its handle tracks state, and the outcome is retrievable by querying even if the notification is discarded.

### Tests for US3

- [ ] T035 [P] [US3] Test in `backend/test/integration/controllers/admin/admin-judger.controller.test.ts`: the trigger responds **202 with a handle** before judging completes (FR-009, SC-003)
- [ ] T036 [US3] Test: a job's state can be queried through waiting → running → finished, and a failed run reports `failed` rather than appearing to run forever (FR-010)
- [ ] T037 [US3] Test: completion is announced on the existing live-update channel (FR-011)
- [ ] T038 [US3] Test: the outcome is retrievable by querying when the notification is discarded — a lost notification must not look like lost work (contract G5)
- [ ] T039 [US3] Test: a second request for a student already being judged returns the **existing** handle and starts no second run (FR-013)
- [ ] T040 [US3] Test: the startup path returns submissions stuck in `Judging` to `Pending`, leaving none stuck (FR-012, SC-007, quickstart V6)
- [ ] T041 [US3] Test: the re-judge endpoint accepts a student id and behaves as the trigger does (research S4)

### Implementation for US3

- [ ] T042 [US3] Create `backend/src/services/judge-queue.service.ts` holding the in-memory job registry — handle, state, timestamps, outcome — with at most one non-terminal job per student (data-model § JudgingJob, research D4, D5)
- [ ] T043 [US3] Change `backend/src/controllers/admin/admin-judger.controller.ts` to accept-and-acknowledge with **202** and a handle, running judging in the background
- [ ] T044 [US3] Announce completion through `SocketService` from the background run, not from the request handler
- [ ] T045 [US3] Add `GET /admin/judger/jobs/:jobId` in `backend/src/routes/admin/admin-judger.route.ts` and its controller method
- [ ] T046 [US3] Add `POST /admin/judger/rejudge` in `backend/src/routes/admin/admin-judger.route.ts` — **the frontend has been calling this route all along and receiving 404s, so the TA's re-judge button silently does nothing today** (research S4)
- [ ] T047 [US3] Add startup recovery in `backend/src/index.ts` after database initialisation, returning interrupted `Judging` submissions to `Pending` (FR-012)
- [ ] T048 [US3] Narrow the `any` payload type on `SocketService.triggerScoreUpdateEvent` in `backend/src/sockets/socket.service.ts` — it serialises its whole argument into the log, and one caller passing a result object would log student output, the defect class already fixed upstream (research S8)

**Checkpoint**: US3 tests green. With US2, load is survivable end to end.

---

## Phase 6: User Story 4 — One configuration file configures one machine (Priority: P2)

**Goal**: Uploading one configuration fully configures judging, including machine capacity; settings and backend health are readable.

**Independent test**: quickstart V7 — upload a configuration omitting judging settings and confirm **documented defaults apply rather than previous values persisting**. A merge implementation passes the first upload and fails this one.

### Tests for US4

- [ ] T049 [P] [US4] Test in `backend/test/integration/`: uploading a configuration containing judging settings applies them, including the concurrency ceiling (FR-014)
- [ ] T050 [US4] Test: uploading a configuration **omitting** judging settings falls back to documented defaults and does **not** retain previous values (FR-015, SC-004)
- [ ] T051 [US4] Test: settings changed through the management endpoint are overridden by a later configuration upload — intended behaviour, asserted so it is not "fixed" later (spec US4 AS3)
- [ ] T052 [US4] Test: reading settings reports each value's origin, distinguishing a default from a deliberate choice (FR-016)
- [ ] T053 [US4] Test: health reports reachability and installed languages, and reports an unreachable backend rather than raising (FR-018, quickstart V8)

### Implementation for US4

- [ ] T054 [US4] Add `GET /admin/judger/settings` returning effective values with provenance, in `backend/src/routes/admin/admin-judger.route.ts` and its controller
- [ ] T055 [US4] Add `PUT /admin/judger/settings` applying changes immediately, including the ceiling, with no restart (FR-008, FR-017)
- [ ] T056 [US4] Add `GET /admin/judger/health` reporting reachability and installed runtimes, extending the existing startup probe into something queryable (research S6, D8)
- [ ] T057 [US4] Confirm `restrictedUpdate` in `backend/src/services/exam-config.service.ts` does **not** preserve judging settings across an upload — it preserves only accessible users and environment variables, and adding judging settings to that list would silently defeat FR-015

**Checkpoint**: US4 tests green. A new exam machine needs exactly one file.

---

## Phase 7: User Story 5 — System failures are visible (Priority: P2)

**Goal**: An operator can see how many failures were the machine's.

**Independent test**: quickstart V10 — judge a mixed batch and confirm the system-failure count is reported separately, and that a clean run reports zero rather than omitting it.

### Tests for US5

- [ ] T058 [P] [US5] Test: a finished job's outcome reports system-attributed failures separately from student failures (FR-020, SC-005)
- [ ] T059 [US5] Test: a run with no system failures reports zero rather than omitting the field — an absent count is indistinguishable from an unreported one
- [ ] T060 [US5] Test: a submission in `SystemError` is distinguishable from one judged incorrect (spec US5 AS2)

### Implementation for US5

- [ ] T061 [US5] Populate `JudgingOutcome` counts — graded, system failures, retries used — in `backend/src/services/judge-queue.service.ts` as the run proceeds (data-model § JudgingOutcome)
- [ ] T062 [US5] Surface the counts through the job query endpoint

**Checkpoint**: US5 tests green. Attribution is actionable, not merely stored.

---

## Phase 8: User Story 6 — The deployment is configured for its machine (Priority: P3)

- [ ] T063 [P] [US6] Update the piston service in `docker-compose.yml` with the isolation settings its documentation requires, a jobs tmpfs, a packages volume, and resource limits (FR-022)
- [ ] T064 [US6] Set the execution backend's own concurrency ceiling in `docker-compose.yml` so excess **queues** rather than being admitted and timing out together — queue wait does not count against the compile allowance, which is what converts the measured cliff into backpressure (research D9)
- [ ] T065 [P] [US6] Document the recommended deployment settings in `README.md`, together with the concurrency-sweep method for measuring a given machine, and the measured data point (0% failures at concurrency 20, 23% at 30 on an idle 12-core machine) as a worked example (FR-023)
- [ ] T066 [US6] Document the `>=20.19.0` runtime requirement and why it exists in `README.md`

**Checkpoint**: the stack starts from committed configuration with a documented sizing method.

---

## Phase 9: Frontend Caller Migration

**In scope because 004 and 005 ship together** (plan § Scope decisions). This migrates existing callers only — **the judging settings page remains in 005**.

- [ ] T067 [P] Migrate `frontend/src/stores/student.store.ts` `reevaluateStudentCode` to the handle-and-notify contract: the response is now a handle, not results
- [ ] T068 [P] Migrate `frontend/src/stores/score.store.ts` `rejudge` to the same contract. **Its 404 is silently swallowed today**, so this is the first time the action will do anything (research S4)
- [ ] T069 Ensure the live-update handler refreshes results on the completion announcement, so a TA sees results without manual refresh

**Checkpoint**: the TA flow works end to end.

---

## Phase 10: Polish & Validation

- [ ] T070 Run the full backend suite: `npm test` in `backend/` — type check across sources and tests, then all tests green
- [ ] T071 Walk every validation V1–V10 in `quickstart.md` and record each outcome against its success criterion
- [ ] T072 Verify the runtime constraint end to end: build the image from the pinned `Dockerfile` and confirm the backend starts, since `require(ESM)` failure surfaces only at boot
- [ ] T073 Confirm no `any` remains in the judging path and no pre-check of raw execution responses survives (SC-006, quickstart V9)
- [ ] T074 Update `knowledge/draft/piston穩定度與併發問題.md` marking sections B and D complete, and reflow the incident into `knowledge/experience.md` #6 — its `Resolved by` has been deliberately blank since 2026-08-26 awaiting exactly this
- [ ] T075 Note in `knowledge/draft/全專案環境標準化.md` that a declared `engines` range is now a correctness requirement rather than tidiness, since the runtime minimum is load-bearing

---

## Dependencies

```
Phase 1 (Setup)
      ▼
Phase 2 (Foundational) ── blocks everything below
      │
      ├──► Phase 3 (US1) 🎯 MVP
      ├──► Phase 4 (US2) ─┐
      ├──► Phase 5 (US3) ─┴─ must ship together
      ├──► Phase 6 (US4)
      ├──► Phase 7 (US5) ── needs Phase 5's job registry
      └──► Phase 8 (US6)
                │
                ▼
        Phase 9 (Frontend) ── needs Phase 5's contract
                │
                ▼
        Phase 10 (Validation)
```

| Story | Depends on | Can ship alone? |
|-------|-----------|-----------------|
| US1 (P1) | Phase 2 | ✅ Closes the incident |
| US2 (P1) | Phase 2 | ❌ **Regresses without US3** |
| US3 (P1) | Phase 2 | ✅ |
| US4 (P2) | Phase 2 | ✅ |
| US5 (P2) | Phase 5 | ✅ |
| US6 (P3) | none | ✅ |

---

## Parallel Execution Examples

**Phase 2** — different files:
```
T009 (judge.config.ts) ∥ T010 (config.schema.ts) ∥ T011 (piston.config.ts)
T007 → T008 sequential (same status set)
```

**Phase 3** — T014 (fixtures) first, then T015–T020 in parallel; T021–T026 share `judger.service.ts` and are **sequential**.

**Cross-phase** — Phase 8 (deployment docs) touches no application code and can run alongside any other phase.

---

## Implementation Strategy

### MVP scope

**Phases 1–3** delivers US1: no student is marked down for a busy machine. Independently verifiable via quickstart V1, and independently valuable.

### Incremental delivery

1. Phase 1–2 → dependencies, runtime constraint, type layer, limiter
2. Phase 3 (US1) → **MVP — incident closed on the backend**
3. Phases 4 + 5 (US2 + US3) → **released together**; US2 alone is a regression
4. Phases 6 + 7 (US4 + US5) → configurability and visibility
5. Phase 8 (US6) → deployment hardening
6. Phase 9 → frontend callers, so the TA flow works
7. Phase 10 → validate, then reflow the knowledge base

### What this feature does not deliver

After all 75 tasks, judging is **not faster**. Every test case still recompiles the submission — the dominant load driver, and unchanged here. The ceiling makes that load survivable, not smaller. Anyone reading a stable exam and concluding the system got faster will size the next machine wrong.
