# Feature Specification: Secure Backend Tests

**Feature Branch**: `[001-secure-backend-tests]`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "test code needs to be very secure, while considering various extreme situations, and ensure that students do not accidentally fetch/alter test data"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Secure and Isolated Evaluation Testing (Priority: P1)

As a system admin, I want tests to verify that test data (inputs, expected outputs, configuration secrets) are completely isolated from the evaluation sandbox, ensuring that students' evaluated code cannot maliciously or accidentally fetch or alter test data.

**Why this priority**: Security is our highest priority (Root Principle 1). If test data or system secrets leak into the sandbox, the integrity of the exam is compromised.

**Independent Test**: Can be fully tested by simulating malicious payloads inside the evaluation sandbox attempting to read or modify external test files, and asserting that the sandbox blocks the operation.

**Acceptance Scenarios**:

1. **Given** a test case containing a malicious student payload designed to read filesystem secrets, **When** the evaluation logic runs the payload, **Then** the test must verify that the payload receives permission denied or a timeout, and no test data is leaked.
2. **Given** a student payload designed to write or alter files, **When** the evaluation runs, **Then** the sandbox restricts write access to the designated temporary directory, leaving test data intact.

---

### User Story 2 - Extreme Output Handling (Priority: P1)

As a developer, I want the evaluation logic tests to simulate extreme situations like infinitely large standard output (stdout), ensuring the backend safely truncates the output and prevents system freezing.

**Why this priority**: We learned from past experience (Experience 1) that excessively large outputs can freeze the Judger system. Tests prevent regressions on the "Output Truncation" mechanism.

**Independent Test**: Can be fully tested by feeding an infinite loop that prints text continuously to the sandbox and verifying the system terminates it securely and returns a truncated string.

**Acceptance Scenarios**:

1. **Given** a student payload that prints infinite megabytes of data, **When** evaluated, **Then** the test asserts that the result string length is exactly or below the maximum allowed truncation limit.
2. **Given** the same infinite printing payload, **When** evaluated, **Then** the test asserts the system does not crash or freeze and completes within the set time limit (TLE).

---

### User Story 3 - Anti-Cheat and Rebinding Fallbacks (Priority: P2)

As a TA, I want comprehensive tests around the IP and Device rebinding logic, ensuring that fallbacks trigger correctly and manual approval is strictly required before an anomalous login is permitted.

**Why this priority**: Anti-cheat bypasses have occurred due to IP fallback gaps (Experience 2). Testing this ensures rebinding rules remain strict.

**Independent Test**: Can be tested by simulating sequential login attempts from different IPs and asserting the TA approval state blocks the login.

**Acceptance Scenarios**:

1. **Given** an active session bound to Device A, **When** a login attempt occurs from Device B for the same user, **Then** the test verifies an 'approval required' state is entered and the login is rejected.
2. **Given** an 'approval required' state, **When** a TA explicitly approves it, **Then** the user can log in and the old IP is correctly cleared.

### Edge Cases

- What happens if the test suite itself crashes midway? (Tests must not leave orphaned sandbox processes running on the host.)
- How does the system handle concurrent test execution where multiple sandboxes attempt to access shared test data?
- What happens if the payload attempts to exploit network sockets to escape the sandbox during evaluation?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide comprehensive, isolated unit tests for the evaluation logic (Judger module).
- **FR-002**: The system MUST provide comprehensive unit tests for the anti-cheat module (IP and Device rebinding, login validation).
- **FR-003**: The test environment MUST enforce strict filesystem and network isolation, preventing any evaluated code from reading or modifying the test data/fixtures or the host network.
- **FR-004**: Tests MUST simulate extreme evaluation situations, including malicious payloads (fs/net exploits), massive stdout/stderr (output truncation), and infinite loops (TLE).
- **FR-005**: Tests MUST verify that IP and Device rebinding require explicit TA approval.

### Non-Functional Requirements (Constitution Mandated)

- **NFR-SEC**: The backend MUST be absolutely secure (zero-tolerance for data breaches or injection vulnerabilities).
- **NFR-CONC**: The system MUST handle high concurrency gracefully using asynchronous processing.
- **NFR-TYPE**: All interfaces and data boundaries MUST be strictly type-safe.
- **NFR-TEST**: 100% line coverage MUST be achieved for the anti-cheat and evaluation core modules, per Constitution Principle VI.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The anti-cheat and evaluation core modules achieve 100% line coverage in the test suite.
- **SC-002**: All unit tests execute successfully in an isolated CI pipeline (or local run) without relying on external shared databases or leaving orphaned processes.
- **SC-003**: Dedicated security test cases explicitly verify and log that test data cannot be accessed by the code being evaluated.
- **SC-004**: Test execution time for the core modules completes within 5 minutes locally.

## Assumptions

- We assume the existing backend architecture and sandbox tooling (e.g., Piston) will remain the primary evaluation engine.
- We assume tests will run via Vitest (as indicated by the Next Milestones in the project vision).
- Test environment setup will mock necessary database interactions for unit testing the evaluation logic and anti-cheat components.
