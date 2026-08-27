# Implementation Plan: Judge Backend Migration

**Branch**: `004-judge-backend-migration` | **Date**: 2026-08-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-judge-backend-migration/spec.md`

## Summary

Feature 003 taught the judging library to say whose failure a verdict was. This feature makes the exam system act on that, and removes the condition that produced the failures in the first place.

Three changes carry the weight. Grading trusts the verdict instead of re-deriving it, so a system-attributed result is retried and never scored. The concurrency ceiling moves from per-request to **global and enforced at the execution call**, which is what makes it hold no matter how callers batch work — the present one-request-to-one-execution ratio is an accident of a sequential inner loop, not a guarantee. And judging becomes asynchronous, because adding a ceiling to a synchronous endpoint only converts a wrong verdict into a held connection.

Around those: judging settings join the exam configuration so one file configures one machine, system failures become countable so an operator can see a sick machine, and the deployment gives the execution backend the isolation and queue its own documentation asks for.

## Technical Context

**Language/Version**: TypeScript on Node.js, compiled to CommonJS.

**Primary Dependencies**: `piston-judger@0.2.0` (feature 003), Express, Sequelize with SQLite, Socket.IO, Zod, **`p-limit` upgraded 3.1.0 → 7.x** for its runtime-settable ceiling (research D1).

**Storage**: SQLite via Sequelize. Submissions and the exam configuration are the durable records; judging job state deliberately is not.

**Testing**: Vitest, with in-memory SQLite and a scripted execution double. Type checking covers `src` and `test` together.

**Target Platform**: A single self-hosted exam machine, rebuilt per exam on inconsistent hardware.

**Project Type**: Web application — this feature is the backend half plus deployment configuration.

**Performance Goals**: Acknowledge a judging request in under a second regardless of queue depth. Throughput is explicitly **not** a goal: every test case still recompiles the submission.

**Constraints**:
- The concurrency ceiling must be changeable at runtime. `p-limit@3.1.0` has no setter; v7 does, and is ESM-only but loadable from CommonJS on **Node ≥ 20.19** (verified: runs on 20.20.2, fails on 20.18.0). This makes a minimum runtime version a correctness requirement, not a preference.
- `Dockerfile` currently pins the **floating** tag `node:20-alpine`, which happens to satisfy that today but records nothing. Must become an explicit pin plus a declared `engines` range.
- The trigger endpoint's response shape changes, and the frontend consumes it — a cross-feature dependency.
- Compile-timeout attribution is decided by the library; this side supplies retry policy, which needs machine state the library does not have.

**Scale/Scope**: Tens of concurrent students, each with tens of test-case executions. Roughly one service rewritten, one controller, four new endpoints, one new limiter module, one configuration module.

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1 design.*

- [x] **Type Safety** — *Initial: FAIL. Post-design: PASS.*
  Execution results are typed `any` throughout the judging service, and `Submission.status` is an unconstrained string with four values in use and no guard against a fifth (research S2). The published contract removes the need for the first; a closed union for the status set removes the second. This feature *adds* a status value, so introducing it into an untyped string would be adding to a known defect.

- [x] **Async & Concurrency** — *Initial: FAIL. Post-design: PASS.*
  The heart of the feature. Today's limiter is constructed per request, so *N* simultaneous requests admit *5N* executions with no ceiling at all — the measured cliff (0% failures at concurrency 20, 23% at 30) is crossed with nothing to stop it. The design makes the ceiling global, enforced at the execution call, applicable to retries, and changeable at runtime; judging becomes asynchronous so backpressure surfaces as queueing rather than as held connections. Verification is explicitly concurrent (quickstart V2): a sequential test would pass with no limiter present.

- [x] **Security & Stability** — *PASS.*
  Attribution is decided by the library from backend-authored fields only, so a submission cannot influence its own verdict. New endpoints inherit the existing admin authorisation (research S7). One adjacent hazard noted while nearby: the score-update notifier serialises its whole argument into the log and is typed `any`; it is called with a bare id today, so nothing leaks, but the type invites the same defect class fixed upstream in 003 (research S8) and is narrowed here.

- [x] **Low Coupling** — *PASS.*
  Concurrency control, retry policy, configuration resolution, and grading become four separable pieces, each testable without the others. Retry policy deliberately stays on this side rather than in the library, because it depends on machine state the library cannot see.

- [x] **Testability** — *PASS.*
  The existing suite already type-checks tests alongside sources. Every scenario in the specification maps to a validation in `quickstart.md`, including the concurrency assertion under simultaneous arrivals.

**Gate result: PASS.** Two principles were failing in existing code; both are addressed by the design rather than waived. Complexity Tracking is empty — no principle is being traded away, and the concurrency ceiling uses a maintained library rather than a hand-rolled one (research D1).

## Project Structure

### Documentation (this feature)

```text
specs/004-judge-backend-migration/
├── plan.md              # This file
├── spec.md              # 6 user stories, 23 FR, 8 SC
├── research.md          # Phase 0 — 9 source findings, 9 design decisions
├── data-model.md        # Phase 1 — 7 entities, status machine, slot rules
├── quickstart.md        # Phase 1 — 10 validations + deployment check
├── contracts/
│   └── admin-judging-api.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 — NOT created by /speckit-plan
```

### Source Code

```text
backend/src/
├── config/
│   └── judge.config.ts          # NEW — resolve settings with provenance; clamp the ceiling
├── constants/
│   └── piston.config.ts         # keep (languages + health probe); delete the 3 dead limit fields
├── services/
│   ├── judger.service.ts        # migrate to the 0.2.0 contract; drop the pre-check and the `any`s
│   ├── judge-limiter.ts         # NEW — owns the p-limit singleton, the clamp, and the settable
│   │                            #       ceiling; wraps the execution call
│   ├── judge-queue.service.ts   # NEW — job registry, one live job per student, outcome counts
│   └── code-storage.service.ts  # research S3 recorded, NOT changed here
├── models/
│   └── submission.model.ts      # status becomes a closed union; "Error" → "SystemError"
├── schemas/
│   └── config.schema.ts         # judgerSettings gains optional fields with defaults
├── controllers/admin/
│   └── admin-judger.controller.ts  # 202 + handle; job status; settings; health; rejudge
├── routes/admin/
│   └── admin-judger.route.ts    # + rejudge, jobs/:jobId, settings, health
├── sockets/
│   └── socket.service.ts        # narrow the score-update payload type (research S8)
└── index.ts                     # startup: return interrupted submissions to Pending

backend/test/                    # update both mock layers (research S9); add concurrency,
                                 # retry, async-flow, config-replacement, health coverage
docker-compose.yml               # isolation settings, tmpfs, packages volume, backend ceiling
Dockerfile                       # pin an explicit Node version (>= 20.19, floating tag today)
backend/package.json             # declare `engines` so the minimum is checkable
README.md                        # recommended settings + the sweep method
```

**Structure Decision**: The existing layered layout (routes → controllers → services → models) is kept. The two new modules exist to make concurrency and job tracking separately testable rather than buried inside the judging service, which is what Constitution V asks for and what makes quickstart V2–V5 possible without standing up HTTP.

## Phase Outputs

| Phase | Artifact | Status |
|-------|----------|--------|
| 0 | `research.md` — 9 source findings, 9 design decisions, 0 unresolved unknowns | ✅ |
| 1 | `data-model.md` — status machine, settings with provenance, job and slot rules | ✅ |
| 1 | `contracts/admin-judging-api.md` — 6 endpoints, 9 guarantees, migration, non-guarantees | ✅ |
| 1 | `quickstart.md` — 10 validations mapped to success criteria | ✅ |
| 2 | `tasks.md` | Run `/speckit-tasks` |

## Risks

| Risk | Mitigation |
|------|-----------|
| **The trigger endpoint's response shape changes and the frontend consumes it.** Until the frontend migrates, the TA flow is worse than before, not better. | Resolved: 004 and 005 ship together, and migrating the two existing callers is in this feature's scope. No release window exists in which the backend has moved and the frontend has not. |
| A concurrency test written sequentially passes with no limiter at all, giving false confidence in the central requirement. | quickstart V2 mandates simultaneous arrivals across independent requests and asserts the observed maximum, not the average. |
| Retries bypass the ceiling and surge exactly when the machine is failing. | Made an explicit rule in the data model and a dedicated validation (V3). |
| A misconfigured ceiling silently restores unbounded concurrency. | Clamping is required, and the clamp is reported as provenance so an operator sees their value was not honoured (V4). |
| The default ceiling is guesswork on unfamiliar hardware. | Default set well below the measured cliff; the documented sweep method is the real deliverable, since the right value is a property of each machine. |
| Renaming the `"Error"` status leaves historical rows behind. | Startup normalisation; the exam database is reset per exam, so exposure is small. |
| The feature is mistaken for a performance fix. | Stated as a non-guarantee in the contract, the spec's out-of-scope section, and quickstart's definition of done. |
| **A rebuild against an older Node 20 breaks startup** with a module-loading error that looks nothing like its cause. The base image tag floats. | Pin the image explicitly and declare `engines: >=20.19.0`, so the constraint fails loudly at install rather than silently at boot. Closes the gap already recorded in `knowledge/draft/全專案環境標準化.md`. |
| A design decision is made from memory rather than measurement. | Happened once here — dropping `p-limit` was proposed on an untested belief about ESM and was reversed after execution. Research D1 now records the commands and their results rather than the conclusion alone. |

## Scope decisions taken by the maintainer

- **S4 — the missing re-judge endpoint: IN SCOPE.** The TA-facing re-judge action posts to a route that was never mounted; the 404 is swallowed and the button silently does nothing. Approved for inclusion 2026-08-27, since it is a few lines over machinery this feature builds anyway. Reflected in the contract.
- **Frontend judging callers: IN SCOPE.** 004 and 005 ship together, so the two existing call sites that consume the trigger's response must move to the handle-and-notify contract as part of this feature. Without them 004 alone leaves the TA flow worse than before. **The judging settings page remains in 005** — this is migration of existing callers, not new UI.
- **S3 — re-submitting does not reset judging state: NOT IN SCOPE.** A student who resubmits after grading keeps the old status *and the old score* until re-judged. Left out deliberately: it changes grading behaviour and deserves its own decision rather than arriving as a side effect. Recorded in research so it is not lost.
