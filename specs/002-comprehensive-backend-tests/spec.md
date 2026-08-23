# Feature Specification: Comprehensive Backend Tests

**Feature Branch**: `[002-comprehensive-backend-tests]`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "單元測試：必須涵蓋後端 src/services/ 底下的所有 16 個 Service 檔案的核心業務邏輯。整合測試：必須以 src/controllers/ 為單位，使用 supertest 模擬真實 HTTP 請求，驗證 API 路由。測試環境應延續 in-memory SQLite 與 mock 策略。整合一下 /test 的程式，現在太亂了"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Service Logic Unit Tests (Priority: P1)

Developers need robust unit tests covering all 16 background services so that core logic is validated independently of HTTP interfaces.

**Why this priority**: Business logic lives in services. Securing this ensures the app functions reliably at a foundational level.

**Independent Test**: Can be fully tested by running service-level unit tests and validating logic coverage and correctness.

**Acceptance Scenarios**:

1. **Given** a service module, **When** unit tests are executed, **Then** all core logic branches are covered without triggering real external HTTP/API calls.
2. **Given** test environment configuration, **When** tests touch the database, **Then** they write safely to the in-memory SQLite instance instead of a file.

---

### User Story 2 - Controller Integration Tests (Priority: P1)

Developers need integration tests on all `admin` and `user` controllers to verify that routing, HTTP payloads, controllers, and services are correctly integrated.

**Why this priority**: API endpoints are the entry to the system. We must guarantee endpoints correctly parse requests and return accurate HTTP responses via the services.

**Independent Test**: Can be tested by invoking `supertest` requests against the Express app and verifying status codes and JSON payloads.

**Acceptance Scenarios**:

1. **Given** a valid HTTP request to a controller, **When** `supertest` dispatches it, **Then** the request correctly flows through the controller into the service and yields a successful HTTP response.
2. **Given** an invalid HTTP request (e.g. missing fields, unauthorized), **When** `supertest` dispatches it, **Then** the global error handler intercepts and returns correct error structures (e.g., 400 or 403).

---

### User Story 3 - Test Folder Reorganization (Priority: P2)

Developers need a clean, structured `backend/test` directory so they can easily locate, run, and maintain specific types of tests.

**Why this priority**: The current test folder is disorganized ("太亂了"), which reduces maintainability and developer velocity.

**Independent Test**: Can be verified by visually inspecting the folder hierarchy and running `vitest` to ensure all tests still execute properly in their new locations.

**Acceptance Scenarios**:

1. **Given** the current messy `backend/test` directory, **When** the refactoring is complete, **Then** tests are distinctly separated into `unit/` and `integration/` folders (and further grouped by module/domain).
2. **Given** the reorganized structure, **When** `npm run test` is executed, **Then** all tests are successfully discovered and pass successfully.

### Edge Cases

- What happens when an integration test triggers a service that heavily relies on an external mocked library?
- How does the system handle database resets (clearing the in-memory SQLite) between integration test suites?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST have unit tests for all 16 `src/services/` files, isolating external calls.
- **FR-002**: System MUST have integration tests for all `src/controllers/` files using `supertest`.
- **FR-003**: System MUST execute tests using in-memory SQLite (`:memory:`) to guarantee speed and isolation.
- **FR-004**: System MUST organize `backend/test/` into a clear hierarchy (e.g., `test/unit/services/`, `test/integration/controllers/`).
- **FR-005**: System MUST provide global setup files to clear/reset the database properly before/after tests to avoid state bleed.

### Non-Functional Requirements (Constitution Mandated)

- **NFR-SEC**: The backend MUST be absolutely secure (zero-tolerance for data breaches or injection vulnerabilities).
- **NFR-CONC**: The system MUST handle high concurrency gracefully using asynchronous processing.
- **NFR-TYPE**: All interfaces and data boundaries MUST be strictly type-safe.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the 16 service files have dedicated unit test files.
- **SC-002**: 100% of the controller files have dedicated integration test files using `supertest`.
- **SC-003**: The entire test suite (unit + integration) executes in under 20 seconds using in-memory SQLite.
- **SC-004**: The `backend/test/` directory cleanly segregates `unit` and `integration` tests without loose, disorganized test files in the root.

## Assumptions

- We assume `supertest` is or will be installed as a dev dependency.
- We assume all models are correctly registered with the Sequelize instance during the test setup phase.
- We assume external sandboxes (like Piston) will continue to be mocked during these tests.
