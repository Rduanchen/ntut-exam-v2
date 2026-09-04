# Phase 0 Research: Judger Deploy Test

## Decision 1: Run synthetic probes below the student workflow

**Decision**: Add a dedicated deploy-test runner and call a shared low-level execute-and-judge primitive. Do not call the student judging endpoint, `judgeStudentSubmissions`, or `JudgeQueueService`.

**Rationale**: Student judging reads and mutates submissions and scoreboards and emits score updates. Deploy probes must be fixed server-owned inputs with no student identity or grading side effects. The reusable boundary is the current limiter-protected execution loop, not the database orchestration around it.

**Alternatives considered**:

- Self-HTTP/autocannon against the student endpoint: rejected because it needs fabricated students and mutates exam truth.
- Browser-to-Piston requests: rejected because they bypass admin authentication, effective settings, attribution, and the global limiter.
- Reuse `JudgeQueueService`: rejected because its identity is `testId`, its durable result is the submission, and it has no progress, report, or interrupted lifecycle.

## Decision 2: Share a typed execution primitive and preserve attempts

**Decision**: Extract the current execute → judge → system-retry loop into `JudgeExecutionService`. Every attempt supplies compile/run limits explicitly and enters `withExecutionSlot`. Student judging consumes its final verdict; deploy testing additionally records bounded attempt summaries.

**Rationale**: This is the smallest boundary that proves the deployed production semantics while keeping student data out. Reading attribution before status remains mandatory. A system-attributed attempt recovered by retry stays visible and prevents an overall deploy-test pass.

**Alternatives considered**:

- Duplicate execute/judge logic in the deploy runner: rejected because verdict and retry behavior would drift.
- Call the private student `runTestCase`: rejected because it is not an independent contract and does not expose attempt evidence.
- Disable retries for deploy probes: rejected because the goal is to exercise the production execution policy; attempts solve the risk of retries hiding transient infrastructure failure.

## Decision 3: Use fixed probes and the package's real OLE contract

**Decision**: Use immutable server-owned fixtures: stdin/output AC probes for C, C++, and Python; invalid C for CE; deterministic failing C for RE; infinite-loop C for TLE; allocation-and-touch C for MLE; continuous-output C for OLE followed by a health check. Resolve runtime name/version from the live catalogue and pass the observed exact version.

**Rationale**: Installed `piston-judger@0.2.0` defines AC, WA, TLE, MLE, OLE, RE, CE, CTLE, and SE, with OLE mapped from Piston run status `OL`. Piston's output cap is container-wide rather than an execute option, so the probe validates the deployed cap. Diagnostics use the existing 5,000-character application cap and concurrency samples retain at most 10 errors.

**Alternatives considered**:

- Invent an OLE-like result from truncation: rejected because the installed contract already reports OLE and invented verdicts destroy attribution evidence.
- Accept runtime constants and pinned versions: rejected because deployment verification must test what is actually installed.
- Accept source code from the browser: rejected because this is a fixed operational gate, not an arbitrary code runner.

## Decision 4: Persist one latest run and interrupt on restart

**Decision**: Store a strictly validated `DeploymentTestRun` document under a protected singleton `system_settings` key. Persist admission, lifecycle/phase checkpoints, throttled progress, and the terminal report. On boot, convert `queued` or `running` to terminal `interrupted` with reason `process_restart`; never resume partial work.

**Rationale**: Browser reload and server restart must not turn incomplete evidence into success. Unlike student queue handles, the deploy report itself is the only durable evidence. Latest-only storage matches the explicit exclusion of permanent history and avoids a new report table.

**Alternatives considered**:

- Memory only: rejected because a restart loses the report and cannot explain an abandoned run.
- Dedicated history table: rejected as unnecessary retention and schema surface.
- Filesystem JSON: rejected because SQLite already supplies the deployment's atomic persistence boundary.
- Persist every job/output: rejected because it changes the workload being measured and creates an output-pressure hazard.

## Decision 5: Atomically isolate deploy and student judging work

**Decision**: Add a process-wide `JudgingWorkCoordinator`. Student jobs hold student leases; deploy admission succeeds only with no student lease and no deploy/draining lease. New student or deploy requests receive a clear conflict while the other category owns admission. Leases release in `finally`.

**Rationale**: Checking the limiter's active count is not atomic and does not include student work waiting above the resource call. Mixed work contaminates the deploy measurements and can steal exam capacity. The coordinator controls admission; the limiter independently controls the scarce Piston resource.

**Alternatives considered**:

- Check `inFlightCount()`/`queuedCount()` once: rejected because of the check-then-start race and incomplete visibility.
- Allow both categories to share the limiter: safe from raw overload but invalid as a reproducible deployment measurement.
- Give deploy work its own limiter: rejected because the combined concurrency could exceed the real ceiling.

## Decision 6: Incremental workers and explicit measurement semantics

**Decision**: Dispatch work from a bounded incremental worker pool. Default submitted-concurrency levels are the unique ascending values `[1, activeCeiling, min(2 × activeCeiling, 64)]`; default concurrency work is 100 jobs total. Server bounds are 1..64 per level, at most 8 levels, 1..500 total jobs, and a 60,000..1,800,000 ms deadline (default 900,000 ms). These numbers are pragmatic safety defaults, not knowledge-backed capacity claims.

Jobs are divided deterministically: each selected level receives `floor(jobCount / levelCount)`, and the first `jobCount mod levelCount` ascending levels receive one additional job. This keeps total accounting exact without silently multiplying `jobCount` by the number of levels.

Each job records enqueue, slot-acquired, and finish times. Reports distinguish submitted concurrency, deploy-local observed peak execution concurrency, queue delay, execution duration, and end-to-end latency. Percentiles use nearest-rank on sorted samples. Higher levels receive a warning when p95 is at least 2× the preceding level or throughput falls at least 20%; any infrastructure failure, missing job, timeout, or failed post-check makes the overall outcome failed.

**Rationale**: A bulk `Promise.all` would enqueue work that cannot be withdrawn after an exam transition. Average latency hid the historical cliff, so p50/p95/p99/max and exact accounting are all required. A submitted level above the active ceiling validates safe queueing without bypassing the ceiling.

**Alternatives considered**:

- Cap submitted concurrency at the active ceiling: rejected because it cannot verify excess requests queue safely.
- Use/reset the limiter's process-global peak: rejected because unrelated work can contaminate it.
- Automatically set a recommended ceiling: rejected because this feature reports evidence and must not mutate configuration.

## Decision 7: Double-gate exam activation and preserve real limiter occupancy

**Decision**: Reject admission only when the durable exam state is `IN_PROGRESS`. During a run, stop dequeuing when the exam becomes active and re-check immediately after acquiring a global slot before contacting Piston. Already executing calls settle; the report becomes interrupted and completed evidence is retained.

A test deadline stops new work, freezes terminal accounting, and ignores late completions. Because `piston-judger@0.2.0` exposes neither an AbortSignal nor transport timeout, the original execution promises remain tracked inside their real limiter slots until they settle. A draining lease prevents another deploy test during that period.

**Rationale**: A start-only check leaves a race while work queues. Conversely, `Promise.race` followed by early slot release would make safety accounting lie while Piston still runs. UNINITIALIZED, NOT_STARTED, and FINISHED remain valid preparation states.

**Alternatives considered**:

- Couple `ExamStateService.changeState` directly to the deploy runner: rejected in favor of state checks at the admission/resource boundaries.
- Release the slot at deadline: rejected as a direct violation of the global ceiling.
- Fully cancel transport: not available through the installed dependency; upstream AbortSignal/transport-timeout support is a follow-up risk.

## Decision 8: Poll backend-authoritative state inside the Judge page

**Decision**: Keep `/judge` as the only route and add Settings/Deploy Test tabs. Use a separate typed API module and Pinia store. After admission or restoration, recursively poll one second after each completed request, stop on terminal state/unmount, and use a generation token to ignore stale responses. Export the exact displayed terminal report as a JSON Blob.

**Rationale**: Polling meets the 2/5-second targets, survives dropped notifications and reloads, and avoids a new socket contract. Separate state keeps the already-large settings store and route view cohesive. Backend data remains authoritative; localStorage would preserve stale deployment evidence.

**Alternatives considered**:

- Socket plus polling fallback: rejected for v1 because polling already satisfies recovery and freshness requirements.
- Timer/network work in Vue components: rejected because it couples presentation to lifecycle and violates the established Pinia boundary.
- New route: rejected by the explicit same-page requirement.
- Download from a second export request: rejected because it can diverge from the report currently displayed.

## Decision 9: Test with mocks routinely and real Piston explicitly

**Decision**: Automated tests mock the execution engine but preserve real enums/types. Unit tests use injected clocks and deferred promises; integration tests use authenticated in-process HTTP and SQLite; frontend tests use fake timers and API spies. Add frontend coverage tooling for new executable files. Real C/C++/Python, resource verdicts, and the 100-job sweep are an opt-in deployment validation documented in quickstart.

**Rationale**: The ordinary test setup intentionally prevents live sandbox calls. Real resource behavior is machine-dependent and belongs on the deployed target, while state, attribution, accounting, races, and UI behavior must stay deterministic in CI. All singletons expose `reset()` and `settle()` to avoid worsening the known suite flakiness.

**Alternatives considered**:

- Run real Piston in every unit/CI run: rejected as slow, environment-dependent, and incapable of deterministic resource verdicts.
- Use sleeps for async tests: rejected because they create exactly the timing flakiness already present.

## Decision 10: Correct admin-token deployment wiring as a prerequisite

**Decision**: Align Docker Compose with the middleware's `ADMIN_TOKEN` setting and regression-test the configured token path before exposing the deploy-test start operation.

**Rationale**: Compose currently supplies `ADMIN_SECRET`, while the middleware reads `ADMIN_TOKEN` and otherwise falls back to a known default. The new endpoint deliberately consumes substantial resources; relying on an ignored configured secret violates the existing admin-auth assumption and the security gate.

**Alternatives considered**:

- Leave the mismatch as unrelated debt: rejected because the endpoint's authorization would not use the deployment's configured secret.
- Introduce a new authorization model: rejected; this feature reuses and repairs the existing administrative guard only.

## Resolved Unknowns and Residual Risk

All planning clarifications are resolved. One implementation risk remains explicit rather than hidden: a permanently hung Piston HTTP request can retain a global limiter slot and the deploy draining lease because the installed client cannot abort transport. The safe behavior is to expose draining/non-success state and never release capacity early. Full cancellation requires an upstream client capability and is not silently simulated in this feature.
