# Tasks: Judger Deploy Test

**Input**: Design documents from `/specs/006-judger-deploy-test/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Mandatory. The constitution and feature specification require automated coverage of every acceptance scenario and 100% line coverage for newly introduced executable code. Within each phase, write the listed tests first and confirm they fail for the intended missing behavior before implementation.

**Organization**: Tasks are grouped by user story. Shared correctness and safety boundaries are completed first; each story then delivers an independently testable vertical increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and has no dependency on another incomplete task in the same batch.
- **[Story]**: Maps work to US1–US5 from `spec.md`.
- Every task names the exact file or files it changes.

## Worktree and branch guardrails

- Implementation must occur on `feat/006-judger-deploy-test`, not directly on the current `develop` branch.
- Preserve the user's existing modifications in `frontend/src/api/judge-settings.ts`, `frontend/src/api/judging.ts`, `frontend/src/api/backend-url.ts`, `frontend/test/api-urls.test.ts`, and `frontend/test/editing-ui.test.ts`.
- New deploy-test API code must consume the existing `frontend/src/api/backend-url.ts` rather than replacing or duplicating it.

## Phase 1: Setup (Shared Tooling and Deployment Security)

**Purpose**: Make the administrative trust boundary and coverage tooling truthful before exposing a resource-intensive operation.

- [X] T001 [P] Add a regression test proving the configured admin environment token protects admin endpoints in `backend/test/integration/security-guard.test.ts`
- [X] T002 Correct the backend container environment key from `ADMIN_SECRET` to `ADMIN_TOKEN` and preserve the existing external configuration fallback in `docker-compose.yml`
- [X] T003 [P] Add frontend V8 coverage tooling, scripts, and new-code include/exclude thresholds in `frontend/package.json`, `frontend/vitest.config.ts`, and `pnpm-lock.yaml`

**Checkpoint**: Deployed admin authentication consumes the configured secret and frontend coverage can be measured.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish strictly typed profiles/reports, reusable protected execution, atomic work admission, latest-only persistence, and restart recovery.

**⚠️ CRITICAL**: No user-story implementation begins until this phase passes independently.

### Tests for foundational boundaries

- [X] T004 [P] Write failing tests for strict profile defaults, derived levels, bounds, duplicate/ordering rejection, unknown keys, and phase combinations in `backend/test/unit/config/deploy-test.config.test.ts`
- [X] T005 [P] Write failing tests for 5,000-character truncation and non-string diagnostics in `backend/test/unit/utils/judger-output.util.test.ts`
- [X] T006 [P] Write failing tests for explicit limits, global-slot use, attribution-first retry, attempt timing/history, and pre-execution interruption in `backend/test/unit/services/judge-execution.service.test.ts`
- [X] T007 [P] Write failing race tests for mutually exclusive student/deploy leases, draining, idempotent release, reset, and settle in `backend/test/unit/services/judging-work-coordinator.test.ts`
- [X] T008 [P] Write failing tests for typed singleton create/read/replace, corrupt JSON rejection, and failed-admission preservation in `backend/test/unit/services/deploy-test-repository.test.ts`
- [X] T009 [P] Write failing tests that restart recovery converts queued/running to interrupted and leaves terminal reports unchanged in `backend/test/unit/services/deploy-test-startup.test.ts`

### Implementation for foundational boundaries

- [X] T010 Define exhaustive run/profile/snapshot/progress/probe/attempt/concurrency/envelope types and terminal guards in `backend/src/types/deploy-test.type.ts`
- [X] T011 Implement server-owned defaults/bounds and strict Zod request/persistence schemas in `backend/src/config/deploy-test.config.ts` and `backend/src/schemas/deploy-test.schema.ts`
- [X] T012 Implement shared bounded diagnostic truncation and replace the private duplicate without behavior change in `backend/src/utils/judger-output.util.ts` and `backend/src/services/judger.service.ts`
- [X] T013 Extract the limiter-protected execute/judge/system-retry primitive with injected clock/client and attempt history, then migrate student judging to it in `backend/src/services/judge-execution.service.ts` and `backend/src/services/judger.service.ts`
- [X] T014 Implement atomic student/deploy/draining leases and integrate student-job acquisition/release/conflicts in `backend/src/services/judging-work-coordinator.ts`, `backend/src/services/judge-queue.service.ts`, and `backend/src/controllers/admin/admin-judger.controller.ts`
- [X] T015 Implement the Zod-validated protected latest-run adapter and add its key to deletion protection in `backend/src/services/deploy-test-repository.ts` and `backend/src/services/system-settings.service.ts`
- [X] T016 Implement idempotent interrupted-run startup repair before server listen in `backend/src/services/deploy-test-startup.service.ts` and `backend/src/index.ts`
- [X] T017 Register reset/settle cleanup for every new singleton/background service so tests cannot leak work or state in `backend/test/setup.ts`

**Checkpoint**: Foundation tests pass; student judging still passes its existing suite through the extracted execution primitive; deploy and student work cannot overlap.

---

## Phase 3: User Story 1 — Run a deployment test from the Judge page (Priority: P1)

**Goal**: An operator can review a server-authoritative profile, explicitly start an asynchronous run, and see accepted/refused, queued, running, progress, and terminal state without leaving `/judge`.

**Independent Test**: With a fake readiness runner, open `/judge`, select Deploy Test, start the default profile, and observe admission, progress, and a terminal report entirely on the same route; refusal shows a reason and creates no partial run.

### Tests for User Story 1

- [X] T018 [P] [US1] Write failing lifecycle tests for validation, readiness admission, queued/running/completed/failed states, monotonic progress, terminal freeze, and settle/reset in `backend/test/unit/services/deploy-test.service.test.ts`
- [X] T019 [P] [US1] Write failing authenticated contract tests for profile, 202 start, idempotent active return, 400, 409, 503, latest, status, and 404 responses in `backend/test/integration/controllers/admin/admin-deploy-test.controller.test.ts`
- [X] T020 [P] [US1] Write failing exact method/URL/body tests for the deploy-test HTTP boundary in `frontend/test/deploy-test.api.test.ts`
- [X] T021 [P] [US1] Write failing store tests for independent profile/latest loading, start acceptance/refusal, authoritative errors, and basic terminal polling in `frontend/test/deploy-test.store.test.ts`
- [X] T022 [P] [US1] Write failing page tests for Settings/Deploy Test tabs, explicit confirmation, same-route execution, progress, refusal, and independent settings/deploy failures in `frontend/test/deploy-test-view.test.ts`

### Implementation for User Story 1

- [X] T023 [US1] Implement profile resolution, readiness admission, durable queued creation, background lifecycle/progress, terminal freeze, draining envelope, and settle/reset in `backend/src/services/deploy-test.service.ts`
- [X] T024 [US1] Implement the typed profile/start/latest/status handlers and register literal `latest` before `:runId` under inherited admin auth in `backend/src/controllers/admin/admin-deploy-test.controller.ts` and `backend/src/routes/admin/admin-judger.route.ts`
- [X] T025 [P] [US1] Define frontend wire/domain types matching the API contract without `any` in `frontend/src/types/deploy-test.ts`
- [X] T026 [US1] Implement typed profile/start/latest/status requests using the existing shared backend URL in `frontend/src/api/deploy-test.ts`
- [X] T027 [US1] Implement independent deploy profile/run state, explicit start, one-second recursive non-overlapping polling, terminal stop, error separation, generation guards, and unmount cleanup in `frontend/src/stores/deploy-test.store.ts`
- [X] T028 [US1] Implement the profile form, lifecycle/progress display, and composition panel with stable selectors and accessible confirmation in `frontend/src/views/judge/components/DeployTestProfileForm.vue`, `frontend/src/views/judge/components/DeployTestRunStatus.vue`, and `frontend/src/views/judge/components/DeployTestPanel.vue`
- [X] T029 [US1] Extract existing settings markup and convert the Judge view into a compact Settings/Deploy Test tab coordinator while preserving behavior and the 150-line view limit in `frontend/src/views/judge/components/JudgeSettingsPanel.vue` and `frontend/src/views/judge/JudgeSettingsView.vue`
- [X] T030 [US1] Make all US1 backend and frontend tests pass and add regression expectations for the existing dirty Judge-page tests without overwriting their intent in `backend/test/unit/services/deploy-test.service.test.ts`, `backend/test/integration/controllers/admin/admin-deploy-test.controller.test.ts`, `frontend/test/deploy-test.store.test.ts`, `frontend/test/deploy-test-view.test.ts`, and `frontend/test/editing-ui.test.ts`

**Checkpoint**: US1 works end-to-end with a fake readiness runner and no route change. It is an operational shell, but not yet a meaningful judger proof until US2.

---

## Phase 4: User Story 2 — Prove C, C++, and Python actually execute (Priority: P1)

**Goal**: Run deterministic input/output code in each required language and show passed, failed, or blocked evidence per runtime.

**Independent Test**: Run only the smoke phase; all installed languages execute and match AC/submission, while a missing runtime is named as blocked without preventing available languages from running.

### Tests for User Story 2

- [X] T031 [P] [US2] Write failing unit tests for catalogue canonical/alias resolution, exact observed versions, AC fixtures, missing runtime blocking, and advertised-but-broken runtime failure in `backend/test/unit/services/deploy-test-smoke.test.ts`
- [X] T032 [P] [US2] Write failing integration tests for full and partial runtime catalogues and per-language persisted evidence in `backend/test/integration/controllers/admin/admin-deploy-test-smoke.test.ts`
- [X] T033 [P] [US2] Create strictly typed queued/running/passed/blocked fixture builders and failing probe-table tests in `frontend/test/fixtures/deploy-test.fixture.ts` and `frontend/test/deploy-test-view.test.ts`

### Implementation for User Story 2

- [X] T034 [P] [US2] Define immutable C, C++, and Python AC source/stdin/output probes and runtime-resolution helpers in `backend/src/config/deploy-test-probes.config.ts`
- [X] T035 [US2] Add smoke-phase planning/execution, runtime snapshots, blocked semantics, expected/observed comparison, and bounded attempt evidence in `backend/src/services/deploy-test.service.ts`
- [X] T036 [US2] Render language/runtime, expected/observed verdict and attribution, attempts, duration, blocked state, and bounded diagnostics in `frontend/src/views/judge/components/DeployTestProbeResults.vue` and integrate it in `frontend/src/views/judge/components/DeployTestPanel.vue`

**Checkpoint**: US1+US2 form the suggested MVP: an operator can start a test on `/judge` and prove the deployed C/C++/Python runtimes really execute.

---

## Phase 5: User Story 3 — Verify failure classification and safety limits (Priority: P1)

**Goal**: Prove CE, RE, TLE, MLE, and OLE status/attribution and verify output remains bounded and Piston remains healthy.

**Independent Test**: Run only the verdict phase; every fixed failure matches its expected status and submission attribution, any system-attributed attempt fails the probe, OLE output is bounded, and post-OLE health succeeds.

### Tests for User Story 3

- [X] T037 [P] [US3] Write failing unit tests for CE/RE/TLE/MLE/OLE fixtures, explicit resource limits, retry-attempt visibility, attribution mismatch, OLE truncation, and post-check failure in `backend/test/unit/services/deploy-test-verdicts.test.ts`
- [X] T038 [P] [US3] Write failing integration tests proving verdict results persist bounded diagnostics and emit no score update in `backend/test/integration/controllers/admin/admin-deploy-test-verdicts.test.ts`
- [X] T039 [P] [US3] Write failing UI tests for expected/observed mismatch, system-attributed failure, retry history, completed-but-failed styling, OLE evidence, and interrupted styling in `frontend/test/deploy-test-view.test.ts`

### Implementation for User Story 3

- [X] T040 [P] [US3] Add immutable invalid-C, failing-C, infinite-loop, allocation/touch, and continuous-output probe definitions with expected status/attribution and explicit limits in `backend/src/config/deploy-test-probes.config.ts`
- [X] T041 [US3] Implement verdict-phase comparison, system-attempt failure semantics, 10-sample/5,000-character caps, post-OLE health, and overall pass/warning/fail reduction in `backend/src/services/deploy-test.service.ts`
- [X] T042 [US3] Add attempt expansion, mismatch/system-failure emphasis, lifecycle-versus-outcome styling, and post-check evidence without relying on color alone in `frontend/src/views/judge/components/DeployTestProbeResults.vue` and `frontend/src/views/judge/components/DeployTestPanel.vue`
- [X] T043 [US3] Add a before/after integration assertion that smoke/verdict runs do not mutate Submission or ScoreBoard rows in `backend/test/integration/controllers/admin/admin-deploy-test-verdicts.test.ts`

**Checkpoint**: All functional and error-verdict probes are visible on `/judge`, correctly attributed, bounded, and isolated from student truth.

---

## Phase 6: User Story 4 — Validate concurrent operation under the configured ceiling (Priority: P2)

**Goal**: Submit at least 100 synthetic jobs across bounded levels, preserve the global ceiling, and report exact accounting, queue/execution latency, percentiles, throughput, degradation, interruption, and draining.

**Independent Test**: Run a concurrency-only profile totaling 100 jobs including a submitted level above the active ceiling; every job is classified exactly once, observed execution never exceeds the ceiling, and every level shows p50/p95/p99/max plus throughput.

### Tests for User Story 4

- [X] T044 [P] [US4] Write failing nearest-rank percentile, empty-distribution, exact allocation/accounting, throughput, sample-cap, and deterministic degradation tests in `backend/test/unit/services/deploy-test-metrics.test.ts`
- [X] T045 [P] [US4] Write failing worker-pool tests for incremental dequeue, submitted versus actual concurrency, shared-slot ceiling, exam flip before dequeue/inside slot, deadline freeze, late-result immutability, and draining lease in `backend/test/unit/services/deploy-test-concurrency.test.ts`
- [X] T046 [P] [US4] Write failing integration tests for 100-job accounting, second-run conflict, bidirectional student/deploy exclusion, mid-run `IN_PROGRESS`, and no student/score/socket mutation in `backend/test/integration/controllers/admin/admin-deploy-test-concurrency.test.ts`
- [X] T047 [P] [US4] Write failing UI tests for submitted/actual concurrency, all accounting buckets, throughput, p50/p95/p99/max, warnings, infrastructure failure rate, and responsive table behavior in `frontend/test/deploy-test-view.test.ts`

### Implementation for User Story 4

- [X] T048 [P] [US4] Implement deterministic job distribution, nearest-rank distributions, exact accounting invariants, throughput, warning thresholds, and bounded sample errors in `backend/src/services/deploy-test-metrics.ts`
- [X] T049 [US4] Implement the incremental concurrency worker pool with pre-dequeue and in-slot exam checks, local peak tracking, enqueue/acquire/finish timestamps, deadline report freeze, tracked late promises, and draining release in `backend/src/services/deploy-test.service.ts`
- [X] T050 [US4] Expose derived `[1, ceiling, min(2×ceiling,64)]` defaults, total job/deadline bounds, eligibility, and normalized profile snapshots in `backend/src/config/deploy-test.config.ts`, `backend/src/schemas/deploy-test.schema.ts`, and `backend/src/controllers/admin/admin-deploy-test.controller.ts`
- [X] T051 [US4] Feed level results and degradation/system-failure findings into overall outcome without auto-changing judge settings in `backend/src/services/deploy-test.service.ts`
- [X] T052 [P] [US4] Render per-level accounting and distributions with submitted versus observed concurrency and accessible warnings in `frontend/src/views/judge/components/DeployTestConcurrencyResults.vue`
- [X] T053 [US4] Integrate concurrency profile controls/results and preserve server-authoritative bounds in `frontend/src/views/judge/components/DeployTestProfileForm.vue`, `frontend/src/views/judge/components/DeployTestPanel.vue`, and `frontend/src/stores/deploy-test.store.ts`

**Checkpoint**: The deployed-path concurrency test produces complete, bounded, honest measurements without bypassing the production limiter or mixing student work.

---

## Phase 7: User Story 5 — Return to and export the latest result (Priority: P2)

**Goal**: Restore an active/latest report after reload or restart, prevent stale polling from corrupting state, and export the exact terminal object shown on screen.

**Independent Test**: Start a run, reload `/judge`, observe the same run resume, complete it, reload again, export JSON matching the displayed report, and verify a backend restart turns nonterminal work into interrupted evidence.

### Tests for User Story 5

- [X] T054 [P] [US5] Extend persistence/startup tests for latest-only replacement, process-restart interruption, preserved partial evidence, immutable terminal data, and draining outside the frozen report in `backend/test/unit/services/deploy-test-repository.test.ts` and `backend/test/unit/services/deploy-test-startup.test.ts`
- [X] T055 [P] [US5] Extend store tests with fake timers for active restore, recursive non-overlapping polling, transient stale labeling/retry, terminal stop, generation invalidation, unmount cleanup, and no localStorage truth in `frontend/test/deploy-test.store.test.ts`
- [X] T056 [P] [US5] Write failing Blob MIME, filename, click, and object-URL revocation tests in `frontend/test/download-json.test.ts`
- [X] T057 [P] [US5] Write failing same-route reload/latest/interrupted/export parity tests in `frontend/test/deploy-test-view.test.ts`

### Implementation for User Story 5

- [X] T058 [US5] Finalize latest/status envelopes, restart interruption, immutable terminal persistence, and operational draining retrieval in `backend/src/services/deploy-test-repository.ts`, `backend/src/services/deploy-test-startup.service.ts`, `backend/src/services/deploy-test.service.ts`, and `backend/src/controllers/admin/admin-deploy-test.controller.ts`
- [X] T059 [US5] Implement restore-latest, stale-but-visible retry, generation-safe polling, exact displayed-report export orchestration, and teardown in `frontend/src/stores/deploy-test.store.ts`
- [X] T060 [P] [US5] Implement safe `application/json` Blob download with `judger-deploy-test-<runId>.json` naming and guaranteed object-URL cleanup in `frontend/src/utils/download-json.ts`
- [X] T061 [US5] Integrate automatic active-run tab selection, freshness/stale state, terminal export, and restart interruption display in `frontend/src/views/judge/JudgeSettingsView.vue`, `frontend/src/views/judge/components/DeployTestRunStatus.vue`, and `frontend/src/views/judge/components/DeployTestPanel.vue`

**Checkpoint**: Active and latest evidence survives page lifecycle, restart interruption is honest, and export exactly matches the report visible inside `/judge`.

---

## Phase 8: Polish and Cross-Cutting Verification

**Purpose**: Enforce constitutional gates, verify the real deployed sandbox, document operations, and audit all cross-story invariants.

- [X] T062 [P] Enforce and document 100% line coverage for every newly introduced backend and frontend executable file in `backend/package.json`, `frontend/package.json`, `frontend/vitest.config.ts`, and `specs/006-judger-deploy-test/quickstart.md`
- [X] T063 Run backend lint/typecheck/tests/build and frontend typecheck/tests/coverage/build, then record command outcomes and any isolated pre-existing flake evidence in `specs/006-judger-deploy-test/quickstart.md`
- [X] T064 Execute the real deployed C/C++/Python, CE/RE/TLE/MLE/OLE, 100-job, reload, restart, unavailable-Piston, and deadline/draining scenarios and record measured evidence in `specs/006-judger-deploy-test/quickstart.md`
- [X] T065 [P] Document the operator workflow, safety bounds, report interpretation, admin-token configuration, and transport-cancellation residual risk in `README.md`
- [X] T066 Audit strict typing, auth, bounds, output/error caps, exact accounting, terminal immutability, global limiter occupancy, student-data/socket isolation, same-route UI, and dirty-worktree preservation against `specs/006-judger-deploy-test/spec.md`, `specs/006-judger-deploy-test/contracts/deploy-test-api.yaml`, and `specs/006-judger-deploy-test/contracts/judge-page.md`

---

## Dependencies and Execution Order

### Phase dependencies

```text
Phase 1 Setup
     │
     ▼
Phase 2 Foundation
     │
     ▼
US1 same-page lifecycle shell
  ├────────► US2 language smoke ────────► US3 verdict safety
  ├────────► US4 concurrency
  └────────► US5 restore/export
                    │
                    ▼
           Phase 8 final verification
```

- **Phase 1** starts immediately after switching to the required feature branch.
- **Phase 2** depends on Phase 1 and blocks all stories.
- **US1** depends on Phase 2 and supplies the lifecycle/API/page shell used by later stories.
- **US2** depends on US1 for the runner and probe presentation shell.
- **US3** depends on US2's probe model and display but remains independently runnable as a verdict-only profile.
- **US4** depends on US1 and can proceed in parallel with US2/US3 because it owns separate metrics/result components; shared service edits must be serialized.
- **US5** depends on US1 and can proceed in parallel with US2–US4 except for shared store/service/view integration files.
- **Phase 8** depends on all stories selected for delivery.

### Within each story

1. Add the story's failing tests first and confirm failure is caused by missing behavior.
2. Implement server/domain behavior before HTTP or UI integration.
3. Implement typed API/store boundaries before Vue composition.
4. Run the story's isolated test files at its checkpoint.
5. Do not continue if existing student-judging regression tests fail deterministically.

## Parallel Opportunities

### Foundation

```text
T004 config/schema tests       ─┐
T005 output utility tests       │
T006 execution primitive tests  ├─ parallel test-authoring batch
T007 coordinator tests          │
T008 repository tests           │
T009 startup tests             ─┘
```

### User Story 1

```text
T018 backend lifecycle tests ─┐
T019 HTTP contract tests      │
T020 frontend API tests       ├─ parallel test-authoring batch
T021 frontend store tests     │
T022 page tests              ─┘

After T025 frontend types and T027 store stabilize, T028 builds the profile/status panel and T029 integrates the compact route view.
```

### User Stories 2–5

- US2: T031, T032, and T033 are parallel; T034 can proceed independently before T035.
- US3: T037, T038, and T039 are parallel; T040 can proceed independently before T041.
- US4: T044–T047 are parallel; T048 and T052 are parallel before service/UI integration.
- US5: T054–T057 are parallel; T060 is parallel with backend T058 before store/view integration.
- After US1, separate developers may own US2/US3, US4, and US5, but edits to `deploy-test.service.ts`, `deploy-test.store.ts`, `DeployTestPanel.vue`, and `JudgeSettingsView.vue` must be sequenced rather than merged blindly.

## Implementation Strategy

### Suggested MVP: User Stories 1 + 2

1. Complete Setup and Foundation.
2. Complete US1 to make the asynchronous workflow reachable entirely within `/judge`.
3. Complete US2 so the workflow proves C, C++, and Python actually execute.
4. Stop and validate the US2 checkpoint against a real Piston deployment.

US1 alone is a test-running shell but does not yet satisfy the feature's central business purpose. US1+US2 is the smallest meaningful deployable increment.

### Incremental delivery

1. **MVP**: US1+US2 — same-page real language smoke verification.
2. **Safety verdicts**: US3 — deterministic CE/RE/TLE/MLE/OLE and attribution.
3. **Capacity evidence**: US4 — bounded 100-job concurrency reporting.
4. **Operational resilience**: US5 — reload/restart recovery and exact JSON export.
5. **Release gate**: Phase 8 — full automated and real deployment evidence.

## Notes

- `[P]` means separate files/no incomplete dependency, not permission to race edits to the same service or view.
- Test tasks precede implementation by constitutional requirement.
- No task may introduce browser-supplied source code, a second route, a deploy-only Piston limiter, or student-data fixtures.
- Deadline handling must retain real promises in limiter accounting; `Promise.race` must never pretend the underlying execution was cancelled.
- A completed lifecycle with a failed outcome is not success.
- Commit only from the feature branch after each coherent task group; do not commit the user's unrelated frontend worktree changes.
