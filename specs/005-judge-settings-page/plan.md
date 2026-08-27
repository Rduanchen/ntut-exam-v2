# Implementation Plan: Judge Settings Page

**Branch**: `005-judge-settings-page` | **Date**: 2026-08-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-judge-settings-page/spec.md`

## Summary

Features 003 and 004 built fault attribution, runtime-changeable judging settings with provenance, and a health check that reports which languages a machine can actually run. **None of it is reachable from the application.** Tuning still means editing a file; a machine missing a language the exam needs is still discovered when students sit down.

This feature adds one page and no capability. Its work divides into three parts: presenting settings with the origin of each value and the grouping that explains their lifetimes; checking, before an exam, that this machine can run this exam paper; and introducing a test framework to a frontend that has none — which is larger than the page it exists to cover.

Two decisions carry most of the design weight. Languages are matched against the backend's **aliases** rather than by reproducing its mapping table, because `Cpp → c++` is not derivable and a duplicated contract has already drifted once here. And settings the page cannot read are named but never shown, because a confident wrong number about a running container is worse than an honest gap.

## Technical Context

**Language/Version**: TypeScript with Vue 3 single-file components.

**Primary Dependencies**: Vue, Vue Router, Pinia, Vuetify, axios (all present). **Added**: Vitest, Vue Test Utils, and a DOM environment — the frontend's first test framework.

**Storage**: None. The backend owns every value; this page holds view state only.

**Testing**: Vitest, aligned with the backend's runner and sharing Vite's configuration. Behaviour-level tests against a stubbed API module, not component internals.

**Target Platform**: Administrative browser UI on the exam host.

**Project Type**: Web application — the frontend half.

**Performance Goals**: An operator answers "can this machine run this exam?" in under a minute. No throughput concern; the page makes two requests.

**Constraints**:
- **No backend changes.** Every endpoint exists. Anything missing is a finding, not a task.
- The execution backend's own container settings are unobtainable (research S6), so US6 can name them but not show them.
- The exam paper and the execution backend name languages differently, and the mapping lives only in the backend (research D1).

**Scale/Scope**: One page, one store, one API module, one test framework. Roughly one view with three panels, plus tests for eight validation scenarios.

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1 design.*

- [x] **Type Safety** — *Initial: FAIL. Post-design: PASS for this feature's surface; a wider gap is recorded.*
  The frontend's exam-config type still describes the pre-004 schema — `judgerSettings` has three fields where the backend now has seven (research S1) — and nothing caught it, because nothing binds the two. `LanguageKey` is `string`, so a mistyped language is caught by nothing (S2). This feature types its own boundary strictly and adds a standalone type check, which makes the *next* drift visible. It does **not** bind the two schemas; that is recorded as a finding rather than smuggled in.

- [x] **Async & Concurrency** — *PASS.*
  Two independent requests. The design's only concurrency requirement is that they fail independently (research D7): health is the slower and more failure-prone, and also the P1 reason to open the page, so coupling them would make the most valuable panel hostage to the least reliable one.

- [x] **Security & Stability** — *PASS.*
  Authorisation already rides on the shared client's interceptor (S3); the page inherits it by using that client, and no new scheme is introduced. Stability is addressed by G1 and G9: nothing is displayed that was not reported, and a failed refresh clears values rather than leaving stale ones on screen at the moment an operator is deciding whether to change them.

- [x] **Low Coupling** — *PASS.*
  A typed API module, a store, and a view. NFR-COUPLE demands the page be testable without a live backend, and every scenario in the specification asserts something like "the backend says a language is missing" — reachable directly through the module, rather than by mocking HTTP inside a component and testing the mock.

- [x] **Testability** — *Initial: FAIL. Post-design: PASS.*
  The frontend has no test framework at all, and `vue-tsc` runs only inside `build` (S4). Both are addressed here. Every scenario in the specification maps to a validation in `quickstart.md`.

**Gate result: PASS.** Two principles were failing; both are addressed rather than waived. Complexity Tracking is empty — the one substantial addition is a test framework, which the constitution mandates.

## Project Structure

### Documentation (this feature)

```text
specs/005-judge-settings-page/
├── plan.md              # This file
├── spec.md              # 6 user stories, 16 FR, 8 SC
├── research.md          # Phase 0 — 6 source findings, 7 design decisions
├── data-model.md        # Phase 1 — 7 view entities, matching rule, failure matrix
├── quickstart.md        # Phase 1 — 8 validations
├── contracts/
│   └── page-contract.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 — NOT created by /speckit-plan
```

### Source Code

```text
frontend/
├── src/
│   ├── api/
│   │   ├── judging.ts            # exists (004) — the convention to follow
│   │   └── judge-settings.ts     # NEW — settings + health, strictly typed
│   ├── stores/
│   │   └── judge-settings.store.ts  # NEW — page state, drafts, language check
│   ├── views/
│   │   └── judge/
│   │       ├── JudgeSettingsView.vue        # NEW
│   │       └── components/                  # NEW — panels per setting group
│   ├── types/
│   │   └── config.ts             # judgerSettings is stale (S1) — see below
│   ├── router/index.ts           # + route
│   └── App.vue                   # + navigation entry
├── vitest.config.ts              # NEW — first test config
├── test/                         # NEW — first tests
└── package.json                  # + vitest, @vue/test-utils, DOM env;
                                  # + `test` and standalone `typecheck` scripts
```

**Structure Decision**: The existing view-per-folder layout is kept, and the API-module convention introduced in 004 is chosen over the inline-axios convention used by older stores (research S5). Panels are separate components because the three setting groups differ in *rules*, not merely in layout — one is read-only and shows no values at all — and keeping them separate makes that difference hard to erode.

**On the stale type (S1)**: `judgerSettings` in `frontend/src/types/config.ts` is updated to match the current schema, because this page reads those fields. Binding the two schemas so this cannot recur is **not** attempted here.

## Phase Outputs

| Phase | Artifact | Status |
|-------|----------|--------|
| 0 | `research.md` — 6 source findings, 7 design decisions, 0 unresolved unknowns | ✅ |
| 1 | `data-model.md` — view entities, language matching rule, failure matrix | ✅ |
| 1 | `contracts/page-contract.md` — consumed endpoints, 10 guarantees, non-guarantees | ✅ |
| 1 | `quickstart.md` — 8 validations mapped to success criteria | ✅ |
| 2 | `tasks.md` | Run `/speckit-tasks` |

## Risks

| Risk | Mitigation |
|------|-----------|
| **The test framework quietly expands into retrofitting the whole frontend.** It is the largest piece of this feature and the easiest to justify growing. | Out of scope in the specification, flagged in its checklist, and scoped in research D2 to this feature's page, store and module. The backlog it exposes is real and stays a backlog. |
| A false "language missing" warning minutes before an exam costs more than the check saves. | Matching uses the backend's own aliases, verified against a live instance (`c++` carries alias `cpp`). An unmatched language still reports missing — the safe direction, since a false "missing" is visible and a false "present" is not. |
| Displaying the compose file's defaults for container settings would look helpful and be wrong for anyone who deployed with an override. | G1: name them, show no value. Recorded as a finding for a future backend endpoint. |
| A settings panel that keeps its last-known values after a failed refresh misinforms an operator at the worst moment. | G9 requires a failed load to show no values at all, and V7 tests the refresh case specifically, not just the initial load. |
| The page is mistaken for new judging capability. | Stated as a non-guarantee in the contract and in quickstart's definition of done: every endpoint it calls already worked. |

## Findings recorded, not fixed here

All three would require backend changes, which this feature excludes:

- **The execution backend's container settings are not reportable** (S6). US6 names them; it cannot show them.
- **The language mapping lives only in the backend** (D1). Alias matching removes the need to copy it, but an explicit endpoint would be sturdier than inference.
- **Nothing binds the frontend's exam-config type to the backend schema** (S1). It has already drifted once, silently. The type check added here makes the next drift visible on demand; it does not prevent it.
