# Feature Specification: Judge Backend Migration

**Feature Branch**: `[004-judge-backend-migration]`

**Created**: 2026-08-27

**Status**: Draft

**Scope**: `backend/`, plus `docker-compose.yml` and `README.md` at the repository root.

**Input**: User description: "後端遷移到 piston-judger@0.2.0 的失敗歸因契約，並讓考試系統在高併發下不再把系統過載轉嫁給學生。... 實測數據：閒置 12 核機器上，Piston 併發 20 時 CE 率 0%、併發 30 時 CE 率 23%，斷崖由編譯階段撞到 10 秒 wall-clock 逾時造成。"

## Context

Feature 003 fixed the judging library and published it. **The production incident is still open**: the backend runs against the old behaviour, so students can still be marked down for a busy machine. This feature closes it, and additionally removes the cause rather than only the misattribution.

Governing constraints from the project knowledge base:
- Derived principle **Fault Attribution Isolation** and `knowledge/concepts/失敗歸因的隔離.md`.
- `knowledge/history/確立考卷即機器完整設定.md` — one JSON file fully defines one exam machine; uploads replace rather than merge.
- `knowledge/draft/piston穩定度與併發問題.md` sections B and D — incident data and settled design.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A student is never marked down for a busy machine (Priority: P1)

When the execution backend is saturated and a submission's compilation is killed, the student's score must be unaffected and the submission must be retried rather than recorded as wrong.

**Why this priority**: This is the open incident. Grading integrity is Root Principle 1. Until this lands, every exam run can silently take marks from students who did nothing wrong.

**Independent test**: Drive judging with an execution backend that reports a system-terminated compile stage; confirm the student's score is unchanged, the submission is retried, and after retries are exhausted the submission is recorded as a system failure rather than an incorrect answer.

**Acceptance Scenarios**:

1. **Given** a submission whose compilation is terminated by the system, **When** it is judged, **Then** the result is recognised as a system failure and the submission is retried automatically.
2. **Given** a submission that keeps failing for system reasons, **When** the retry allowance is exhausted, **Then** it is recorded as a system failure, contributes no score, and is **not** counted as an incorrect answer.
3. **Given** a submission with a genuine compilation error, **When** it is judged, **Then** it is scored as the student's failure and is **not** retried — retrying a deterministic failure only wastes capacity.
4. **Given** any judged submission, **When** the grading service inspects the verdict, **Then** it determines responsibility from the verdict itself, without pre-checking the raw execution response.
5. **Given** an execution backend that is unreachable, **When** judging runs, **Then** it produces a system failure verdict rather than an unhandled error.

---

### User Story 2 - The system queues instead of collapsing under load (Priority: P1)

When many students are judged at once, work must wait for capacity rather than all being admitted and timing out together.

**Why this priority**: Story 1 stops the *misattribution*; this stops the *cause*. Without it the system still degrades under load — just more honestly. Measured behaviour is a cliff, not a slope: 0% failures at concurrency 20 and 23% at 30, so a system with no ceiling crosses from healthy to broken with no warning.

**Independent test**: Request judging for many students simultaneously and observe that the number of executions in flight against the backend never exceeds the configured ceiling, regardless of how many requests arrive.

**⚠️ Must ship together with User Story 3.** Adding a ceiling without making judging asynchronous converts the failure from a wrong verdict into a request timeout. Shipping this alone is a regression.

**Acceptance Scenarios**:

1. **Given** a configured concurrency ceiling, **When** more judging work is requested than the ceiling allows, **Then** executions in flight never exceed the ceiling and the excess waits.
2. **Given** several separate judging requests arriving at once, **When** they run, **Then** the ceiling applies across all of them combined, not per request.
3. **Given** work that has waited for capacity, **When** capacity frees up, **Then** the waiting work proceeds and completes normally.
4. **Given** the ceiling is reconfigured, **When** new work arrives, **Then** the new ceiling takes effect without restarting the system.

---

### User Story 3 - Triggering judging returns immediately (Priority: P1)

A teaching assistant who starts judging gets an immediate acknowledgement and is notified when it finishes, instead of holding an open request.

**Why this priority**: Shares P1 because it is the required companion to Story 2 (see the warning above), not because it is independently urgent.

**Independent test**: Trigger judging and confirm the response arrives immediately with a way to track the work; confirm the interface is notified on completion and that the work's status can be queried while it runs.

**Acceptance Scenarios**:

1. **Given** a request to judge a student's submissions, **When** it is accepted, **Then** the response returns immediately with a handle for the work, before judging completes.
2. **Given** judging is running in the background, **When** it finishes, **Then** the interface is notified through the existing live-update channel.
3. **Given** a handle for judging work, **When** its status is queried, **Then** the current state is reported — waiting, running, finished, or failed.
4. **Given** judging work that fails unexpectedly, **When** its status is queried, **Then** the failure is reported rather than the work appearing to run forever.
5. **Given** the system restarts while judging is in flight, **When** it comes back up, **Then** no submission is left permanently stuck in a judging state.

---

### User Story 4 - One configuration file fully defines one exam machine (Priority: P2)

An operator deploying a new exam machine uploads a single configuration file and the machine is completely configured, including how much load it will accept.

**Why this priority**: Exam machines are rebuilt for every exam on inconsistent hardware. A configuration split across sources becomes a manual checklist, and manual checklists fail under pre-exam pressure. P2 because Stories 1–3 restore correctness first.

**Independent test**: Upload a configuration file containing judging settings, confirm they take effect; upload one omitting them, confirm the documented defaults apply rather than the previous values persisting.

**Acceptance Scenarios**:

1. **Given** a configuration file containing judging settings, **When** it is uploaded, **Then** those settings take effect, including the machine's concurrency ceiling.
2. **Given** a configuration file omitting judging settings, **When** it is uploaded, **Then** the documented defaults apply — values are **not** carried over from the previous configuration.
3. **Given** judging settings changed through the management interface, **When** a configuration file is uploaded afterwards, **Then** the uploaded file wins. This is intended, not a defect.
4. **Given** a running system, **When** the settings are read back, **Then** the effective values are reported along with where each came from, so an operator can tell a default from a deliberate choice.
5. **Given** an operator wants to know whether the execution backend is usable, **When** they check its health, **Then** they see whether it is reachable and which languages it can actually run.

---

### User Story 5 - A teaching assistant can see how many failures were the system's (Priority: P2)

Failures caused by the machine must be visible as such, not buried among students' wrong answers.

**Why this priority**: An attribution that nobody can see is an attribution that cannot be acted on. If a machine is producing system failures during an exam, that is an operational alarm, and it must not look like a cohort of students suddenly writing bad code.

**Independent test**: Judge a mixed batch of submissions where some fail for system reasons; confirm the system-caused count is reported separately from students' incorrect answers.

**Acceptance Scenarios**:

1. **Given** a completed judging run containing system failures, **When** its outcome is reported, **Then** the number of system-attributed failures is stated separately from student failures.
2. **Given** a submission recorded as a system failure, **When** it is inspected, **Then** it is distinguishable from a submission that was judged incorrect.
3. **Given** a judging run where every submission succeeded, **When** its outcome is reported, **Then** the system-failure count is zero rather than absent.

---

### User Story 6 - The deployed execution backend is configured for its machine (Priority: P3)

The execution backend runs with the isolation and capacity settings its documentation requires, and an operator has written guidance for choosing them.

**Why this priority**: Improves a machine's real ceiling and gives the backend its own queue as a second line of defence behind Story 2's. P3 because the application-side ceiling already prevents the incident; this raises the ceiling and hardens isolation.

**Independent test**: Bring the deployment up from the committed configuration and confirm the execution backend runs with the documented isolation settings and its own capacity ceiling.

**Acceptance Scenarios**:

1. **Given** the committed deployment configuration, **When** the stack is started, **Then** the execution backend runs with the isolation settings its own documentation requires.
2. **Given** the execution backend is configured with a capacity ceiling, **When** more work arrives than it allows, **Then** it queues the excess rather than admitting all of it.
3. **Given** an operator sizing a new machine, **When** they consult the documentation, **Then** they find both the recommended settings and the method for measuring the right values for that machine.

---

### Edge Cases

- **A submission mixes system and student failures across its test cases.** One test case failing for system reasons must not let the rest be scored as if the submission were fully evaluated.
- **Retries exhaust mid-batch.** Other students in the same batch must still complete.
- **The concurrency ceiling is set to an invalid value** (zero, negative, absurdly large). It must be rejected or clamped, never silently disabling the ceiling.
- **Judging is requested for a student already being judged.** The system must not run two overlapping judgements for the same student and interleave their results.
- **The execution backend becomes reachable again mid-run**, having been down at the start. Work already given up on must not be silently resurrected into a partial result.
- **A configuration file carries a concurrency ceiling sized for a different machine.** Accepted deliberately (the deployment model), so the documentation must tell the operator to re-measure.
- **The live-update notification fails** while background judging succeeds. Results must still be retrievable by querying, so a lost notification does not look like lost work.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Grading MUST determine responsibility for a failure from the judged verdict alone, without inspecting raw execution responses or performing its own pre-classification.
- **FR-002**: A verdict attributed to the system MUST NOT contribute to a student's score and MUST NOT be recorded as an incorrect answer.
- **FR-003**: A system-attributed verdict MUST be retried automatically up to a configured maximum.
- **FR-004**: A verdict attributed to the submission MUST NOT be retried.
- **FR-005**: When retries are exhausted and the verdict is still system-attributed, the submission MUST be recorded in a state distinguishable from both "graded" and "student answered incorrectly".
- **FR-006**: The number of executions in flight against the execution backend MUST NOT exceed a configured ceiling, counted across the whole system rather than per request or per submission.
- **FR-007**: The ceiling MUST be enforced at the point of execution, so that it holds regardless of how callers batch or parallelise work above it.
- **FR-008**: The ceiling MUST be changeable while the system is running, without a restart.
- **FR-009**: A request to start judging MUST be acknowledged immediately, before judging completes, and MUST return a handle for tracking the work.
- **FR-010**: The state of judging work MUST be queryable by its handle, covering waiting, running, finished, and failed.
- **FR-011**: Completion of background judging MUST be announced on the existing live-update channel.
- **FR-012**: On startup, submissions left in an in-progress judging state by an interrupted run MUST be returned to a state from which they can be judged again.
- **FR-013**: The system MUST NOT run overlapping judging for the same student concurrently.
- **FR-014**: Judging settings — including compile-stage allowances, the concurrency ceiling, and the retry maximum — MUST be configurable, resolving in the order: stored configuration, then environment (as a first-run seed only), then documented defaults.
- **FR-015**: Uploading a configuration file MUST replace the judging settings wholesale; settings absent from the file MUST fall back to documented defaults rather than retaining previous values.
- **FR-016**: The effective judging settings MUST be readable, together with the origin of each value.
- **FR-017**: Judging settings MUST be writable through a management interface, on the understanding that a later configuration upload overrides them.
- **FR-018**: The reachability of the execution backend and the set of languages it can actually run MUST be reportable on demand.
- **FR-019**: An invalid concurrency ceiling MUST be rejected or clamped to a valid value; it MUST NOT result in an unlimited ceiling.
- **FR-020**: The outcome of a judging run MUST report the count of system-attributed failures separately from student failures.
- **FR-021**: Configuration values that no code reads MUST be removed rather than left as apparent guarantees.
- **FR-022**: The deployment configuration MUST run the execution backend with the isolation settings its documentation requires and with its own capacity ceiling.
- **FR-023**: Documentation MUST record the recommended deployment settings and the method for measuring appropriate values for a given machine.

### Non-Functional Requirements (Constitution Mandated)

- **NFR-SEC**: A submission MUST NOT be able to influence its own attribution (Constitution IV, Root Principle 1). Judging settings are operator-controlled and MUST require the same privilege as other administrative settings.
- **NFR-CONC**: Judging MUST be asynchronous end to end, and the concurrency ceiling MUST hold under simultaneous arrivals rather than only under sequential ones (Constitution II).
- **NFR-TYPE**: The judging integration MUST be strictly type-safe. Escape-hatch typing MUST NOT be required to read a verdict, an attribution, or an execution fact (Constitution I). *(The current code types execution results as `any` throughout; the published contract makes that unnecessary.)*
- **NFR-COUPLE**: Retry policy, concurrency control, and grading MUST be separable — each testable without standing up the others (Constitution V).
- **NFR-TEST**: Every scenario in this specification MUST have automated coverage, including the concurrency ceiling holding under simultaneous arrivals (Constitution VI).

### Key Entities

- **Judging Job**: One background judging run for one student. Has a handle, a state (waiting / running / finished / failed), and an outcome summary including counts of student and system failures.
- **Judging Settings**: The operator-controlled parameters — compile-stage allowances, concurrency ceiling, retry maximum — with the origin of each effective value.
- **Fault Attribution**: Carried on each verdict; determines whether a result is scored, retried, or recorded as a system failure. Defined by the judging library (feature 003).
- **Submission Judging State**: Extends the existing states with one meaning "could not be judged for reasons that were not the student's".
- **Execution Backend Health**: Reachability plus the languages actually installed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Under a load that previously produced system-caused failures for 23% of submissions, **0%** of students receive a lowered score as a result.
- **SC-002**: Executions in flight against the execution backend never exceed the configured ceiling, verified with simultaneous arrivals from multiple independent requests.
- **SC-003**: A request to start judging is acknowledged in under one second regardless of how much work is queued ahead of it.
- **SC-004**: Deploying a new exam machine requires uploading exactly one configuration file — no additional manual steps to configure judging.
- **SC-005**: For any completed judging run, an operator can state how many failures were the system's without inspecting raw execution data.
- **SC-006**: Grading requires no pre-checks of its own before judging a result, and no escape-hatch typing to read one.
- **SC-007**: No submission remains permanently stuck in an in-progress judging state after an interrupted run.
- **SC-008**: An operator can determine, before an exam begins, whether the execution backend is reachable and which languages it can run.

## Assumptions

- `piston-judger@0.2.0` is published and provides attribution on every verdict, accepts execution failures without throwing, and exposes its effective limits. Verified: the published package matches the reviewed artifact.
- Retry maximum defaults to **2** (three attempts total). Enough to ride out a transient load spike, few enough that a genuinely pathological submission cannot consume capacity indefinitely.
- The concurrency ceiling defaults to a conservative small value. Measurements on an idle 12-core machine put the cliff between concurrency 20 and 30; a real exam machine also runs the application, its database, and the operating system, so the default is set well below the measured cliff and the documentation directs operators to measure their own.
- Interrupted judging is recovered by returning affected submissions to a re-judgeable state at startup, rather than by persisting and resuming partial work. Simpler, and re-judging is idempotent.
- Judging job state does not need to survive a restart; the submission states are the durable record.
- The existing live-update channel is the notification mechanism; no new transport is introduced.
- Existing administrative authorisation covers the new settings and health endpoints.

## Dependencies

- `piston-judger@0.2.0` (feature 003) — published 2026-08-27.
- The existing live-update channel, submission store, and configuration store.
- Verifying behaviour under saturation requires a reachable execution backend.

## Out of Scope

- **The judging settings user interface.** Backend readable/writable settings and health reporting are in scope; the operator-facing page is a later feature.
- **Eliminating repeated compilation.** Every test case still compiles the submission again — the dominant load driver, and the reason a concurrency ceiling matters so much. It is constrained by the execution backend's interface and is a separate architectural question.
- **Post-deployment load testing as a product feature.** Tracked separately in `knowledge/draft/部署後壓測機制設計.md`; this feature only documents the measurement method.
