---
description: "Task list for 003-judge-fault-attribution"
---

# Tasks: Judge Fault Attribution

**Input**: Design documents from `/specs/003-judge-fault-attribution/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/public-api.md ✅, quickstart.md ✅

**Tests**: MANDATORY (Constitution VI — 100% test coverage; spec NFR-TEST and SC-005).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to

## Path Conventions

**All `src/`, `test/`, `scripts/` paths below are relative to the target repository:**

```
~/Documents/my-code/ntut-exam/node-piston/
```

Spec artifacts live in `ntut-exam-v2/host/specs/003-judge-fault-attribution/`. The two repositories are distinct — do not create source files under `host/`.

---

## Phase 1: Setup

**Purpose**: Prepare the target repository without destroying existing work.

- [X] T001 Create branch `feat/003-judge-fault-attribution` in `~/Documents/my-code/ntut-exam/node-piston/` (Constitution III forbids direct commits to `main`/`develop`)
- [X] T002 Record the working-tree baseline: confirm the prettier-era reformatting in `src/client.ts`, `src/index.ts`, `tsconfig.json`, `package.json` is intentional and MUST be preserved; capture `git diff` before any edit so the reformatting can be distinguished from this feature's changes (plan.md § Working-tree constraint)
- [X] T003 Run `npm install && npm run build && npx vitest run` in the target repo and record the baseline result, so later failures are attributable to this feature
- [X] T004 [P] Create `scripts/` directory in the target repo for manual smoke scenarios relocated out of the published surface (research D9)

**Checkpoint**: Branch exists, baseline recorded, existing work protected.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The type layer every classification task builds on. Fixes research S2/S3/S7.

**⚠️ CRITICAL**: US1, US3, US4 and US5 cannot begin until this phase is complete. **US2 is independent of this phase and may proceed in parallel** (see Implementation Strategy).

- [X] T005 Define the `StageOutcome` type in `src/client.ts` with the fields and authorship annotations from data-model.md § StageOutcome, documenting in comments which fields are submission-authored and therefore forbidden as attribution inputs
- [X] T006 Add the optional `compile` stage to `ExecutionResult` in `src/client.ts` so the compile stage is reachable by typed consumers (research S3/D7) — absence means "interpreted language", never "stage passed"
- [X] T007 Replace `export type Result = any | {...} | undefined` in `src/client.ts` with the `ExecutionOutcome` discriminated union from data-model.md, using a literal discriminant so the compiler narrows (research S2/D6). **No exported type may contain `any`.**
- [X] T008 Update `execute()` and `runtimes()` in `src/client.ts` to return the new types, removing the `any`-typed `argA/argB/argC` overload parameters
- [X] T009 Delete `ExtendedExecutionResult` from `src/judger.ts` and re-point all judging functions at `ExecutionResult` (research D7; removes the judging-layer-patches-transport-layer coupling noted in plan.md § Low Coupling)
- [X] T010 Change `tsconfig.json` to bring `test/**/*` under type checking — remove the `**/*.test.ts` exclusion and extend `include` (research S7/D8). **Preserve the existing formatting and comments.**
- [X] T011 Wire the type check into the test command in `package.json` (`tsc --noEmit && vitest run`) so fixtures cannot drift from the contract (transplants `knowledge/experience.md` #4)
- [X] T012 Update every fixture in `test/fixtures/` (`c.ts`, `python.ts`, `json/`) to type-check against the new types, fixing any drift the new type check exposes

**Checkpoint**: `npx tsc --noEmit` passes across `src/` and `test/`. Type layer ready.

---

## Phase 3: User Story 1 — A system failure is never charged to the student (Priority: P1) 🎯 MVP

**Goal**: A compile stage terminated by the machine is attributed to the system, never recorded as the student's compilation error. Consumers read attribution in one step.

**Independent test**: Judge a recorded result whose compile stage reports `code: null`, `signal: SIGKILL`, `status: TO`, `stderr: ""` → expect `CTLE` / `system`. Judge a genuine compiler diagnostic → expect `CE` / `submission`. Both directions must hold (quickstart V2).

### Tests for US1

- [X] T013 [P] [US1] Add a fixture in `test/fixtures/` for a compile stage terminated on wall-clock time (`code: null`, `signal: "SIGKILL"`, `status: "TO"`, `message: "Time limit exceeded (wall clock)"`, `stderr: ""`) — the recorded shape from the real incident
- [X] T014 [P] [US1] Add a fixture in `test/fixtures/` for a genuine compiler diagnostic (non-zero `code`, populated `stderr`, `signal: null`)
- [X] T015 [P] [US1] Add a fixture in `test/fixtures/` for the execution-failure arm (backend unreachable) produced by `execute()` when transport fails
- [X] T016 [US1] Test in `test/judger.test.ts`: compile-timeout fixture judges to `CTLE` with `attribution: system` (spec SC-001, quickstart V2)
- [X] T017 [US1] Test in `test/judger.test.ts`: genuine-diagnostic fixture judges to `CE` with `attribution: submission` — guards against a fix that attributes everything to the system
- [X] T018 [US1] Test in `test/judger.test.ts`: `judge()` accepts the execution-failure arm and returns `SE` / `system` **without throwing** (spec FR-010, quickstart V4)
- [X] T019 [US1] Test in `test/judger.test.ts`: `details` carries the per-stage backend facts through unmodified (spec FR-004, contract G7)
- [X] T020 [US1] Test in `test/judger.test.ts`: a terminated stage's empty output is never compared against expected output and never reported as `WA` (spec FR-011, contract G9)
- [X] T021 [US1] Test in `test/judger.test.ts`: an absent compile stage (interpreted language) is treated as neither a pass nor a failure of that stage (spec Edge Cases)

### Implementation for US1

- [X] T022 [US1] Add the `FaultAttribution` enum (`submission` / `system`) and the `CTLE` verdict to `StatusCode` in `src/judger.ts` (research D1)
- [X] T023 [US1] Add the required `attribution` field to `JudgedResult` in `src/judger.ts`, so every result carries it including successful ones (contract G4)
- [X] T024 [US1] Implement a stage-aware system-termination predicate in `src/judger.ts` keyed on `status` (`TO`, `XX`) per data-model.md, replacing the exit-code-only `isCompilationError` test. **A null exit code alone is never evidence of a submission fault; a signal alone is never evidence of a system fault** (research D2)
- [X] T025 [US1] Reorder `judgeStatus` in `src/judger.ts` to the normative attribution order in data-model.md § Attribution decision order — **no submission verdict may be produced before every system-attributable condition is ruled out**. This ordering is the fix: the incident was caused by the compile-error branch running before any timeout check
- [X] T026 [US1] Make `judgeStatus` in `src/judger.ts` accept the execution-failure arm and return `SE` / `system` instead of dereferencing `result.run` and throwing (research S5/D6)
- [X] T027 [US1] Guard the output-comparison branch in `src/judger.ts` on "run stage completed normally AND expected output supplied" (spec FR-011)

**Checkpoint**: US1 tests green. The incident is fixed. This alone is a shippable increment — no student is charged for a system failure.

---

## Phase 4: User Story 2 — The package is safe to import and publish (Priority: P1)

**Goal**: Importing the package does nothing, and no submission content ever reaches a process output stream.

**Independent test**: Import the **built** package with no backend reachable → zero network requests, zero bytes on stdout/stderr (quickstart V1).

**⚠️ This phase gates publication.** The current working tree leaks student source code on every call.

### Tests for US2

- [X] T028 [P] [US2] Test in `test/` asserting that importing the built entry point (`dist/index.js`, **not** `src/`) issues no network request and writes nothing to stdout or stderr — the residue is compiled into the published artifact, so checking source alone does not prove it (quickstart V1)

### Implementation for US2

- [X] T029 [P] [US2] Remove `console.log("Request body:", JSON.stringify(requestBody))` from `execute()` in `src/client.ts` — this logs the student's **full source code** (research S1, spec NFR-SEC)
- [X] T030 [P] [US2] Remove `console.log("POST response:", response.data)` from `post()` in `src/client.ts` — this logs the full execution output
- [X] T031 [US2] Remove the module-level `test2()` invocation and the surrounding scratch scenarios from `src/index.ts` (research D9), and remove the unused `import { VERSION } from "axios"`
- [X] T032 [US2] Relocate the smoke scenarios removed in T031 into `scripts/` as an explicitly-run script, outside the published surface
- [X] T033 [US2] Assess `src/test.ts` (pre-existing scratch module) — remove it or move it to `scripts/`; it must not reach `dist/`
- [X] T034 [US2] Verify no process-level output remains anywhere in `src/`: grep for `console.`, `process.stdout`, `process.stderr` and confirm zero hits (contract G2)

**Checkpoint**: US2 tests green. Package is safe to publish and no longer leaks submissions.

---

## Phase 5: User Story 3 — A submission cannot forge system status (Priority: P2)

**Goal**: What a student's program prints has no effect on how its result is attributed.

**Independent test**: Judge a normally-completed submission whose `stderr` (and separately `stdout`) contains `Killed` → verdict and attribution identical to the same result without that text (quickstart V3).

### Tests for US3

- [X] T035 [P] [US3] Add a fixture in `test/fixtures/` for a submission that completes normally but prints `Killed` to `stderr`, and a variant printing it to `stdout`
- [X] T036 [P] [US3] Add a fixture in `test/fixtures/` for a genuine memory-limit termination, where the evidence exists only in backend-authored fields (`signal`, `status`, `memory`)
- [X] T037 [US3] Test in `test/judger.test.ts`: the forged-text fixtures judge identically to their clean counterparts — attribution unchanged (spec SC-004, contract G5). **This is an anti-cheat test, not only a correctness test**
- [X] T038 [US3] Test in `test/judger.test.ts`: the genuine memory-limit fixture judges to `MLE` from backend fields alone

### Implementation for US3

- [X] T039 [US3] Rewrite `isMemoryExceeded` in `src/judger.ts` to decide from `signal`, `status` and reported `memory` against the caller's allowance — remove `runInfo.stderr?.includes("Killed")` (research D3)
- [X] T040 [US3] Rewrite `isRuntimeError` in `src/judger.ts` to remove `runInfo.stderr?.includes("Killed")` — **the same defect appears here, not only in `isMemoryExceeded`** (research S4)
- [X] T041 [US3] Add a guard test in `test/` asserting that no attribution predicate in `src/judger.ts` references `stdout`, `stderr`, or `output` — the trust boundary from data-model.md is checkable by inspection, so make it enforced rather than remembered

**Checkpoint**: US3 tests green. A student can no longer choose their own verdict.

---

## Phase 6: User Story 4 — Correctness-affecting limits are visible (Priority: P3)

**Goal**: No caller can unknowingly inherit a limit that changes a verdict.

**Independent test**: Execute without supplying a compile-stage allowance; the result reports the value applied, and the same value is readable from exported defaults without executing (quickstart V7).

### Tests for US4

- [X] T042 [P] [US4] Test in `test/`: an execution without caller-supplied limits reports the effective values applied, matching the exported defaults
- [X] T043 [P] [US4] Test in `test/`: an execution with caller-supplied limits reports the supplied values

### Implementation for US4

- [X] T044 [US4] Export `DEFAULT_LIMITS` as a named public constant from `src/client.ts`, replacing the inline `or(config.compile_timeout, 10000)` literals (research D5) — **the silent 10 s default was this incident's trigger**
- [X] T045 [US4] Populate `EffectiveLimits` on the execution result in `src/client.ts` per data-model.md, so a stored result records the allowances it was judged under
- [X] T046 [US4] Remove the dead `timeLimit` and `cpuTimeLimit` options from `JudgeOptions` and `judgeStatus` in `src/judger.ts` — they are destructured and never used, implying a guarantee the library does not provide (research S8)

**Checkpoint**: US4 tests green. No limit affects a verdict invisibly.

---

## Phase 7: User Story 5 — The runtime catalogue does not go stale (Priority: P3)

**Goal**: A newly installed language becomes usable without restarting the consuming system.

**Independent test**: Query twice inside the freshness window → backend contacted once; advance the clock past it → refetch occurs (quickstart V6).

### Tests for US5

- [X] T047 [P] [US5] Test in `test/`: two queries inside the freshness window contact the backend once, using an injected clock rather than a real sleep
- [X] T048 [P] [US5] Test in `test/`: a query past the freshness window triggers a refetch
- [X] T049 [US5] Test in `test/`: a failed refetch past the window is surfaced to the caller — **not** silently served from the stale copy and **not** returned as an empty catalogue (spec FR-009, contract G10)

### Implementation for US5

- [X] T050 [US5] Replace the unbounded `store.runtimes` cache in `src/client.ts` with a TTL-bounded `RuntimeCatalogue` carrying `fetchedAt`, default 5 minutes and caller-overridable (research D4)
- [X] T051 [US5] Make refresh failures surface to the caller in `src/client.ts` rather than falling back to the stale copy
- [X] T052 [US5] Make the clock injectable in `src/client.ts` so freshness is testable without real time passing

**Checkpoint**: US5 tests green.

---

## Phase 8: Polish, Release Preparation & Handoff

**Purpose**: Make the release verifiable and hand it to the maintainer. **No task in this phase publishes anything.**

- [X] T053 [P] Update `README.md` in the target repo with the v0.2.0 contract: the `attribution` field, the new `CTLE` verdict, and the migration table from `contracts/public-api.md`
- [X] T054 [P] Document the non-guarantees in `README.md` — no saturation protection, no reduction in compilation load, no retry — so the consuming system does not mistake this release for a stability fix
- [X] T055 Bump `version` to `0.2.0` in `package.json` (research D10)
- [X] T056 Run the full suite: `npx tsc --noEmit && npx vitest run` — must be green across `src/` and `test/`
- [X] T057 Walk every validation V1–V7 in `quickstart.md` and record the outcome of each against its success criterion
- [X] T058 Run `npm run build && npm pack --dry-run`; confirm from the packed file list that no scratch or manual-test entry point is included and the version is `0.2.0` (spec SC-007)
- [X] T059 Grep the **built** `dist/index.js` for module-level invocations and for `console.` — confirm zero hits (contract G1, G2; the source-level check in T034 is not sufficient evidence about the artifact)
- [ ] T060 Report the packed file list and the V1–V7 outcomes to the maintainer and **stop**. Publication requires `npm login` and is a human action — the automated agent MUST NOT run `npm publish` (spec FR-012)
- [ ] T061 After the maintainer publishes, update `knowledge/draft/piston穩定度與併發問題.md` in the host repo to mark plan section A complete and record the published version

---

## Dependencies

```
Phase 1 (Setup)
   ├─────────────────────────────┐
   ▼                             ▼
Phase 2 (Foundational)      Phase 4 (US2) ── independent of the type layer
   │                             │
   ├──► Phase 3 (US1) 🎯 MVP     │
   ├──► Phase 5 (US3)            │
   ├──► Phase 6 (US4)            │
   └──► Phase 7 (US5)            │
            │                    │
            └────────┬───────────┘
                     ▼
              Phase 8 (Release)
```

**Story independence**:

| Story | Depends on | Can ship alone? |
|-------|-----------|-----------------|
| US1 (P1) | Phase 2 | ✅ Yes — fixes the incident |
| US2 (P1) | Phase 1 only | ✅ Yes — unblocks publication |
| US3 (P2) | Phase 2 | ✅ Yes — closes the forgery hole |
| US4 (P3) | Phase 2 | ✅ Yes |
| US5 (P3) | Phase 2 | ✅ Yes |

**Within Phase 3**: T013–T015 (fixtures) are parallel; T016–T021 (tests) depend on them; T022–T027 (implementation) share `src/judger.ts` and are therefore **sequential**, and T025 (reordering) depends on T024 (the predicate it orders).

---

## Parallel Execution Examples

**Phase 2 kick-off** — different files:
```
T005/T006/T007/T008 (src/client.ts — sequential among themselves)
T010 (tsconfig.json)        ─┐ parallel with the client.ts work
T011 (package.json)         ─┘
```

**Phase 3 fixtures** — all different files, no shared state:
```
T013 ∥ T014 ∥ T015
```

**Phase 4** — T029 and T030 touch different functions in `src/client.ts`; treat as sequential if edited in one pass, parallel if split:
```
T028 (test) ∥ T031 (src/index.ts)
```

**Cross-phase** — the highest-value parallelism in this feature:
```
Phase 4 (US2) runs alongside Phase 2 + Phase 3
```

---

## Implementation Strategy

### Do US2 first, despite US1 being the headline

US1 is why this feature exists, but **US2 is a live leak right now**: `src/client.ts` writes every student's full source code to stdout on every call, in the current working tree. It is four small deletions (T029–T031) with no dependency on the type layer. Sweep it before anything else, then return to the MVP path.

### MVP scope

**Phase 1 + Phase 2 + Phase 3 (US1)** — delivers the fix for the actual incident: no student is charged for a system failure. Independently testable via quickstart V2, and independently valuable even if nothing else lands.

### Incremental delivery

1. Phase 1 → branch and baseline
2. Phase 4 (US2) → stop the leak *(out of numeric order, deliberately)*
3. Phase 2 → type layer
4. Phase 3 (US1) → **MVP — incident fixed**
5. Phase 5 (US3) → anti-cheat hole closed
6. Phases 6–7 (US4, US5) → visibility and freshness
7. Phase 8 → verify, hand off, human publishes

### What this feature does not deliver

Stated so the sequencing is not misread: after all 61 tasks, judging is **not faster** and the backend is **still saturable**. This feature makes attribution correct. Preventing saturation (global concurrency limit, asynchronous judging, Piston container configuration) belongs to the consuming system and is tracked in `knowledge/draft/piston穩定度與併發問題.md` sections B–D. The incident is not closed in production until the consuming system also migrates to this contract.
