# Implementation Plan: Judge Fault Attribution

**Branch**: `003-judge-fault-attribution` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-judge-fault-attribution/spec.md`

**Target repository**: `~/Documents/my-code/ntut-exam/node-piston` — published as npm package `piston-judger`. Spec artifacts live in this repository because Spec Kit is installed here; the code changes land in the target repository.

## Summary

The judging library collapses "the machine killed the compiler" and "the student wrote broken code" into the same verdict, because it classifies a compile stage by exit status alone and a null exit status is not zero. Under load this charged system saturation to students as Compilation Errors — measured at 23% of submissions at concurrency 30.

The fix is to make **fault attribution a first-class part of the result contract** rather than something each consumer re-derives: the execution layer reports facts, the judging layer classifies them, and every judged result carries an explicit `submission`/`system` attribution. Three supporting changes fall out of the same principle — attribution stops reading submission-authored output streams (an anti-cheat hole), transport failures become judgeable instead of throwing (which removes the consumer's hand-rolled pre-check), and the result types stop erasing to `any` (which is why the consumer had to hand-roll anything at all).

Release is prepared to a verifiable artifact; publication is a human action.

## Technical Context

**Language/Version**: TypeScript 5.9 targeting ES2022, compiled to CommonJS for Node.js

**Primary Dependencies**: `axios` (HTTP transport). No runtime dependencies are added by this feature.

**Storage**: N/A — the library holds no persistent state. Its only cross-invocation state is a read-only runtime catalogue cache.

**Testing**: Vitest, with recorded backend responses in `test/fixtures/` as the primary source of truth for result shapes.

**Target Platform**: Node.js library consumed server-side by the NTUT exam backend.

**Project Type**: Library (npm package).

**Performance Goals**: N/A — classification is pure computation over a single response. This feature explicitly does not target throughput; see Non-guarantees in the contract.

**Constraints**:
- The backend response shape (Piston's per-stage fields) is external and cannot be changed; it is the source of truth for attribution facts.
- The compile stage's timeout is genuinely ambiguous between submission and system fault. The library must not pretend to resolve it — it biases toward the system and leaves policy to the consumer.
- Publication credentials are the maintainer's; no automated publication.

**Scale/Scope**: ~570 lines of source across three modules, one test suite, one published package. Called once per test case per submission — on the order of tens of calls per student per exam.

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1 design.*

- [x] **Type Safety** — *Initial: FAIL. Post-design: PASS.*
  The existing code violates this principle: `export type Result = any | {...}` erases the entire public surface to `any` (research S2), and the compile stage is not modelled on the type `execute()` returns (S3). This is the root cause of the consuming system's pervasive `any` casts. The design replaces `Result` with a discriminated union carrying a literal discriminant and folds the compile stage into `ExecutionResult`. No exported type retains `any`. Enforced by V5.

- [x] **Async & Concurrency** — *PASS.*
  The library is invoked concurrently by the consuming system. The design introduces no cross-invocation mutable state; the sole shared state is the runtime catalogue cache, which is read-only data (NFR-CONC). **Scope note**: this feature does not make the *system* concurrency-safe. It stops misattributing saturation; it does not prevent saturation. Constitution II is satisfied for this component, and the system-level obligation is tracked separately as a prerequisite for the incident to be closed in production.

- [x] **Security & Stability** — *Initial: FAIL. Post-design: PASS.*
  Two live defects. (1) Two `console.log` statements emit the student's full source code and full execution output to stdout on every call (research S1) — a data-leak path that would ship on publication. (2) Attribution reads submission-authored `stderr`, so a submission that prints `Killed` selects its own verdict (S4) — an anti-cheat hole under Root Principle 1, present in two functions. The design removes all process-level output and draws the trust boundary by field authorship (D3). Enforced by V1 and V3.

- [x] **Low Coupling** — *PASS.*
  The design sharpens the existing separation: the execution layer reports facts and makes no judgement; the judging layer classifies and holds no transport concern. The current `ExtendedExecutionResult` — a judging-layer type patching a transport-layer type — is a coupling smell, and folding it in removes it. Retry policy is deliberately *not* absorbed into the library, because it requires machine-state knowledge the library does not have.

- [x] **Testability** — *Initial: FAIL. Post-design: PASS.*
  `tsconfig.json` excludes test sources from type checking (research S7), so fixtures modelling the very contract this feature changes can drift silently — the exact failure recorded in `knowledge/experience.md` #4. The design brings `test/**/*` under type checking and runs it as part of the test command. Every misattribution scenario in the spec maps to a validation in `quickstart.md`.

**Gate result: PASS.** Three principles were failing in the pre-existing code; all three are addressed by this design rather than waived. No entries in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/003-judge-fault-attribution/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 — source survey + 10 design decisions
├── data-model.md        # Phase 1 — entities, trust boundary, attribution order
├── quickstart.md        # Phase 1 — 7 validations + release verification
├── contracts/
│   └── public-api.md    # Phase 1 — public surface, 11 guarantees, migration
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 — NOT created by /speckit-plan
```

### Source Code (target repository)

```text
~/Documents/my-code/ntut-exam/node-piston/
├── src/
│   ├── client.ts        # Transport + execution. Reports facts only.
│   │                    #   - remove both console.log statements (S1)
│   │                    #   - replace `Result` with `ExecutionOutcome` (S2/D6)
│   │                    #   - model the compile stage on `ExecutionResult` (S3/D7)
│   │                    #   - return `EffectiveLimits`; export `DEFAULT_LIMITS` (D5)
│   │                    #   - runtime catalogue TTL (D4)
│   ├── judger.ts        # Classification. Holds no transport concern.
│   │                    #   - `FaultAttribution` + `CTLE` (D1)
│   │                    #   - reorder: system conditions before submission verdicts (D2)
│   │                    #   - drop stderr-based predicates in both functions (S4/D3)
│   │                    #   - accept the failure arm without throwing (S5/D6)
│   │                    #   - guard comparison preconditions (FR-011)
│   │                    #   - remove dead `timeLimit`/`cpuTimeLimit` options (S8)
│   ├── index.ts         # Entry point.
│   │                    #   - remove module-level `test2()` invocation (S/D9)
│   │                    #   - remove unused axios `VERSION` import
│   │                    #   - re-export the new public surface
│   └── test.ts          # Pre-existing scratch module — assess for removal (D9)
├── scripts/             # NEW — relocated manual smoke scenarios, unpublished
├── test/
│   ├── fixtures/        # Recorded backend responses — extend for new scenarios
│   └── judger.test.ts   # Extend to cover every scenario in quickstart.md
├── tsconfig.json        # Keep prettier-era formatting changes; stop excluding tests (D8)
└── package.json         # Version → 0.2.0; wire type-check into the test command
```

**Structure Decision**: The existing three-module layout (transport / classification / entry) already matches the separation this feature depends on, so it is retained rather than restructured. The only addition is an unpublished `scripts/` directory, which exists solely so the manual smoke scenarios currently living inside the entry point have somewhere to go that is not the published surface.

**Working-tree constraint**: the target repository has uncommitted changes. The prettier-era reformatting is intentional and must be preserved; only the debug residue identified in research S1 and D9 is to be removed. Do not discard the working tree.

## Phase Outputs

| Phase | Artifact | Status |
|-------|----------|--------|
| 0 | `research.md` — 8 source findings, 10 design decisions, 0 unresolved unknowns | ✅ |
| 1 | `data-model.md` — 8 entities, field trust boundary, normative attribution order | ✅ |
| 1 | `contracts/public-api.md` — export delta, 11 guarantees, migration table, non-guarantees | ✅ |
| 1 | `quickstart.md` — 7 validations mapped to success criteria, release verification | ✅ |
| 2 | `tasks.md` | Not created by this command — run `/speckit-tasks` |

## Risks

| Risk | Mitigation |
|------|-----------|
| Attributing a genuinely pathological submission's compile timeout to the system lets it retry indefinitely. | Accepted deliberately (D2): the cost is a wasted retry versus a student losing marks. Retry bounding is the consumer's policy, and is called out as a non-guarantee. |
| A consumer switching exhaustively on `StatusCode` will not handle the new `CTLE`. | Documented in the migration table; the contract directs consumers to branch on `attribution` before `status`, which is forward-compatible with further verdicts. |
| The consuming system remains broken until it migrates — this feature alone does not close the incident in production. | Stated as a dependency in the spec and as a non-guarantee in the contract. The consumer migration is a separate feature. |
| Fixtures drift from the changed contract. | Type-checking `test/**/*` is part of this feature, not a follow-up (D8) — it is the guard that makes the fixtures trustworthy. |
| Publishing before validation ships a data-leak path. | V1 is an automated test asserting import purity against `dist/`; release verification greps the built artifact; publication is gated on a human. |
