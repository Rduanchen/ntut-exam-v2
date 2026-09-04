# Implementation Plan: Judger Deploy Test

**Branch**: `[006-judger-deploy-test]` | **Date**: 2026-09-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-judger-deploy-test/spec.md`

## Summary

Add a deployment-test workflow entirely inside the existing Judge page. A dedicated backend runner executes fixed C, C++, and Python probes, validates AC/CE/RE/TLE/MLE/OLE attribution, and drives a bounded concurrency sweep through the same process-wide execution limiter as student judging. The run is asynchronous, latest-only durable, restart-aware, isolated from student data and student judging work, and observable through typed administrative contracts. The frontend adds Settings/Deploy Test tabs, an independent Pinia lifecycle store, non-overlapping polling, complete result tables, and JSON export without adding a route.

## Technical Context

**Language/Version**: Backend TypeScript 5.4 targeting ES2022/CommonJS on Node.js >=20.19 (production image Node 22.23.2); frontend TypeScript 6.0 with Vue 3 single-file components

**Primary Dependencies**: Express 4, Sequelize 6 + SQLite, Zod 3, `piston-judger` 0.2.0, `p-limit` 7, Vue 3, Pinia 3, Axios 1, Vuetify 3

**Storage**: Existing SQLite-backed `system_settings` table through a typed latest-run repository; no report-history table

**Testing**: Vitest 4, strict backend test typecheck, Supertest integration tests, Vue Test Utils + happy-dom; add frontend V8 coverage provider/config for new-code coverage enforcement

**Target Platform**: Docker Compose deployment on exam-room hosts, with an administrative browser client and a local/private Piston execution container

**Project Type**: Full-stack web application with a long-running asynchronous backend operation

**Performance Goals**: Start acknowledgement within 2 seconds; restored state visible within 5 seconds; default concurrency phase accounts for 100 jobs; 1-second non-overlapping UI polling; every level reports p50/p95/p99/max and throughput

**Constraints**: One deploy test at a time; no test during `IN_PROGRESS`; no overlap with student judging; every Piston execution uses the shared active ceiling (1..64); at most 8 submitted-concurrency levels and 500 jobs; 5,000-character retained diagnostic cap; no student submission, score, or score socket mutation

**Scale/Scope**: One latest run document, three executable languages, six deterministic verdict scenarios, up to 500 synthetic executions per run, one existing `/judge` page, and no permanent analytics history

## Constitution Check

*GATE: Passed before Phase 0 and re-checked after Phase 1 design.*

- [x] **Type Safety**: Shared backend types plus Zod validation guard request and persisted JSON boundaries; frontend wire types mirror the contract without `any`.
- [x] **Async & Concurrency**: Admission returns immediately; an incremental worker pool shares the global execution limiter and records submitted versus actual concurrency.
- [x] **Security & Stability**: Existing admin authentication, explicit confirmation, hard bounds, exam-state interruption, student-work exclusion, diagnostic truncation, restart recovery, deadline freezing, and draining locks are designed in.
- [x] **Low Coupling**: Student orchestration, reusable execution, deploy lifecycle/persistence, HTTP presentation, frontend state, and page components remain separate.
- [x] **Testability**: Clock, execution client, repository, and admission checks are injectable; background services expose reset/settle hooks; each contract and state transition has an automated boundary.

**Post-design re-check**: PASS. The data model makes terminal outcome distinct from lifecycle completion, the API exposes only bounded typed documents, and the UI contract keeps all network/timer work outside components. No constitutional exception is required.

## Project Structure

### Documentation (this feature)

```text
specs/006-judger-deploy-test/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── deploy-test-api.yaml
│   └── judge-page.md
└── tasks.md                 # created later by /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── config/
│   │   └── deploy-test.config.ts
│   ├── controllers/admin/
│   │   ├── admin-deploy-test.controller.ts
│   │   └── admin-judger.controller.ts
│   ├── routes/admin/
│   │   └── admin-judger.route.ts
│   ├── schemas/
│   │   └── deploy-test.schema.ts
│   ├── services/
│   │   ├── judge-execution.service.ts
│   │   ├── judging-work-coordinator.ts
│   │   ├── deploy-test.service.ts
│   │   ├── deploy-test-repository.ts
│   │   ├── deploy-test-metrics.ts
│   │   ├── deploy-test-startup.service.ts
│   │   ├── judge-queue.service.ts
│   │   └── judger.service.ts
│   ├── types/
│   │   └── deploy-test.type.ts
│   └── utils/
│       └── judger-output.util.ts
└── test/
    ├── fixtures/deploy-test.fixture.ts
    ├── integration/controllers/admin/
    │   ├── admin-deploy-test.controller.test.ts
    │   └── admin-judger.controller.test.ts
    └── unit/services/
        ├── deploy-test.service.test.ts
        ├── deploy-test-repository.test.ts
        ├── deploy-test-metrics.test.ts
        ├── deploy-test-startup.test.ts
        └── judging-work-coordinator.test.ts

frontend/
├── src/
│   ├── api/deploy-test.ts
│   ├── stores/deploy-test.store.ts
│   ├── types/deploy-test.ts
│   ├── utils/download-json.ts
│   └── views/judge/
│       ├── JudgeSettingsView.vue
│       └── components/
│           ├── DeployTestPanel.vue
│           ├── DeployTestProfileForm.vue
│           ├── DeployTestRunStatus.vue
│           ├── DeployTestProbeResults.vue
│           └── DeployTestConcurrencyResults.vue
└── test/
    ├── fixtures/deploy-test.fixture.ts
    ├── deploy-test.api.test.ts
    ├── deploy-test.store.test.ts
    ├── deploy-test-view.test.ts
    └── download-json.test.ts
```

**Structure Decision**: Keep the existing backend/frontend split. The deploy runner is its own domain service and repository; only the pure execute-and-judge primitive and the process-wide admission/limiter boundaries are shared with student judging. The existing Judge view remains the sole route shell and delegates deploy behavior to feature-specific components and a separate store.

## Phase 0: Research Decisions

All technical unknowns are resolved in [research.md](research.md). The principal decisions are:

1. Use synthetic service-level execution, not self-HTTP load against the student endpoint.
2. Extract the existing limiter-protected execute/judge/retry loop into a shared typed primitive and retain attempt history.
3. Persist only the latest run in `system_settings`; interrupt nonterminal work on restart rather than resume it.
4. Use an atomic process-wide admission coordinator so student judging and deploy measurement cannot overlap.
5. Use incremental workers, shared limiter slots, local timing/concurrency counters, nearest-rank percentiles, and deterministic degradation warnings.
6. Use polling and backend-authoritative state on the existing Judge page; no new route or socket contract.
7. Treat `piston-judger`'s missing transport cancellation as a documented residual risk; deadlines freeze the report but never release limiter accounting ahead of the real promise.

## Phase 1: Design

### Backend flow

1. `GET .../profile` resolves server defaults/bounds and current eligibility for the form.
2. `POST .../deploy-tests` strictly validates the profile, checks `IN_PROGRESS`, atomically acquires the deploy lease, checks Piston health/runtimes, persists `queued`, and returns `202` before execution completes.
3. The runner snapshots effective settings, origins, active ceiling, and runtime versions. Fixed probes and concurrency work call the shared execution primitive; no student model or score socket is imported.
4. Workers dequeue incrementally. They stop admitting work on exam activation or deadline, and a second exam-state check occurs immediately after a shared limiter slot is acquired.
5. Progress is served from memory and checkpointed at lifecycle/phase boundaries plus a throttled interval. Terminal report data is frozen and persisted; older latest data is replaced because history is out of scope.
6. On startup, a persisted `queued`/`running` run becomes `interrupted(process_restart)`. Background promises remain tracked through `settle()` for tests and lifecycle control.

### Frontend flow

1. `JudgeSettingsView.vue` becomes a small Settings/Deploy Test tab coordinator without adding or changing routes.
2. The deploy store loads profile and latest run independently from judge settings. If latest is active it begins recursive 1-second polling; no poll overlaps the previous request.
3. A generation token prevents stale responses from overwriting a newer run. Transient polling errors retain explicitly stale progress and retry; only the backend declares terminal state.
4. Feature-specific components render profile, lifecycle/progress, probes, and concurrency tables. All execution and result viewing stays inside the Deploy Test tab.
5. Export serializes the exact terminal report already displayed into a JSON Blob and revokes the object URL after download.

### Validation strategy

- Unit tests use injected clocks, deferred promises, fake execution outcomes, and no sleeps.
- Integration tests exercise authenticated 202/400/409/503/404 paths, persistence/recovery, exact accounting, and absence of student/score/socket mutations.
- Frontend store tests use fake timers for polling; page tests mount real Pinia/Vuetify and mock only the typed API module.
- The ordinary automated suite mocks Piston. The opt-in deployment validation in [quickstart.md](quickstart.md) is the oracle for real compilers, TLE/MLE/OLE, and the 100-job run.
- Existing unrelated flaky backend tests are evaluated with isolated reruns and baseline evidence; all new singletons expose reset/settle and are cleaned in test hooks.

## Risks and Mitigations

- **Piston transport cannot be aborted through `piston-judger@0.2.0`**: deadline stops admission and freezes a non-success report, but the real execution promise remains inside the shared limiter until it settles. A draining lease blocks another deploy test. Upstream transport timeout/AbortSignal support is a follow-up; the plan does not fake cancellation.
- **Configured admin secret is currently wired under a different environment name in Compose**: align Compose with the middleware's `ADMIN_TOKEN` as a scoped security prerequisite and add a deployment/config regression test before exposing the resource-intensive endpoint.
- **Resource probes vary by runtime/container**: fixtures are server-owned, explicit about applied limits, and validated against the real deployed Piston in quickstart; raw results remain visible when observed behavior differs.
- **Benchmark contamination**: atomically exclude student judging, avoid per-job database writes, and measure deploy-local concurrency rather than resetting global instrumentation.
- **Dirty frontend worktree overlap**: consume the existing `frontend/src/api/backend-url.ts`; do not overwrite or reformat the user's modified `judge-settings.ts`, `judging.ts`, or untracked tests. Any necessary adjustment is minimal and additive after reviewing the live file.

## Complexity Tracking

No constitution violations require justification.
