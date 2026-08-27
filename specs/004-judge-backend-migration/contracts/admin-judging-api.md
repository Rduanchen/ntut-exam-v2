# Contract: Admin Judging & Settings API

**Feature**: 004-judge-backend-migration
**Contract type**: HTTP endpoints under the existing admin prefix
**Authorisation**: inherited from the admin router's existing token middleware (research S7) — no new scheme
**Breaking**: yes, on the judging trigger. See Migration.

## Endpoints

### Start judging — **breaking change**

`POST /admin/judger/judge/:testId`

Accepts a judging request and returns immediately with a handle. **Does not wait for judging to finish.**

- Optional body: a list of question ids to restrict the run.
- Responds **202 Accepted** with a job handle and its initial state.
- If the student is already being judged, responds with the **existing** handle rather than starting a second run (FR-013).
- Responds within one second regardless of queue depth (SC-003).

| Was (v0) | Is (v1) |
|----------|---------|
| 200, body carries the full results, request held open for the whole run | 202, body carries a handle, results arrive via the live-update channel or by querying |

### Re-judge

`POST /admin/judger/rejudge`

Body carries the student id. Same semantics and same response shape as the trigger above.

> **This endpoint does not exist today, and the TA-facing re-judge action already calls it** (research S4). The call 404s and the error is swallowed, so the button silently does nothing. Included because the missing route is a few lines over machinery this feature builds regardless.

### Query judging work

`GET /admin/judger/jobs/:jobId`

Reports the job's current state — `waiting`, `running`, `finished`, or `failed` — and, once finished, its outcome counts including system failures reported separately from student failures (FR-010, FR-020).

Responds 404 for an unknown handle. Job records are **not durable**; after a restart a handle is unknown, and the submissions themselves carry the outcome (research D4).

### Read judging settings

`GET /admin/judger/settings`

Reports each effective setting **with its origin** — `config`, `env`, `default`, or `clamped` (FR-016). A value reported as `clamped` means the configured value was outside the valid range and was not honoured.

### Write judging settings

`PUT /admin/judger/settings`

Updates judging settings and applies them immediately, including the concurrency ceiling, with no restart (FR-008, FR-017).

> These settings live inside the exam configuration. **A later configuration upload overrides anything set here.** That is the deployment model, not a defect (FR-015).

### Execution backend health

`GET /admin/judger/health`

Reports reachability and the languages actually installed (FR-018). An unreachable backend is reported as such, not raised as an error.

## Guarantees

### G1 — No student is charged for a system failure
A verdict attributed to the system never contributes to a score and is never recorded as a wrong answer, at any point in the pipeline including after retries are exhausted. *(FR-002, FR-005, SC-001)*

### G2 — Deterministic failures are not retried
A verdict attributed to the submission is never retried. Retrying a deterministic failure only consumes the capacity this feature protects. *(FR-004)*

### G3 — The ceiling is global and enforced at the execution point
Executions in flight against the backend never exceed the configured ceiling, counted across the whole process regardless of how many requests are in flight or how callers batch work. **Retries are subject to it too.** *(FR-006, FR-007, SC-002)*

### G4 — Acknowledgement is immediate
A judging request is acknowledged before judging completes, in under a second, however much work is queued. *(FR-009, SC-003)*

### G5 — Work is never silently lost
Every accepted request reaches a terminal state, and its outcome is retrievable by querying even if the live-update notification is missed. No submission stays in an in-progress state after an interrupted run. *(FR-010, FR-012, SC-007)*

### G6 — Grading trusts the verdict
Grading determines responsibility from the verdict alone — no pre-checks of raw execution responses, no escape-hatch typing. *(FR-001, SC-006)*

### G7 — One configuration file configures one machine
Uploading a configuration replaces judging settings wholesale; absent fields take documented defaults rather than retaining previous values. *(FR-015, SC-004)*

### G8 — An invalid ceiling never means "unlimited"
An out-of-range ceiling is clamped and reported as clamped. *(FR-019)*

### G9 — System failures are visible
Every finished run reports its system-failure count separately, and zero is reported as zero rather than omitted. *(FR-020, SC-005)*

## Migration for API consumers

| Caller | Change required |
|--------|-----------------|
| The student-detail re-evaluate action | The response is now a handle, not results. Await the live-update notification, or poll the job endpoint. |
| The score-view re-judge action | Currently 404s silently. Once the endpoint exists it will work; the same handle-not-results change applies. |

**This is a cross-feature dependency**: the frontend must migrate before the TA-facing flow behaves correctly end to end. Tracked as a risk in `plan.md`.

## Non-guarantees

- **Judging does not get faster.** Every test case still recompiles the submission. The ceiling makes load survivable, not smaller.
- **The backend can still be saturated by anything else sharing the machine.** The ceiling governs this application's executions only.
- **Job history is not retained.** Handles do not survive a restart.
