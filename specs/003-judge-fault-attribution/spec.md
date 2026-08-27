# Feature Specification: Judge Fault Attribution

**Feature Branch**: `[003-judge-fault-attribution]`

**Created**: 2026-08-26

**Status**: Draft

**Target Repository**: `~/Documents/my-code/ntut-exam/node-piston` (published as npm package `piston-judger`)

**Input**: User description: "修復 piston-judger 套件，使其能夠正確區分「使用者的失敗」與「系統的失敗」。本套件目前會把 Piston 編譯階段因 wall-clock 逾時被 SIGKILL 的情況（compile.code 為 null、signal 為 SIGKILL、status 為 TO、stderr 為空）誤判為 Compilation Error，導致考試系統在高併發下隨機把系統過載記成學生的編譯錯誤。已實測確認：併發 20 時 CE 率 0%，併發 30 時 CE 率 23%。"

## Context

This package is a judging library consumed by the NTUT exam system. Its "users" are (a) the consuming exam backend, and (b) transitively, the students whose submissions it grades and the teaching assistants who review results.

The governing semantic constraint comes from the project knowledge base: the derived principle **Fault Attribution Isolation** (`knowledge/principles.md`) and its concept file (`knowledge/concepts/失敗歸因的隔離.md`). Incident context and the parent implementation plan are in `knowledge/draft/piston穩定度與併發問題.md` (section A).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A system failure is never charged to the student (Priority: P1)

When the execution backend is saturated and kills a submission's compile stage on a wall-clock timeout, the consuming exam system must be able to recognize this as a system failure rather than recording it as the student's compilation error.

**Why this priority**: This is the defect that caused real harm — students received Compilation Error verdicts for correct code because the machine was busy. Grading integrity is the project's Root Principle 1; a wrong attribution directly destroys exam fairness. Every other story in this feature is secondary to this one.

**Independent Test**: Feed the judging logic a recorded execution result whose compile stage was terminated by signal on timeout, and confirm the returned verdict is attributed to the system, not the submission. Deliverable on its own — fixing only this restores grading integrity.

**Acceptance Scenarios**:

1. **Given** an execution result whose compile stage reports termination by signal with a timeout status and empty error text, **When** the result is judged, **Then** the verdict is attributed to a system failure and is distinguishable from a submission compilation error.
2. **Given** an execution result whose compile stage reports a genuine compiler diagnostic (non-zero exit, populated error text, no termination signal), **When** the result is judged, **Then** the verdict is attributed to the submission as a compilation error.
3. **Given** any judged result, **When** the consumer inspects it, **Then** the consumer can determine the attribution without reading the raw execution payload or re-implementing classification logic.
4. **Given** an execution result attributed to a system failure, **When** the consumer inspects it, **Then** it carries enough diagnostic detail to explain *which* stage failed and *why* it was terminated.

---

### User Story 2 - The package is safe to import and publish (Priority: P1)

A consumer must be able to install and import the package without it performing work of its own, and without it emitting the contents of submissions anywhere.

**Why this priority**: The current working tree contains debug residue that makes the package actively harmful if published: importing it triggers a live execution request against a hard-coded local address, and every execution response — including full submission output — is written to standard output. Publishing in this state would leak student data and add uncontrolled load. This gates the release, so it shares P1.

**Independent Test**: Import the package in a clean process with no execution backend reachable, and observe that no network request is attempted and nothing is written to standard output. Verifiable without any judging logic changes.

**Acceptance Scenarios**:

1. **Given** a clean process with no execution backend running, **When** the package is imported, **Then** no network request is attempted and the import succeeds.
2. **Given** any execution is performed, **When** the response is received, **Then** the package writes no submission content, output, or execution payload to standard output or standard error.
3. **Given** the package is prepared for release, **When** its published contents are inspected, **Then** they contain no development-only scratch or manual-test entry points.

---

### User Story 3 - A submission cannot forge system status (Priority: P2)

A student's program must not be able to influence how its own result is attributed by printing particular text.

**Why this priority**: Attribution currently consults submission-controlled output when deciding whether a memory limit was exceeded. A submission that prints the right word is misattributed — this is both a correctness defect and an anti-cheat hole (Root Principle 1). It is P2 rather than P1 only because it requires deliberate action to trigger, whereas Story 1 fires on its own under load.

**Independent Test**: Judge a submission whose own output contains the trigger text but whose execution completed normally, and confirm the verdict is unaffected.

**Acceptance Scenarios**:

1. **Given** a submission that completes successfully and prints text resembling a system termination notice, **When** the result is judged, **Then** the verdict is based only on the actual outcome and the printed text has no effect on attribution.
2. **Given** a submission genuinely terminated for exceeding its memory allowance, **When** the result is judged, **Then** the verdict correctly reports a memory limit failure based on execution metadata rather than output text.
3. **Given** any attribution decision, **When** its inputs are examined, **Then** no submission-controlled output stream is among them.

---

### User Story 4 - Correctness-affecting limits are visible to the caller (Priority: P3)

A consumer must not be able to unknowingly inherit a limit that changes grading outcomes.

**Why this priority**: The compile-stage time allowance silently defaults inside the package. The consuming system never set it, never knew it existed, and it became the trigger for the incident in Story 1. Making it visible prevents the same class of surprise. P3 because Story 1's fix already prevents the harmful *outcome*; this prevents recurrence of the *cause*.

**Independent Test**: Inspect the effective limits applied to an execution and confirm every limit that can change a verdict is either supplied by the caller or reported back to it.

**Acceptance Scenarios**:

1. **Given** a caller that does not supply a compile-stage time allowance, **When** an execution is performed, **Then** the effective value applied is discoverable by the caller rather than silently assumed.
2. **Given** a caller that supplies its own limits, **When** an execution is performed, **Then** the supplied values are the ones applied.

---

### User Story 5 - The runtime catalogue does not go stale (Priority: P3)

An operator who installs a new language on the execution backend must see it become available without restarting the consuming system.

**Why this priority**: The catalogue of available languages is cached for the lifetime of the process with no expiry. Operationally this produces confusing failures where a language is installed but unusable. P3 — it degrades operations rather than grading integrity.

**Independent Test**: Query the catalogue, change the backing set of runtimes, and confirm the change becomes visible after the freshness window without a process restart.

**Acceptance Scenarios**:

1. **Given** a cached runtime catalogue, **When** the freshness window has elapsed and the catalogue is queried, **Then** the catalogue is refreshed from the backend.
2. **Given** a cached runtime catalogue, **When** it is queried within the freshness window, **Then** the cached copy is served without contacting the backend.
3. **Given** the backend is unreachable when a refresh is attempted, **When** the catalogue is queried, **Then** the failure is surfaced to the caller rather than silently returning an empty or stale-but-unmarked catalogue.

---

### Edge Cases

- **Interpreted languages have no compile stage.** Attribution must not treat an absent compile stage as either a pass or a failure of that stage.
- **Both stages fail.** When the compile stage succeeds but the run stage is terminated by the system, attribution must follow the same system-versus-submission rule as the compile stage.
- **Termination signal with a zero exit status.** A stage may report success by exit status while also reporting a termination signal; attribution must not read the exit status in isolation.
- **The execution backend is unreachable or returns a transport-level error.** This is unambiguously a system failure and must never surface as any submission verdict.
- **A stage is terminated for exceeding an output allowance.** Attribution must distinguish "the submission produced too much output" (submission's failure) from "the system truncated the stage" (system's failure).
- **Expected output is absent.** Comparison must not be attempted, and the absence must not be reported as a submission mismatch.
- **The submission's output is empty because the stage was killed.** An empty result from a terminated stage must never be compared against expected output and reported as a mismatch.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The judging result MUST classify every outcome as attributable to either the submission or the system, and this attribution MUST be readable by the consumer directly from the result.
- **FR-002**: A stage terminated by the system on a time allowance MUST NOT be attributed to the submission, regardless of the exit status reported for that stage.
- **FR-003**: Attribution MUST NOT be derived from any submission-controlled output stream.
- **FR-004**: The result MUST carry the unmodified per-stage execution facts (exit status, termination signal, stage status, stage message) so a consumer can audit or extend the classification without re-fetching the raw payload.
- **FR-005**: The execution layer MUST NOT reduce a failure to a single verdict before the judging layer has classified it; information available from the backend MUST NOT be discarded on the way to the consumer.
- **FR-006**: Importing the package MUST NOT initiate network activity, and MUST NOT execute any behaviour beyond defining its exports.
- **FR-007**: The package MUST NOT write submission content, execution output, or execution payloads to any process-level output stream.
- **FR-008**: Every limit applied to an execution that can change a verdict MUST be either supplied by the caller or reported back to the caller as the effective value.
- **FR-009**: The runtime catalogue MUST be refreshed after a bounded freshness window, and a failed refresh MUST be surfaced rather than silently substituted.
- **FR-010**: Failures originating from the transport or the backend itself MUST be attributable to the system and MUST NOT be expressible as any submission verdict.
- **FR-011**: Output comparison MUST be performed only when the stage completed normally and an expected output was supplied.
- **FR-012**: The release MUST be prepared to a reviewable artifact (a build plus a packaged tarball whose contents can be listed and verified) and MUST NOT be published by an automated agent; publication is a human action.
- **FR-013**: The package version MUST be raised to reflect a breaking change to the result contract, and the breaking changes MUST be documented for the consuming system's migration.

### Non-Functional Requirements (Constitution Mandated)

- **NFR-SEC**: Submission content and execution output MUST NOT leak to logs or any unintended sink (Constitution IV). Submission-controlled data MUST NOT be able to influence grading attribution (Constitution IV, and Root Principle 1 of the project knowledge base).
- **NFR-CONC**: The library is invoked concurrently by the consuming system. It MUST hold no cross-invocation mutable state that could let one invocation's result influence another's, with the sole exception of the runtime catalogue cache, which is read-only data (Constitution II).
- **NFR-TYPE**: The result contract MUST be strictly type-safe at the consumer boundary. The consumer MUST NOT be required to use escape-hatch typing to read an attribution or a stage fact (Constitution I). *(This directly addresses the consuming system's current need to type execution results as `any`.)*
- **NFR-TEST**: Every misattribution scenario enumerated in this specification MUST have a corresponding automated test (Constitution VI).

### Key Entities

- **Execution Result**: The factual record of one submission run — per-stage exit status, termination signal, stage status, stage message, resource usage, and output. Contains no judgement.
- **Judged Result**: A verdict derived from an Execution Result, carrying the verdict, its **fault attribution** (submission or system), a human-readable explanation, and the underlying per-stage facts.
- **Fault Attribution**: The classification of a failure's responsible party. The central concept of this feature; it is what the current contract cannot express.
- **Runtime Catalogue**: The set of languages and versions the execution backend can run, together with the time at which it was observed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Across every recorded case of a stage terminated by the system on a time allowance, 0% are attributed to the submission.
- **SC-002**: A consumer can determine the responsible party for any failure using only the judged result, in a single step, without inspecting raw execution data or adding its own pre-checks.
- **SC-003**: Importing the package in an environment with no execution backend produces zero network requests and zero bytes of process output.
- **SC-004**: For any submission output content whatsoever — including text that mimics system termination notices — the attribution of its result is unchanged.
- **SC-005**: 100% of the misattribution scenarios listed in this specification are covered by automated tests, and the full test suite passes.
- **SC-006**: The consuming exam system can read an attribution and every per-stage fact without resorting to escape-hatch typing, and no longer needs its own pre-classification checks before delegating to this package.
- **SC-007**: A reviewer can list the exact contents of the release artifact before any publication occurs.

## Assumptions

- The execution backend is Piston, and the shape of its per-stage response (exit status, termination signal, stage status, stage message, resource usage) is treated as the source of truth for attribution facts.
- This package is consumed by the NTUT exam system; a breaking change to the result contract is acceptable and will be absorbed by a follow-up feature in the consuming repository. It is not assumed to have other consumers.
- The existing code-formatting changes present in the target repository's working tree are intentional and are to be preserved; only the debug residue identified in User Story 2 is to be removed.
- Making the system's own concurrency safe is **out of scope** for this feature. This package can only stop *misattributing* saturation; preventing saturation is the consuming system's responsibility and is tracked separately (`knowledge/draft/piston穩定度與併發問題.md`, sections B and D).
- Eliminating redundant recompilation (the underlying load driver) is out of scope; it is constrained by the execution backend's API and is tracked as a separate concern.
- A freshness window for the runtime catalogue on the order of minutes is assumed adequate; operators install languages infrequently.
- Publication credentials are held by the maintainer. The automated agent prepares and verifies the artifact but does not publish.

## Dependencies

- The consuming exam system (`ntut-exam-v2/host`) must adopt the new result contract; that migration is a separate feature and is a prerequisite for the incident being fully resolved in production.
- Verification of behaviour under a saturated backend requires a reachable Piston instance.
