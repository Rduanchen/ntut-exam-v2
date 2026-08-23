---

description: "Task list template for feature implementation"
---

# Tasks: 001-secure-backend-tests

**Input**: Design documents from `/specs/001-secure-backend-tests/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: This entire feature is about tests. 100% test coverage target.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Verify/update Vitest configuration for coverage and globals in `backend/vitest.config.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Implement global test setup (in-memory SQLite, `vi.mock` for sockets) in `backend/test/setup.ts`
- [x] T003 Create `MockPayload` and `MockSession` factories in `backend/test/utils/mockFactories.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Secure and Isolated Evaluation Testing (Priority: P1) 🎯 MVP

**Goal**: Verify that test data and secrets are isolated from the evaluation sandbox.

**Independent Test**: The malicious payload tests run locally and pass securely.

### Implementation for User Story 1

- [x] T004 [P] [US1] Write sandbox filesystem isolation tests in `backend/test/unit/judger.isolation.test.ts`
- [x] T005 [P] [US1] Write sandbox network isolation tests in `backend/test/unit/judger.network.test.ts`
- [x] T006 [US1] Ensure Judger implementation passes isolation tests (refactor if necessary) in `backend/src/modules/judger/index.ts`

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Extreme Output Handling (Priority: P1)

**Goal**: Verify that infinite loops (TLE) and massive outputs are safely truncated without freezing the backend.

**Independent Test**: The infinite printing payload test passes and truncates the string properly.

### Implementation for User Story 2

- [x] T007 [P] [US2] Write output truncation test (huge stdout) in `backend/test/unit/judger.truncation.test.ts`
- [x] T008 [P] [US2] Write TLE (Time Limit Exceeded) infinite loop test in `backend/test/unit/judger.timeout.test.ts`
- [x] T009 [US2] Ensure Judger implementation correctly truncates and times out (refactor if necessary) in `backend/src/modules/judger/index.ts`

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Anti-Cheat and Rebinding Fallbacks (Priority: P2)

**Goal**: Verify IP fallbacks and explicit TA approval for device rebinding.

**Independent Test**: Login tests with mocked conflicting devices correctly require TA approval.

### Implementation for User Story 3

- [x] T010 [P] [US3] Write IP fallback logic test in `backend/test/unit/auth.ip-fallback.test.ts`
- [x] T011 [P] [US3] Write device rebinding (TA approval state) test in `backend/test/unit/auth.rebinding.test.ts`
- [x] T012 [US3] Ensure Auth module passes rebinding logic (refactor if necessary) in `backend/src/modules/auth/index.ts`

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T013 Verify 100% line coverage for targeted modules (`vitest run --coverage`)
- [x] T014 Run validation via `quickstart.md` to ensure all tests execute in < 5 minutes
- [x] T015 Clean up any orphaned processes left by sandbox tests in `backend/test/setup.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - US1 and US2 can proceed in parallel.
  - US3 can proceed in parallel as well.
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2)
- **User Story 2 (P1)**: Can start after Foundational (Phase 2)
- **User Story 3 (P2)**: Can start after Foundational (Phase 2)

### Parallel Opportunities

- T004, T005, T007, T008, T010, T011 can be worked on concurrently by different agents once Foundational (Phase 2) is complete, because they test different behaviors and live in different files.

---

## Parallel Example: User Story 1 & 2

```bash
# Launch isolation and truncation tests together:
Task: "Write sandbox filesystem isolation tests in backend/test/unit/judger.isolation.test.ts"
Task: "Write output truncation test (huge stdout) in backend/test/unit/judger.truncation.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Verify Sandbox Isolation (MVP!)
3. Add User Story 2 → Verify Output Truncation
4. Add User Story 3 → Verify Anti-Cheat Rebinding
