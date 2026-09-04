# Quickstart: Validate Judger Deploy Test

This guide validates feature 006 after implementation. Automated tests prove lifecycle and contracts with deterministic execution doubles; the final section is the required oracle against the real deployed Piston container.

## Prerequisites

- Node.js satisfies `backend/package.json` (`>=20.19.0`).
- Workspace dependencies are installed with pnpm.
- Docker Compose services are built and running.
- The administrative token is configured through `ADMIN_TOKEN` and is available to the browser/operator.
- Piston has C, C++, and Python runtimes installed before expecting a fully passing report.
- Exam state is not `IN_PROGRESS` and no student judging run is active.

The implementation must follow [deploy-test-api.yaml](contracts/deploy-test-api.yaml), [judge-page.md](contracts/judge-page.md), and [data-model.md](data-model.md).

## 1. Static and automated verification

From the repository root:

```bash
pnpm --filter backend run lint
pnpm --filter backend run test
pnpm --filter backend run build
pnpm --filter frontend run typecheck
pnpm --filter frontend run test
pnpm --filter frontend run build
```

Run the feature coverage commands added during implementation and confirm every newly introduced executable file meets the constitution's line-coverage gate. The ordinary test suite must not require a live Piston server.

Expected automated evidence:

- Strict profile validation rejects unknown keys, invalid bounds, duplicates, unsorted levels, and impossible phase combinations.
- Authenticated start returns immediately and background work remains retrievable.
- Student judging and deploy-test leases are mutually exclusive under races.
- An `IN_PROGRESS` exam rejects start and interrupts admission of later work.
- Deadline/restart produces interrupted, never passed, evidence.
- Late promises do not mutate a frozen report or release limiter accounting early.
- Every requested concurrency job lands in exactly one accounting bucket.
- No deploy test creates or modifies a submission, scoreboard row, or score socket event.
- Frontend polling never overlaps, stale responses cannot replace a newer run, and all terminal states stop polling.
- Settings and Deploy Test remain independent within the same `/judge` page.

Because the repository has known pre-existing test flakiness, investigate a full-suite failure by rerunning the affected file in isolation and comparing against baseline behavior. Do not use repeated retries to excuse a deterministic failure in a new feature test.

## 2. Start the deployed stack

Use the normal deployment configuration:

```bash
docker compose up -d --build
docker compose ps
```

Confirm the general backend and Piston catalogue are reachable:

```bash
curl --fail http://localhost:3000/health
curl --fail -H "x-admin-token: $ADMIN_TOKEN" http://localhost:3000/admin/judger/health
```

Expected:

- Backend health is UP.
- Judger health reports `reachable: true`.
- Runtime catalogue includes compatible C, C++, and Python entries for a full-suite pass.

## 3. Inspect authoritative deploy-test defaults

```bash
curl --fail \
  -H "x-admin-token: $ADMIN_TOKEN" \
  http://localhost:3000/admin/judger/deploy-tests/profile
```

Expected:

- `activeCeiling` matches the currently enforced judge setting.
- Defaults contain smoke, verdict, and concurrency phases.
- Derived levels are unique, ascending, and include a level above the active ceiling when the ceiling is below 64.
- `jobCount` is 100 and all values are within returned bounds.

## 4. Validate the complete workflow from the Judge page

Open `http://localhost:5173/judge` in an authenticated administrative browser.

1. Confirm the existing **Settings** tab still works.
2. Open **Deploy Test** without changing route.
3. Review phases, fixed language scope, concurrency levels, job count, deadline, and active ceiling.
4. Start the default test and confirm the warning/confirmation first.
5. Observe queued/running phase and completed/total progress.
6. Reload the page while running; confirm the active run reappears within 5 seconds.
7. Wait for terminal state and inspect the report on the same page.
8. Export JSON and confirm its run ID, outcome, snapshots, probes, and concurrency summaries match the displayed object.

Expected healthy result:

- C, C++, and Python AC smoke probes pass.
- CE, RE, TLE, MLE, and OLE match both expected status and `submission` attribution.
- No system-attributed attempt is hidden by a retry.
- Post-OLE health succeeds.
- At least 100 concurrency jobs are accounted with no missing or timed-out job.
- Observed peak execution concurrency never exceeds active ceiling.
- Each level shows throughput and p50/p95/p99/max end-to-end latency.
- No navigation away from `/judge` is required.

## 5. Validate controlled failure paths

Run these separately; restore the healthy deployment between scenarios.

### Missing runtime

Use a Piston deployment without Python, then run smoke/verdict phases.

Expected: Python is blocked by name; available C/C++ probes still run; overall outcome is not passed.

### Piston unavailable before start

Stop Piston before pressing Run.

Expected: start is refused, no partial run replaces the previous latest report, and the reason remains visible on the Judge page.

### Exam becomes active

Start a sufficiently long concurrency phase, then change exam state to `IN_PROGRESS`.

Expected: no new Piston work is admitted after the resource-boundary check, already executing work settles, completed evidence remains, and terminal outcome is interrupted with `exam_started`.

### Competing student judging

Hold a student judging lease and attempt deploy start; then hold deploy admission and attempt student judging.

Expected: the second category receives a clear conflict in both directions; no mixed measurement occurs.

### Browser disconnect

Close the page during a run, wait briefly, and reopen `/judge`.

Expected: backend work continues and the current/latest report restores; local browser state is not treated as truth.

### Backend restart

Restart the backend during a run.

Expected: startup recovery marks the persisted nonterminal run interrupted with `process_restart`; it is never resumed or labelled passed.

## 6. Validate deadline and draining behavior

Use an execution double in automated integration, or a controlled network fault in a disposable deployment, that leaves an execution promise unresolved past the run deadline.

Expected:

- The report freezes as non-success and unfinished jobs are accounted.
- Late completion cannot modify the frozen report.
- The operational envelope reports draining.
- A second deploy test is refused while draining.
- The shared limiter slot remains occupied until the real promise settles; the system never pretends cancellation occurred.

This scenario documents the installed client's lack of transport abort support. Do not perform an indefinite network hang on a production exam machine.

## 7. Verify no student-data side effects

Capture submission and scoreboard counts/content immediately before and after a real deploy test, and observe the admin socket.

Expected:

- Counts and content are identical.
- No submission changes to `Judging`, `Pending`, `SystemError`, or a verdict state.
- No score-update event is emitted for synthetic work.
- The only durable change is replacement of the protected latest deploy-test document.

## Exit criteria

The feature is ready only when:

- All static, unit, integration, component, and coverage gates pass.
- The real deployed C/C++/Python and CE/RE/TLE/MLE/OLE probes match.
- The 100-job report has exact accounting and respects the active ceiling.
- Reload/export work entirely within `/judge`.
- Interruption, restart, and unavailable-Piston cases remain explicit non-success states.
- Student data and student-facing events remain unchanged.

## Implementation validation record — 2026-09-02

Automated verification was run with Node 22.23.2 and pnpm/Vitest 4.1.8:

- Backend `typecheck:test`, coverage, and build passed. The final full run passed 49/49 files and 345/345 tests; new feature executable files reached 290/290 lines (100%). An earlier full-suite run had one `user-log.controller.test.ts` socket-hang-up; its immediate isolated rerun passed 4/4, and the final full run also passed it.
- Frontend typecheck, coverage, and production build passed. Coverage ran 10/10 files and 53/53 tests; selected new API/store/download executable files reached 94/94 lines (100%).
- Repository-wide backend lint still reports the existing baseline (30 errors and 195 warnings in legacy files). A focused lint run over every new deploy-test backend file passed with no findings.
- Vue component tests verify same-route tabs, confirmation, progress, refusal, result tables, restore, interruption, and exact-export orchestration. The in-app browser runtime was unavailable in this environment, so no claim of an interactive-browser click-through is made.

Real deployment used `ntut-backend`/`ntut-frontend` containers and the already-running Piston at `host.docker.internal:2000`. Its catalogue initially contained only C/C++; Python 3.12 was installed through Piston's package API. The backend's stored compile timeout was set to 10,000 ms to match that stock Piston server; Compose now explicitly gives its managed Piston a 30,000 ms compile cap.

Measured complete run `ff836f44-90ac-4211-9edf-51b478aeac74` finished 109/109 with lifecycle `completed` and outcome `warning` (the submitted level 8 intentionally exceeded active ceiling 4 and queued safely):

| Evidence | Result |
|---|---|
| Smoke | C 10.2, C++ 10.2, and Python 3.12 all AC / submission |
| Verdict probes | CE, RE, TLE, MLE, and OLE all matched / submission |
| Post-OLE | AC / submission |
| Level 1 | 34/34, peak 1, infra 0, missing 0; p50 483 ms, p95 515 ms, p99/max 518 ms; 2.07 jobs/s |
| Level 4 | 33/33, peak 4, infra 0, missing 0; p50 660 ms, p95 704 ms, p99/max 736 ms; 5.71 jobs/s |
| Level 8 | 33/33, peak 4, infra 0, missing 0; p50 1,320 ms, p95 1,351 ms, p99/max 1,352 ms; 5.69 jobs/s |

The MLE probe exposed a real sandbox boundary: Piston killed the process with code 137 at 33,552,000 bytes, 2,432 bytes below its nominal 32 MiB limit. The probe therefore enforces 32 MiB in Piston and uses a 64 KiB attribution tolerance when judging the returned measurement; this preserves a genuine sandbox kill instead of mislabelling it RE.

Additional deployed failure-path evidence:

- Starting a 500-job run and restarting `ntut-backend` produced run `0ba55094-df3e-4c6b-8361-21b753fe1559` as `interrupted / process_restart`; it was not resumed or labelled successful.
- Recreating the backend against unused port 29999 made start return HTTP 503 with `piston_unreachable`, while preserving the previous latest report. The healthy Piston URL was then restored.
- A 500-job, 60-second run reached 117/500, froze as `interrupted / deadline_exceeded`, exposed `draining: true` until admitted executions settled, and later returned `draining: false`. Before/after API snapshots showed byte-equivalent student submission and scoreboard data, with no synthetic student records.
- API retrieval of the active run and automated store remount tests cover reload/latest restoration; restart recovery and exact JSON export are independently covered as above.

After adding frozen partial accounting, deployed run `6d10ee27-95a1-4e1a-b3fb-ec61bd928302` repeated the deadline scenario: 118 completed, 0 missing, and 382 interrupted equals all 500 requested jobs; peak execution remained 1 under ceiling 4. Queue p50/p95/p99/max was 0/0/0/1 ms and execution p50/p95/p99/max was 505/519/525/529 ms. The terminal object remained frozen after drain completion.

Final contract audit found: all deploy endpoints inherit admin authentication; request and persistence objects are strict/typed and server-bounded; diagnostics and sampled errors are capped; every concurrency row satisfies `completed + missing + interrupted = requested`; terminal persistence ignores late work; deploy and student activity use mutually exclusive leases and the same execution limiter; synthetic work never enters student repositories or sockets; and the UI keeps run controls/results on `/judge`. The pre-existing dirty frontend API/test edits were preserved and only extended to share the backend URL or mock the new independent deploy domain.
