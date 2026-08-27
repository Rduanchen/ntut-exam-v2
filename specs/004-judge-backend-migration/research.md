# Phase 0 Research: Judge Backend Migration

**Feature**: 004-judge-backend-migration
**Date**: 2026-08-27

## Source Survey — findings beyond the specification input

| # | Finding | Evidence | Bearing |
|---|---------|----------|---------|
| S1 | **The judging query does not filter by status, despite a comment saying it does.** The comment reads "Query Pending submissions for the given testId", but the clause is `{ testId }` with no status condition — every submission for that student is re-judged on every trigger, graded ones included. | `backend/src/services/judger.service.ts` step 2 | Multiplies load by the number of already-graded questions. Directly worsens the saturation this feature exists to prevent. |
| S2 | **`Submission.status` is an unconstrained string.** Four values are in use and nothing prevents a fifth appearing by typo; no compile-time guard, no database constraint. | `backend/src/models/submission.model.ts` — `@Column({ type: DataType.STRING, defaultValue: "Pending" })` | This feature adds a state (FR-005). Adding it to an untyped string is how states silently multiply. Constitution I. |
| S3 | **Re-submitting does not reset judging state.** `upsertSubmission` writes new code but leaves `status` and `autoScore` untouched, so a student who resubmits after grading keeps the old status **and the old score** until re-judged. | `backend/src/services/code-storage.service.ts` — the upsert sets no status | Pre-existing, and adjacent: this feature reworks the status lifecycle. Recorded, not silently fixed — see Scope note below. |
| S4 | **The TA's re-judge action calls an endpoint that does not exist.** The frontend posts to `/admin/judger/rejudge`; the only route mounted is `POST /judge/:testId`. The call 404s, the catch swallows it into an error field, and the follow-up refresh is skipped. | `frontend/src/stores/score.store.ts` vs `backend/src/routes/admin/admin-judger.route.ts` | A user-visible dead button, in the exact API this feature rewrites. See Scope note. |
| S5 | **The dead constants live in a module that is still needed.** `CPU_TIME_LIMIT_MS`, `WALL_TIME_LIMIT_MS` and `MEMORY_LIMIT_KB` have no readers, but the module also exports `checkPistonServer` (used at startup) and `CONFIG.languages` (used to build the language enum in the config schema). | `backend/src/constants/piston.config.ts`; importers in `src/index.ts` and `src/schemas/config.schema.ts` | FR-021 removes the fields, not the module. |
| S6 | **A health check already exists but reports only to the log.** `checkPistonServer()` runs at startup and writes success or failure to the logger, returning nothing. | `backend/src/constants/piston.config.ts` | FR-018 is a small extension of something already present, not new machinery. |
| S7 | **All admin routes already sit behind `verifyAdminToken`.** | `backend/src/routes/admin/index.ts` mounts the middleware before every sub-router | Confirms the specification's assumption: new settings and health endpoints inherit authorisation. |
| S8 | **`triggerScoreUpdateEvent` serialises its whole argument into the log** and is typed `any`. Today it is called with a bare `testId`, so nothing leaks. | `backend/src/sockets/socket.service.ts` | One future caller passing a result object would log student output — the same defect class fixed upstream in feature 003. Worth narrowing the type while nearby. |
| S9 | **Two layers of test mock must move together.** `test/setup.ts` installs a global `piston-judger` mock; `test/unit/services/judger.service.test.ts` overrides it per scenario. | both files | Contract change breaks both. |

### Scope note on S3 and S4

Neither is in the specification. Both sit inside code this feature rewrites, and S4 is a broken button a TA can press today.

**Recommendation**: fold S4 in — the missing route is a few lines over machinery this feature builds anyway, and shipping a rewritten judging API while leaving its own caller 404ing would be odd. **S3 is a genuine behaviour change to grading** (a resubmission would invalidate a standing score) and should be a deliberate decision, not a side effect. Raised for the maintainer; not planned here.

---

## D1 — Where the concurrency ceiling lives, and what implements it

**Decision**: A module-level singleton limiter wrapping **the individual execution call**, implemented with **`p-limit`, upgraded to v7**. A thin local module owns the singleton, the clamp, and the settable ceiling.

> **This decision was reversed.** An earlier draft proposed dropping `p-limit` for a hand-written semaphore, on the belief that no usable version exposed a runtime-settable ceiling to a CommonJS build. That belief was not tested. It is wrong, and the evidence is below.

**Rationale**:

- **Placement** (unchanged): wrapping the execution call is what makes FR-007 true regardless of how callers above it batch or parallelise. Wrapping a submission or a request makes the ceiling depend on caller shape — the present one-request-to-one-execution ratio is a coincidence of a sequential inner loop, and any future parallelisation of test cases silently removes the protection.

- **`p-limit@7` already implements exactly what FR-008 needs.** It exposes `concurrency` as a getter/setter, and raising it drains the queue immediately rather than waiting for in-flight work to finish (`index.js`, the `Object.defineProperties` block). That is better than the instance-swap workaround the earlier draft was trying to avoid, and better than a first attempt at a hand-written one.

- **Its being ESM-only is not a blocker on this runtime.** Node supports `require()` of an ES module from CommonJS since v20.19, so the backend's existing CommonJS build consumes it unchanged.

**Verified, not assumed** — every claim above was executed:

| Check | Result |
|-------|--------|
| `p-limit` v4+ is `type: module` | Confirmed — v3.1.0 is CJS, v4/v5/v6/v7 are ESM |
| v7 exposes a settable `concurrency` | Confirmed in source and at runtime; setter also drains the queue |
| TypeScript resolves its types under the backend's **existing** `moduleResolution: "node"` | Confirmed — node10 resolution falls back to the package root's `index.d.ts`, which v7 has. **No tsconfig change needed.** |
| The emitted CommonJS actually runs | Confirmed on Node **20.20.2** and **24.19.0** |
| Lower bound | **Node 20.18.0 fails** with `ERR_REQUIRE_ESM`. The boundary is v20.19. |

**Consequence — a deployment constraint this introduces**: `Dockerfile` pins `node:20-alpine`, a **floating tag**. It resolves to the newest 20.x at build time, which satisfies the requirement today, but nothing records that it must. A rebuild against an older 20.x would fail at startup with a module-loading error that looks nothing like its cause.

Therefore this decision carries two obligations:
1. Declare `engines: { "node": ">=20.19.0" }` so the constraint is checkable rather than folklore.
2. Pin the base image to an explicit version rather than a floating major.

This is the same gap the knowledge base already records as an open item in `knowledge/draft/全專案環境標準化.md` — no `engines`, no `.nvmrc`, no pinned runtime. This feature is the first thing to actually depend on a minimum version, which turns that draft from tidiness into a correctness requirement.

**Alternatives considered**:
- *Hand-written semaphore* — **rejected**, and it was the earlier proposal. It replaces a maintained, tested implementation with roughly thirty lines that must reproduce queue draining on raise, fairness, and error propagation. The only argument for it was a runtime constraint that does not exist.
- *Stay on `p-limit@3.1.0` and rebuild the limiter on change* — rejected. In-flight and queued work would straddle two limiters, so the combined ceiling would be briefly exceeded exactly when an operator is reacting to overload.
- *Stay on v3 and require a restart to change the ceiling* — rejected; fails FR-008, and a settings page that silently needs a restart is worse than no settings page.

## D2 — Where retries happen

**Decision**: Retry the **individual execution**, not the whole submission, and route retries through the same limiter.

**Rationale**: A submission has many test cases; a system failure usually affects one. Retrying the whole submission re-runs every passing case, multiplying load precisely when the machine is already saturated. Per-execution retry also gives the natural reading of the mixed-failure edge case: each test case gets its own verdict, and the submission's outcome is a system failure only if a system-attributed verdict survives its retries.

Retries must pass through the limiter, otherwise a burst of retries bypasses the ceiling at the worst moment.

**Alternatives considered**: *Submission-level retry* — simpler, rejected for the load multiplication above. *No retry, surface immediately* — rejected: FR-003, and a transient spike is exactly what a retry is for.

## D3 — The submission state for an unjudgeable submission

**Decision**: Replace the existing `"Error"` state with `"SystemError"` and define the whole set as a typed union. Do not add a fifth state.

**Rationale**: The current `"Error"` is written in one place — the catch around a failed judging attempt — which *is* a system failure. It already means what FR-005 needs; it is simply named as though it were the student's. Renaming and typing the set gives the required distinguishable state without growing the state machine, and the type turns S2's unconstrained string into a compile-time guard.

**Migration**: existing rows holding `"Error"` are historical. The exam database is reset per exam, so the practical risk is low; a startup normalisation covers any that remain.

**Alternatives considered**: *Add `"SystemError"` alongside `"Error"`* — rejected; two states meaning the same thing is how a state machine rots. *Reuse `"Pending"`* — rejected; indistinguishable from never-judged, defeating FR-005 and SC-005.

## D4 — Asynchronous judging and job tracking

**Decision**: Accept-and-acknowledge with a job handle; an in-memory job registry holding state and outcome counts; completion announced on the existing live-update channel; status queryable by handle. Job state is not durable.

**Rationale**: Durability is unnecessary because the submissions themselves are the durable record — a lost job record costs a status query, not a result. FR-012's startup recovery (returning in-flight submissions to a re-judgeable state) covers the interrupted case more simply than persisting partial progress, and re-judging is idempotent.

**Consequence — an API break**: the trigger currently returns results in its response body, and the frontend returns that body to its caller. After this change it returns a handle. The frontend must migrate; this is a dependency of feature 005, and is listed in the plan's risks.

## D5 — Preventing overlapping judging for the same student

**Decision**: Track in-flight work by student. A second request for a student already being judged returns the existing handle rather than starting a second run.

**Rationale**: Returning the existing handle is idempotent and is what a TA double-clicking actually wants. Rejecting the request would surface an error for a harmless action; queueing a second identical run would waste the capacity this feature is trying to protect. Two concurrent runs for one student would also interleave writes to the same submissions and the same scoreboard row.

## D6 — Configuration resolution and provenance

**Decision**: Judging settings live inside the exam configuration, so a configuration upload replaces them wholesale. Effective values resolve as stored configuration → environment (first-run seed only) → documented defaults, and each effective value is reported with its origin.

**Rationale**: The deployment model was settled in `knowledge/history/確立考卷即機器完整設定.md` — one file fully defines one machine — and full replacement follows from it directly. Declaring the new fields optional with defaults in the existing validation makes FR-015 fall out for free: an absent field yields the default rather than the previous value, with no merge logic to get wrong.

Provenance (FR-016) exists so an operator can tell "10 seconds because nobody chose" from "10 seconds because someone measured". Without it, a default and a deliberate value are indistinguishable, which is how the original silent compile allowance stayed invisible.

**Environment as seed only**: making the environment override stored configuration would produce "I changed it in the interface and nothing happened", which is worse than either rule alone.

## D7 — Ceiling validation

**Decision**: Clamp to a valid range at the point of resolution and record that clamping happened; never treat an invalid value as unlimited.

**Rationale**: FR-019. The failure mode being guarded is a zero or negative ceiling being read as "no limit" — silently restoring the exact unbounded behaviour this feature removes, while the configuration claims a limit is in force.

## D8 — Health reporting

**Decision**: Extend the existing startup check into a queryable report of reachability plus installed languages, reusing the library's runtime catalogue.

**Rationale**: SC-008 — an operator should learn before an exam that a language is missing. The catalogue is already fetched and cached with a TTL by the library, so this adds a reporting surface rather than a new mechanism. The measurement that started this work also revealed the local instance had only the gcc family installed, with no Python, Java or JavaScript — precisely the condition this makes visible.

## D9 — Deployment configuration

**Decision**: Give the execution backend the isolation settings its documentation requires, its own capacity ceiling, and resource limits; document both the settings and the concurrency-sweep method for choosing them.

**Rationale**: A backend ceiling is a second line of defence with a different failure mode from the application's: the application's ceiling limits what is *sent*, while the backend's makes excess *queue* rather than be admitted and time out together. Queue wait does not count against the compile allowance, which converts the measured cliff into backpressure. Documenting the sweep matters more than the numbers, since the right value is a property of each machine.

## Open items carried to `/speckit-tasks`

None blocking. Two findings await a maintainer decision (S3, S4); S4 is recommended for inclusion and is small, S3 is a grading-behaviour change and is not planned here.
