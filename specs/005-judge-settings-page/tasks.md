---
description: "Task list for 005-judge-settings-page"
---

# Tasks: Judge Settings Page

**Input**: Design documents from `/specs/005-judge-settings-page/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/page-contract.md ✅, quickstart.md ✅

**Tests**: MANDATORY (Constitution VI; spec NFR-TEST). The frontend has no test framework today — introducing one is part of this feature.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Path Conventions

Paths are relative to `frontend/` unless stated otherwise. **No file under `backend/` is touched by this feature** — every endpoint already exists.

---

## Phase 1: Setup

- [X] T001 Create branch `feat/005-judge-settings-page` from `develop` (Constitution III)
- [X] T002 Add `vitest`, `@vue/test-utils` and a DOM environment to `frontend/package.json` devDependencies (research D2)
- [X] T003 Create `frontend/vitest.config.ts` reusing the existing Vite config so the frontend does not acquire a second toolchain
- [X] T004 Add `test` and a **standalone** `typecheck` script to `frontend/package.json`. `vue-tsc` currently runs only inside `build`, which is why the stale type in research S1 went unnoticed — a type check nobody routinely runs is not a guard
- [X] T005 Prove the new suite can fail before relying on it: add one deliberately failing assertion, confirm the runner reports it, then remove it
- [X] T006 Record the baseline: `npm run build` and `npm run typecheck` in `frontend/`, capturing the current state so later failures are attributable

**Checkpoint**: A test runner exists and is known to work.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: every user story renders settings or health data, so the typed boundary and the store must exist first.

- [X] T007 Update `judgerSettings` in `frontend/src/types/config.ts` to match the current backend schema — it still lists three fields where the backend has seven (research S1). **Do not attempt to bind the two schemas**; that is recorded as a finding, and doing it here would expand this feature into the backend
- [X] T008 Create `frontend/src/api/judge-settings.ts` with strict types for `GET`/`PUT /admin/judger/settings` and `GET /admin/judger/health`, following the `src/api/judging.ts` convention rather than inline axios (research S5, D3). No `any` at the boundary
- [X] T009 Define the view entities from `data-model.md` in `frontend/src/types/` — `SettingOrigin`, `SettingGroup`, `EffectiveSetting`, `DraftEdit`, `BackendHealth`, `LanguageRequirement`
- [X] T010 Create `frontend/src/stores/judge-settings.store.ts` holding settings, health, drafts and load state, with settings and health loading **independently** so neither failure disables the other (research D7)
- [X] T011 Implement the group mapping in the store: which settings follow the exam paper, which describe this machine, and which belong to the execution backend's startup configuration (data-model § SettingGroup)

**Checkpoint**: Page state is reachable and testable without a live backend.

---

## Phase 3: User Story 1 — Confirm the machine can run this exam (Priority: P1) 🎯 MVP

**Goal**: Before an exam, an operator sees whether the execution backend is reachable and can run every language the paper requires.

**Independent test**: quickstart V1 — with a backend reporting only the C family and an exam requiring Python, the page names Python as missing; with an exam requiring `Cpp` against a backend reporting `c++`, it reports satisfied.

**Why first**: the only part of this feature addressing a failure that has already happened with no warning surface.

### Tests for US1

- [X] T012 [P] [US1] Add health fixtures in `frontend/test/fixtures/` — reachable with a full runtime set, reachable with only the C family, and unreachable
- [X] T013 [P] [US1] Add exam-config fixtures in `frontend/test/fixtures/` covering papers that require `Python`, `Cpp`, and a language no backend reports
- [X] T014 [US1] Test: an exam requiring a language the backend cannot run reports it missing **and names it** (FR-011, quickstart V1)
- [X] T015 [US1] Test: an exam requiring `Cpp` is **satisfied** by a runtime reporting `language: "c++"` with alias `cpp`. **Matching on the runtime name alone reports C++ missing on every machine** — this test is what distinguishes a working check from a permanent false alarm (research D1)
- [X] T016 [US1] Test: a language matched only by alias is reported as satisfied by the runtime that matched it
- [X] T017 [US1] Test: an unmatched language is reported missing rather than silently omitted — a false "missing" is visible and correctable; a false "present" is discovered during the exam
- [X] T018 [US1] Test: an unreachable backend is reported as a state and the page stays usable (FR-013)
- [X] T019 [US1] Test: re-running the check updates the result without a reload (FR-012)

### Implementation for US1

- [X] T020 [US1] Implement language matching in `frontend/src/stores/judge-settings.store.ts`: lowercase the exam's language key, then match a runtime's `language` **or** any of its `aliases`. **Do not copy the backend's mapping table** — a second copy of a contract has already drifted here once (research D1, S1)
- [X] T021 [US1] Create the health panel in `frontend/src/views/judge/components/` showing reachability, installed languages and versions, and `checkedAt` — "reachable" with no timestamp is a claim about an unknown moment, and the point is checking shortly before an exam
- [X] T022 [US1] Surface missing languages prominently in the health panel, naming each (FR-011)
- [X] T023 [US1] Add a manual re-check control that refreshes without reloading the page (FR-012)

**Checkpoint**: US1 tests green. The pre-exam check that did not exist now exists.

---

## Phase 4: User Story 2 — See where each setting's value came from (Priority: P1)

**Goal**: Every displayed setting says whether its value was chosen, seeded, defaulted, or rejected.

**Independent test**: quickstart V2 — settings from different origins are distinguishable, and a clamped setting is distinct in kind and states the value actually in force.

### Tests for US2

- [X] T024 [P] [US2] Add settings fixtures in `frontend/test/fixtures/` covering all four origins including `clamped`
- [X] T025 [US2] Test: a setting from the configuration is distinguishable from one taking a default (FR-002)
- [X] T026 [US2] Test: a `clamped` setting is distinct **in kind** from the other three and states the value actually in force (FR-003). The other three describe where a working value came from; `clamped` says the operator's value was refused, and that is the only one requiring action
- [X] T027 [US2] Test: an unrecognised origin renders without breaking the page (FR-016)

### Implementation for US2

- [X] T028 [US2] Render each setting with its value and an origin marker in `frontend/src/views/judge/components/` (FR-002)
- [X] T029 [US2] Give `clamped` a visually distinct treatment and show the applied value alongside the rejected one (FR-003, research D4)

**Checkpoint**: US2 tests green. No number on the page is unattributable — which is what the original incident was.

---

## Phase 5: User Story 3 — Change a setting without editing files (Priority: P1)

**Goal**: An operator edits a value, saves, and it takes effect with no restart.

**Independent test**: quickstart V3 and V4 — a saved value takes effect and the page shows what the backend reports; an unsaved edit is distinguishable from the value in force.

### Tests for US3

- [X] T030 [US3] Test: saving applies the value and the page then shows the value **in force** (FR-007)
- [X] T031 [US3] Test: when the backend clamps a saved value, the page shows the **applied** value, not the typed one. These differ precisely when it matters most
- [X] T032 [US3] Test: a failed save is reported and the attempted value is **not** shown as in force (FR-008)
- [X] T033 [US3] Test: an unsaved edit is distinguishable from the value in force and nothing has been applied (FR-009, quickstart V4)

### Implementation for US3

- [X] T034 [US3] Implement draft tracking in `frontend/src/stores/judge-settings.store.ts`, keeping drafts separate from values in force (data-model § DraftEdit)
- [X] T035 [US3] Implement explicit save that refreshes from the backend's response rather than echoing the input (research D6). A ceiling applied per keystroke makes a half-typed `12` briefly `1`
- [X] T036 [US3] Render editable controls with a visible dirty state and a save action in `frontend/src/views/judge/components/` (FR-009)
- [X] T037 [US3] Report save failures without promoting the draft into the displayed value (FR-008)

**Checkpoint**: US3 tests green. Tuning no longer requires a file or a restart.

---

## Phase 6: User Story 4 — Understand what a configuration upload replaces (Priority: P2)

**Goal**: The page states, where settings are edited, that uploading a configuration file replaces them.

**Independent test**: quickstart V5 — the statement appears with the editable settings, and groups are distinguishable.

### Tests for US4

- [X] T038 [P] [US4] Test: both editable groups carry the replacement statement (FR-006). It applies to both, which is why it cannot be attached to only one
- [X] T039 [US4] Test: settings following the exam paper are distinguishable from those describing this machine (FR-004)

### Implementation for US4

- [X] T040 [US4] Render the exam-paper and machine groups as separate, labelled sections in `frontend/src/views/judge/JudgeSettingsView.vue` (FR-004)
- [X] T041 [US4] State the replacement behaviour within each editable group (FR-006). It is the most surprising consequence of the deployment model, and an operator who loses tuning silently will conclude the page is broken

**Checkpoint**: US4 tests green.

---

## Phase 7: User Story 5 — Capacity is measured, not guessed (Priority: P2)

**Goal**: The concurrency ceiling is presented as a property of this machine, with the measurement method.

**Independent test**: quickstart V6 — the ceiling carries guidance identifying it as machine-specific and pointing to the sweep method.

### Tests for US5

- [X] T042 [P] [US5] Test: the concurrency ceiling is presented in the machine group with measurement guidance attached (FR-014)

### Implementation for US5

- [X] T043 [US5] Add guidance beside the concurrency ceiling in `frontend/src/views/judge/components/`: it describes this machine, must be measured by the sweep method in the root `README.md`, and **must be re-measured when an exam paper moves to different hardware** — it travels with the paper while describing the machine, which is the one trap in this design

**Checkpoint**: US5 tests green.

---

## Phase 8: User Story 6 — Settings changed elsewhere (Priority: P3)

**Goal**: The execution backend's own startup settings are visible as read-only and name where they are changed.

**Independent test**: quickstart V6 — they are shown as not editable here, name their governing file, and display **no value**.

### Tests for US6

- [X] T044 [P] [US6] Test: container settings are rendered read-only and **carry no value** (FR-005, research D5)

### Implementation for US6

- [X] T045 [US6] Render the container group in `frontend/src/views/judge/components/` naming each setting and the file that governs it — **without displaying a value**. Nothing exposes these, and showing the compose file's defaults would be a confident wrong number for anyone who deployed with an override. An honest gap beats a plausible lie

**Checkpoint**: US6 tests green.

---

## Phase 9: Wiring & Navigation

- [X] T046 Create `frontend/src/views/judge/JudgeSettingsView.vue` composing the health, exam, machine and container panels
- [X] T047 Add the route in `frontend/src/router/index.ts`
- [X] T048 Add the navigation entry in `frontend/src/App.vue`, separate from the exam paper editor (FR-001)
- [X] T049 Test: the page loads with settings failed and health succeeded, and vice versa; each leaves the other usable (SC-008, quickstart V7)
- [X] T050 Test: a settings **refresh** that fails after a successful load leaves **no values** on screen (FR-015). Test the refresh specifically, not just the initial load — stale values presented as current mislead an operator at the exact moment they are deciding whether to change something

**Checkpoint**: the page is reachable and fails safely.

---

## Phase 10: Polish & Validation

- [X] T051 Run the full frontend suite and `npm run typecheck` in `frontend/` — both green
- [X] T052 Confirm no `any` at the API boundary in `frontend/src/api/judge-settings.ts` (NFR-TYPE)
- [X] T053 Walk every validation V1–V8 in `quickstart.md` and record each outcome against its success criterion
- [X] T054 Verify against a live backend that the language check reports correctly for a real runtime set — the alias behaviour is the one design decision resting on an external system's data
- [X] T055 Update `knowledge/draft/piston穩定度與併發問題.md` marking section C complete; the draft may then retire
- [X] T056 Update `knowledge/vision.md`, which records "前端 Vitest 尚未導入" — no longer true, though it now covers one feature rather than the frontend
- [X] T057 Record the three findings from `plan.md` in `knowledge/draft/` so they are not lost: container settings are not reportable, the language mapping lives only in the backend, and nothing binds the frontend's exam-config type to the backend schema

---

## Dependencies

```
Phase 1 (Setup)
      ▼
Phase 2 (Foundational)
      │
      ├──► Phase 3 (US1) 🎯 MVP
      ├──► Phase 4 (US2)
      ├──► Phase 5 (US3) ── needs Phase 4's rendering
      ├──► Phase 6 (US4)
      ├──► Phase 7 (US5)
      └──► Phase 8 (US6)
                │
                ▼
        Phase 9 (Wiring)
                │
                ▼
        Phase 10 (Validation)
```

| Story | Depends on | Can ship alone? |
|-------|-----------|-----------------|
| US1 (P1) | Phase 2 | ✅ The pre-exam check, valuable with no settings UI at all |
| US2 (P1) | Phase 2 | ✅ |
| US3 (P1) | Phase 2, US2 | ✅ once US2 renders |
| US4 (P2) | Phase 2 | ✅ |
| US5 (P2) | Phase 2 | ✅ |
| US6 (P3) | Phase 2 | ✅ |

---

## Parallel Execution Examples

**Phase 2** — different files:
```
T008 (api module) ∥ T009 (view types)
T010 → T011 sequential (same store)
```

**Phase 3** — fixtures first, then tests in parallel:
```
T012 ∥ T013  →  T014 ∥ T015 ∥ T016 ∥ T017 ∥ T018 ∥ T019
```

**Cross-phase** — US4, US5 and US6 touch different panels and can proceed alongside US2/US3.

---

## Implementation Strategy

### MVP scope

**Phases 1–3** delivers US1: an operator can confirm, before an exam, that this machine can run this exam paper. Valuable even if no setting is ever editable from the page, and it addresses the only failure here that has already happened.

### Incremental delivery

1. Phase 1–2 → test framework, typed boundary, store
2. Phase 3 (US1) → **MVP — the pre-exam check**
3. Phase 4 + 5 (US2, US3) → attributable values, then editing
4. Phases 6–8 (US4, US5, US6) → the deployment model made visible
5. Phase 9 → reachable from navigation, failing safely
6. Phase 10 → validate and reflow the knowledge base

### Watch this

**The test framework is the largest piece of this feature, and the easiest to justify growing.** Phase 1 introduces it; Phases 3–8 use it for this page only. Retrofitting the rest of the frontend is out of scope in the specification, its checklist, and research D2 — three places, because it will be tempting in all of them. The backlog it exposes is real and stays a backlog.

### What this feature does not deliver

**No new capability.** Every endpoint this page calls already worked before it existed. What changes is that a person can reach it — which, for two features, has been the difference between capability and no capability at all.
