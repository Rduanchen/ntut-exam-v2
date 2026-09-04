# Feature Specification: Judger Deploy Test

**Feature Branch**: `[006-judger-deploy-test]`

**Created**: 2026-09-01

**Status**: Draft

**Scope**: Extend the existing Judge administration page so an operator can run deployment tests and inspect their results without leaving that page.

**Input**: User description: "After deployment, add a deploy test on the existing Judge page that proves the Piston judger works, executes C, C++, and Python programs, exercises TLE, MLE, OLE and other failure conditions, and submits many requests concurrently. Both running the test and seeing its results must happen inside frontend/src/views/judge."

## Context

The current Judge page can report whether the execution backend is reachable and which runtimes it advertises. That does not prove that an installed runtime can compile and execute a program, that resource limits produce the right verdict, or that the deployed machine remains safe when many jobs arrive together.

This feature turns deployment verification into an operator-visible pre-exam gate. It uses synthetic programs rather than student submissions, exercises the same operational judging constraints used during an exam, and reports expected submission failures separately from infrastructure failures. A test must never alter submissions, scores, or student judging history.

The result is evidence about the current deployment under its current configuration. It is not an automatic capacity tuner and must not claim that a machine is safe above the tested load.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run a deployment test from the Judge page (Priority: P1)

Before an exam, an operator opens the existing Judge page, selects Deploy Test, and starts a safe default test. The operator stays on that page while the test is accepted, progresses, and finishes.

**Why this priority**: The capability has no operational value if it requires command-line access or a separate screen. The user's explicit requirement is one continuous workflow in the existing Judge page.

**Independent Test**: Open the Judge page on a ready deployment, start the default deployment test, and confirm that acceptance, live state, and completion are all visible without navigating elsewhere.

**Acceptance Scenarios**:

1. **Given** an authorised operator on the Judge page and an idle test runner, **When** they open Deploy Test, **Then** they can review the test profile and start it without leaving the page.
2. **Given** a deployment test has been started, **When** it is queued or running, **Then** the same page shows its state, start time, current phase, completed work, and total work.
3. **Given** a deployment test finishes, **When** the operator remains on the Judge page, **Then** the same page shows the overall outcome and the complete result report.
4. **Given** a test cannot start, **When** the operator attempts to run it, **Then** the reason is shown on the Judge page and no partial test is created.

---

### User Story 2 - Prove required languages actually execute (Priority: P1)

An operator verifies that C, C++, and Python can each compile or start, consume input, produce a known output, and receive the expected successful verdict on the deployed execution backend.

**Why this priority**: A runtime catalogue proves only that a language is advertised. The deployment is usable only when representative code actually runs correctly.

**Independent Test**: Run only the language smoke phase and confirm that C, C++, and Python each receive an individual pass, failure, or blocked result backed by an observed execution.

**Acceptance Scenarios**:

1. **Given** C, C++, and Python runtimes are available, **When** the language smoke phase runs, **Then** each language executes a deterministic input/output program and receives its own result.
2. **Given** one required runtime is unavailable, **When** the test starts, **Then** that language is marked blocked with the missing runtime named while available languages can still be tested.
3. **Given** a runtime is advertised but cannot execute its probe, **When** the phase finishes, **Then** the language is marked failed rather than available.
4. **Given** any language probe completes, **When** its result is displayed, **Then** the operator can see the expected verdict, observed verdict, attribution, duration, and bounded diagnostic message.

---

### User Story 3 - Verify failure classification and safety limits (Priority: P1)

An operator runs controlled programs that intentionally cause compile error, runtime error, time-limit excess, memory-limit excess, and excessive output. The report distinguishes an expected submission-caused outcome from an infrastructure failure.

**Why this priority**: The system previously charged compile-stage infrastructure timeouts to students as compile errors. A deployment test that checks only successful programs would miss the most damaging known failure mode.

**Independent Test**: Run only the verdict phase and confirm that every controlled program is matched against its expected outcome and attribution, with excessive output kept bounded.

**Acceptance Scenarios**:

1. **Given** a deterministic program for an expected failure class, **When** it runs, **Then** the report compares the observed verdict and attribution with the expected ones.
2. **Given** a program intentionally exceeding its run-time allowance, **When** it completes, **Then** it passes the probe only if it is classified as a submission-attributed time-limit failure.
3. **Given** a program intentionally exceeding its memory allowance, **When** it completes, **Then** it passes the probe only if it is classified as a submission-attributed memory-limit failure.
4. **Given** a program intentionally producing excessive output, **When** it runs, **Then** returned and displayed output remains bounded, the execution backend remains responsive, and the report describes the observed output-limit behaviour without inventing an unsupported verdict.
5. **Given** overload, timeout, resource exhaustion, or execution-backend failure causes a probe to fail, **When** results are classified, **Then** the failure is reported as infrastructure-attributed and is never presented as a successful verification of a student-failure verdict.

---

### User Story 4 - Validate concurrent operation under the configured safety ceiling (Priority: P2)

An operator submits many synthetic judging jobs using one or more bounded concurrency levels and receives a report that reveals queueing, latency, throughput, missing results, and infrastructure failures for each level.

**Why this priority**: The known incident appeared only near a concurrency cliff. A serial smoke test proves functionality but not whether the deployed machine safely handles an exam-shaped burst.

**Independent Test**: Run a concurrency profile totaling at least 100 synthetic jobs and confirm that every requested job is accounted for in per-level and overall summaries.

**Acceptance Scenarios**:

1. **Given** a valid bounded concurrency profile, **When** the operator confirms the run, **Then** jobs are submitted at each selected level while respecting the deployment's active safety ceiling.
2. **Given** a concurrency level completes, **When** its summary is displayed, **Then** it includes requested, completed, expected failures, infrastructure failures, missing results, throughput, and latency percentiles including maximum latency.
3. **Given** a burst larger than the active execution ceiling, **When** it runs, **Then** excess work waits safely and the report exposes its end-to-end delay rather than bypassing the ceiling.
4. **Given** any requested job does not produce a terminal result, **When** the report is finalized, **Then** it is counted explicitly as missing or timed out rather than silently omitted.
5. **Given** the configured load causes a sharp increase in latency or infrastructure failures, **When** the test finishes, **Then** the overall result is a warning or failure and identifies the affected concurrency level; it does not automatically change configuration.

---

### User Story 5 - Return to and export the latest result (Priority: P2)

An operator can reload or revisit the Judge page and continue observing an active test or inspect the latest completed report. They can export the report for deployment records.

**Why this priority**: Stress tests can outlive a browser request. Losing the only visible report on reload would make the operational gate unreliable.

**Independent Test**: Start a test, reload the Judge page, and verify that its current state returns; after completion, revisit and export a report containing the same summary shown on screen.

**Acceptance Scenarios**:

1. **Given** a deployment test is active, **When** the Judge page reloads, **Then** the page reconnects to the active test and displays its latest known progress.
2. **Given** no test is active but a completed report is available, **When** Deploy Test is opened, **Then** the latest report is visible on the Judge page.
3. **Given** a completed report, **When** the operator exports it, **Then** the exported report contains the configuration snapshot, runtime observations, case results, concurrency summaries, timestamps, and overall outcome shown on screen.

### Edge Cases

- The execution backend becomes unreachable after the initial readiness check but before or during execution.
- A runtime is advertised but its compiler, interpreter, package, or sandbox is unusable.
- Python is absent while C and C++ are available, or vice versa; available languages must still produce useful evidence.
- A probe returns an unknown verdict or a verdict whose attribution is absent or contradictory.
- Excessive-output code attempts to flood transport, logs, storage, or the browser.
- The operator requests zero, negative, non-numeric, duplicated, unsorted, or excessively large concurrency values.
- Two operators attempt to start deployment tests at the same time.
- A student judging job is already queued or running when an operator attempts to start a deployment test.
- The exam changes into an active state while a deployment test is queued or running.
- The service restarts during a test, leaving a previously active report without a terminal state.
- A browser is closed, disconnected, or refreshed while the test continues.
- Some jobs finish after the test-level deadline; late results must not corrupt a finalized report.
- A test completes with measurements but one or more probes fail; completion and success must remain separate concepts.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The existing Judge administration page MUST contain a distinct Deploy Test area.
- **FR-002**: An operator MUST be able to start a deployment test and view its progress and complete results without leaving the Judge page or opening a separate application route.
- **FR-003**: The Deploy Test area MUST show the proposed test profile and its safety bounds before the operator confirms execution.
- **FR-004**: Starting a test MUST require an explicit operator action and MUST NOT occur automatically when the page loads.
- **FR-005**: The system MUST verify execution-backend reachability before admitting a test and MUST report an unavailable backend as a test-start failure.
- **FR-006**: The system MUST run real deterministic execution probes for C, C++, and Python, reporting each language independently as passed, failed, or blocked.
- **FR-007**: Every probe result MUST include its language, scenario, expected verdict, observed verdict, expected attribution, observed attribution, duration, status, and bounded diagnostic information.
- **FR-008**: The verdict suite MUST cover successful execution, compile error, runtime error, run-time limit excess, memory-limit excess, and excessive-output behaviour.
- **FR-009**: Excessive-output verification MUST prove that returned, retained, and displayed diagnostics remain bounded and that the execution backend remains responsive after the probe.
- **FR-010**: The system MUST NOT claim an output-limit verdict that the execution backend does not report; it MUST preserve and describe the observed behaviour.
- **FR-011**: A probe MUST pass only when both its observed verdict and fault attribution match the expected semantics.
- **FR-012**: Infrastructure-attributed failures MUST be counted separately from expected submission-attributed failures and MUST make the affected probe fail.
- **FR-013**: Operators MUST be able to run a bounded concurrency profile containing one or more submitted-concurrency levels and a bounded total job count.
- **FR-014**: All deployment-test executions MUST obey the same active execution safety ceiling that protects normal judging; the test MUST NOT offer a bypass.
- **FR-015**: For each concurrency level, the report MUST account for every requested job and show completed jobs, expected failures, infrastructure failures, missing or timed-out jobs, throughput, median latency, 95th-percentile latency, 99th-percentile latency, and maximum latency.
- **FR-016**: The report MUST distinguish submitted concurrency from actual execution concurrency so queued work is not misrepresented as simultaneous execution.
- **FR-017**: A deployment test MUST run independently of the browser request that started it and MUST expose queued, running, completed, failed, and interrupted states.
- **FR-018**: The Judge page MUST show active-test progress including the current phase and completed versus total work.
- **FR-019**: Reloading or revisiting the Judge page MUST restore the active test or latest available completed report.
- **FR-020**: The operator MUST be able to export a completed report in a machine-readable format.
- **FR-021**: A report MUST include a unique identifier, start and finish times, overall outcome, runtime observations, effective judging configuration snapshot, active safety ceiling, probe results, concurrency summaries, and bounded errors.
- **FR-022**: The system MUST allow at most one deployment test to consume judging capacity at a time and MUST return the active test when another start is attempted.
- **FR-023**: The system MUST reject a deployment test while an exam is actively running.
- **FR-024**: If an exam becomes active during a queued or running deployment test, the test MUST stop admitting new work, preserve completed measurements, and finish as interrupted.
- **FR-025**: Deployment tests MUST NOT create, read as fixtures, or modify student submissions, scores, judging outcomes, or student-facing progress events.
- **FR-026**: Normal student judging and deployment testing MUST remain distinguishable in status, reporting, and operational records.
- **FR-027**: User-controlled test parameters MUST be validated against safe lower and upper bounds before any work begins.
- **FR-028**: All untrusted or potentially unbounded diagnostics MUST be truncated before transport, retention, logging, or display.
- **FR-029**: A completed test with one or more failed or unaccounted probes MUST NOT be labelled successful.
- **FR-030**: The test MUST NOT automatically alter judging limits, capacity settings, runtime installation, or deployment configuration.

### Non-Functional Requirements (Constitution Mandated)

- **NFR-SEC**: Only authorised administrative operators may start or retrieve deployment tests, and all parameter validation and resource bounds MUST be enforced at the trusted boundary (Constitution IV).
- **NFR-CONC**: Long-running and burst work MUST be processed asynchronously and remain bounded under concurrent demand, without holding an interactive request open for the full run (Constitution II).
- **NFR-TYPE**: Test profiles, lifecycle states, probe outcomes, attributions, measurements, and reports MUST be represented by complete, strictly checked contracts without unsafe escape hatches (Constitution I).
- **NFR-COUPLE**: Synthetic deployment testing MUST remain isolated from student grading and presentation concerns so each can be tested independently (Constitution V).
- **NFR-TEST**: Every acceptance scenario and failure boundary in this specification MUST have automated coverage at the appropriate boundary, with 100% line coverage for newly introduced executable code (Constitution VI).
- **NFR-STABILITY**: Test execution and report viewing MUST remain safe when the browser disconnects, the execution backend fails, or a test is interrupted; partial state MUST NOT be presented as a successful result (Constitution IV).

### Key Entities

- **Deployment Test Profile**: The operator-reviewed definition of enabled phases, selected languages, concurrency levels, total jobs, safety bounds, and test-level deadline.
- **Deployment Test Run**: One admitted test with a unique identity, lifecycle state, progress, configuration snapshot, runtime snapshot, timestamps, and overall outcome.
- **Probe Definition**: A synthetic language and scenario paired with its expected verdict, expected attribution, resource allowance, and bounded expected evidence.
- **Probe Result**: The observed verdict, attribution, duration, diagnostic evidence, and pass, fail, or blocked comparison against one probe definition.
- **Concurrency Level Result**: Measurements and accounting for one submitted-concurrency level, including actual bounded execution, throughput, latency distribution, and failure counts.
- **Deployment Test Report**: The immutable terminal summary presented on the Judge page and available for export, composed of snapshots, probe results, concurrency results, interruptions, and an overall outcome.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An authorised operator can start a default deployment test and reach visible accepted or rejected feedback from the Judge page within 2 seconds.
- **SC-002**: An operator can complete the entire start, progress-monitoring, result-review, and export workflow without leaving the Judge page.
- **SC-003**: On a healthy deployment with C, C++, and Python installed, 100% of the three language smoke probes execute and match their expected successful outcome.
- **SC-004**: 100% of controlled compile-error, runtime-error, time-limit, memory-limit, and excessive-output probes are reported with an explicit observed outcome and attribution comparison; none are silently omitted.
- **SC-005**: Excessive-output testing never displays, transports, retains, or logs diagnostics beyond the configured bound, and a post-probe readiness check completes successfully on a healthy deployment.
- **SC-006**: A concurrency run totaling at least 100 jobs accounts for 100% of requested jobs as completed, failed, timed out, missing, or interrupted, with no unclassified loss.
- **SC-007**: Every completed concurrency level reports throughput, median, 95th-percentile, 99th-percentile, and maximum end-to-end latency together with infrastructure-failure rate.
- **SC-008**: Zero deployment-test runs alter a student submission, score, student judging result, or student-facing judging event.
- **SC-009**: 100% of attempts to start a second deployment test or start one during an active exam are refused without admitting additional test work.
- **SC-010**: After a page reload or temporary browser disconnection, the active test or latest completed report is visible again within 5 seconds of restoring connectivity.
- **SC-011**: Any infrastructure-attributed failure, missing result, or failed readiness check prevents the report from receiving a successful overall outcome.
- **SC-012**: 100% of acceptance scenarios are covered by automated tests, and all executable code introduced by this feature meets the constitution's line-coverage requirement.

## Assumptions

- The feature is used by the same authorised teaching assistants and administrators who already access the Judge page; no new role model is introduced.
- C, C++, and Python are the required language set for this feature. Other installed languages may be displayed but are not executed by the initial deploy-test suite.
- A safe default profile includes language smoke probes, verdict probes, and a modest concurrency profile; operators may adjust only parameters exposed within enforced safety bounds.
- Missing runtimes block only their language-specific probes. They make the overall report non-successful but do not prevent available languages or non-language-specific readiness checks from running.
- "OLE" is treated as output-limit safety behaviour unless the deployed judging contract reports a distinct output-limit verdict. The feature validates bounded output and continued service health in either case.
- The latest report is operational deployment evidence rather than permanent exam data. Long-term historical retention and cross-deployment trend analysis are outside this feature.
- The currently effective judging configuration and safety ceiling define the maximum execution pressure this feature may apply. Discovering the raw failure cliff above those safeguards is outside this feature.
- A deployment test is a pre-exam operation. Protecting an active exam takes precedence over completing a queued or running deployment test.

## Dependencies

- The existing Judge administration page and its administrative authorisation are available.
- The execution backend can report reachability and installed runtimes.
- Normal judging already provides bounded execution, resource allowances, verdict attribution, and asynchronous work handling that deployment tests can exercise without using student data.
- The system can determine whether an exam is actively running.

## Out of Scope

- A new top-level navigation item or a separate page for starting or viewing deployment tests.
- Automatic tuning or modification of concurrency ceilings, time limits, memory limits, output limits, or deployment configuration.
- Intentionally bypassing active safety limits to discover the machine's raw crash point.
- Using real student submissions, test cases, scores, or judging history as deployment-test fixtures.
- Installing missing runtimes or repairing the execution backend.
- Supporting languages other than C, C++, and Python in the initial executable probe suite.
- Permanent report history, trend dashboards, cross-machine comparison, or capacity recommendations.
- General HTTP, database, frontend rendering, or network load testing outside the code-execution path.
