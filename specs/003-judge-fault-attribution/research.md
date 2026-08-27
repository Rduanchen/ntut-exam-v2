# Phase 0 Research: Judge Fault Attribution

**Feature**: 003-judge-fault-attribution
**Date**: 2026-08-26
**Target repo**: `~/Documents/my-code/ntut-exam/node-piston`

## Source Survey — findings beyond the specification input

The specification was written from a partial reading. A full read of the target repository's working tree surfaced additional defects that fall inside the specification's requirements but were not named in the input. They are recorded here so the task breakdown does not miss them.

| # | Finding | Evidence | Requirement it falls under |
|---|---------|----------|---------------------------|
| S1 | **A second, more severe log statement**: `execute()` logs the entire request body — which contains the student's full source code — on every call. The input only identified the response log. | `src/client.ts`, in `execute()`: `console.log("Request body:", JSON.stringify(requestBody));` | FR-007, NFR-SEC |
| S2 | **The public result type erases to `any`.** `export type Result = any \| { error: any; success: boolean } \| undefined` — a union containing `any` *is* `any`. Every consumer of `execute()` is therefore untyped, which is the direct cause of the consuming system's pervasive `any` casts. | `src/client.ts`: `export type Result = any \| ...` | FR-004, NFR-TYPE, SC-006 |
| S3 | **`ExecutionResult` does not model the compile stage at all.** The compile stage exists only on `ExtendedExecutionResult` in `judger.ts`. `execute()` never returns that type, so the compile stage reaches consumers only through the `any` hole in S2. | `src/client.ts` `ExecutionResult` has `run` but no `compile`; `src/judger.ts` `ExtendedExecutionResult extends ExecutionResult` adds `compile?` | FR-004, FR-005, NFR-TYPE |
| S4 | **The submission-controlled-input defect appears twice, not once.** The input identified `isMemoryExceeded`. `isRuntimeError` reads the same field for the same purpose. | `src/judger.ts`: `isRuntimeError` → `runInfo.stderr?.includes("Killed")`; `isMemoryExceeded` → `runInfo.stderr?.includes("Killed")` | FR-003 |
| S5 | **Transport failures cannot be judged at all.** When the backend is unreachable, `execute()` returns `{ success: false, error }`, which has no `run` property. Passing it to `judgeStatus` dereferences `result.run.code` and throws. The consuming system works around this with its own pre-check — the "bypassed abstraction" signal recorded in the knowledge base. | `src/client.ts` `post()` catch branch; `src/judger.ts` `judgeStatus` unconditionally reads `result.run` | FR-010, SC-002 |
| S6 | **Timeout and output-limit detection only ever inspect the run stage.** `isTimeout` and `isOutputLimitExceeded` read `result.run` only, so a compile stage terminated on time falls through to the compile-error branch — which is the incident. | `src/judger.ts`: `isTimeout`, `isOutputLimitExceeded` | FR-002 |
| S7 | **Test sources are excluded from type checking.** `tsconfig.json` sets `include: ["src/**/*"]` and `exclude: [..., "**/*.test.ts"]`, so `test/` is never type-checked. Fixtures can drift from the types they claim to model without any build failure. | `tsconfig.json` | NFR-TEST, NFR-TYPE |
| S8 | **`judgeStatus` accepts `timeLimit` and `cpuTimeLimit` options and never uses them.** Dead parameters imply a guarantee the library does not provide. | `src/judger.ts` `judgeStatus` destructures both, references neither | FR-008 (visibility of limits) |

**S7 is a repeat of a lesson already recorded in this project's knowledge base** (`knowledge/experience.md` #4: test code excluded from type checking rots silently). The same failure mode is present in the target repository.

---

## D1 — How to express fault attribution in the result contract

**Decision**: Add an explicit `attribution` field to the judged result (`"submission" | "system"`), **and** add a distinct verdict `CTLE` for a compile stage terminated on its time allowance. Route all other system failures to the existing `SE` verdict.

**Rationale**:
- The `attribution` field satisfies SC-002's "single step" requirement. Attribution is *orthogonal* to the verdict — a growing enum of status codes would force every consumer to re-enumerate the full set each time one is added, and a consumer that forgets a new code silently misattributes. A dedicated field cannot be forgotten.
- `CTLE` is still needed because the *fact* ("the compile stage ran out of time") is diagnostically distinct from "the backend was unreachable", and operators need to tell them apart when tuning a machine.
- Existing consumer code of the form `if (status !== "AC") fail()` continues to behave correctly for system failures: they are not `AC`, so nothing is silently scored as passing.

**Alternatives considered**:
- *New status codes only, no attribution field*: rejected — pushes the classification burden back onto every consumer, which is the defect being fixed.
- *Attribution field only, reusing `SE` for compile timeouts*: rejected — discards the diagnostic distinction operators need.
- *A `retryable` boolean instead of `attribution`*: rejected — conflates a policy decision (should we retry?) with a fact (whose failure was it?). Retry policy depends on machine state the library cannot see. The library reports the fact; the consumer sets policy.

## D2 — Deciding whether a stage was terminated by the system

**Decision**: Attribute by **stage** and by **status**, never by exit code alone:

| Stage | Signal from backend | Verdict | Attribution |
|-------|--------------------|---------|-------------|
| compile | `status = "TO"` (timed out) | `CTLE` | **system** |
| compile | `status = "XX"` (internal error) | `SE` | **system** |
| compile | non-zero exit, no system termination | `CE` | submission |
| run | `status = "TO"` | `TLE` | submission |
| run | `status = "XX"` | `SE` | **system** |
| run | `status = "OL"` | `OLE` | submission |
| run | memory allowance exceeded | `MLE` | submission |
| run | non-zero exit or death by signal | `RE` | submission |
| — | transport/backend failure (no result at all) | `SE` | **system** |

**Rationale for the asymmetry between compile-stage and run-stage timeouts** — this is the crux of the feature:

A **run**-stage timeout is the submission's fault by definition: the time allowance *is* the problem being set. A **compile**-stage timeout is genuinely ambiguous — it can be a pathological submission (heavy template instantiation) or a saturated machine. **The library cannot distinguish these from a single result**, and it must not pretend to.

Therefore `CTLE` is attributed to the **system by default**, which follows the governing principle verbatim: *"歸屬不明時，偏向判為系統錯誤並重試"* (`knowledge/principles.md`). The consumer holds the information the library lacks — machine load, retry count, whether the same submission times out on an idle machine — and applies policy accordingly. Being wrong in this direction costs a wasted retry; being wrong in the other direction costs a student their marks.

**Explicitly not adopted**: "a termination signal means the system killed it." A submission dying on `SIGSEGV` also reports a signal with a null exit code, and that is unambiguously the submission's fault. Signal presence alone is not evidence of system fault.

## D3 — Which fields may be trusted for attribution

**Decision**: Draw the trust boundary by **authorship of the field**, not by its content.

| Field | Written by | Usable for attribution |
|-------|-----------|----------------------|
| `status`, `signal`, `code`, `memory`, `cpu_time`, `wall_time` | the execution backend | **Yes** |
| `message` | the execution backend | **Yes** |
| `stdout`, `stderr`, `output` | **the submission** | **No — never** |

**Rationale**: This is the generalisable rule behind FR-003, and it is checkable by inspection: any attribution predicate that names `stdout`, `stderr`, or `output` is wrong by construction. String-matching *content* (`includes("Killed")`) is not merely unreliable, it is forgeable — and in an exam system a forgeable verdict is an anti-cheat hole, not just a bug.

Note the distinction that makes this rule non-obvious: `message` also contains the string `"Killed"` in exactly the same scenarios, but it is generated by the backend from the signal, so it is trustworthy. The old code read *both*, and only one of them was safe.

**Consequence for memory-limit detection**: `MLE` is determined from `signal`, `status` and the reported `memory` against the caller's allowance — never from output streams.

## D4 — Runtime catalogue freshness

**Decision**: Cache with a time-to-live, default 5 minutes, caller-overridable. On expiry, refetch. If a refetch fails, surface the failure to the caller rather than silently serving the stale copy.

**Rationale**: Language installation is infrequent, so minutes-scale staleness is operationally harmless while still removing the "installed but invisible until restart" failure. Surfacing refetch failures matters because the alternative — silently serving a stale catalogue — produces a confusing downstream error (an unknown-language rejection) far from its cause.

**Alternatives considered**: *Serve stale on failure, flagged as stale*: rejected for v0.2.0 as added contract surface for a case the consuming system does not act on differently; it can be added later without breaking the contract. *No cache at all*: rejected — adds a network round trip to every single execution, and this library is called once per test case.

## D5 — Making correctness-affecting limits visible

**Decision**: Keep the existing defaults (do **not** make the compile-stage allowance a required parameter), but (a) export the default values as named public constants, and (b) return the **effective limits actually applied** on the execution result.

**Rationale**: Making the parameter required would break every call site to fix a problem that visibility alone solves. Returning the effective values satisfies FR-008 exactly — the caller can no longer be unaware of a limit that changed its verdict — and it makes the incident diagnosable after the fact, because a stored result records the allowance it was judged under.

**Alternatives considered**: *Required parameter*: rejected as gratuitously breaking. *Raise the default from 10 s*: rejected as out of scope here — the consuming system will set this explicitly from its own configuration (a later feature), and changing a default silently is the very pattern this feature exists to eliminate.

## D6 — Transport and backend failures

**Decision**: Replace the `any`-erasing return type with a discriminated union carrying a literal discriminant, and make the judging entry point accept the failure arm and return a system-attributed `SE` verdict rather than throwing.

**Rationale**: This is what removes the consuming system's pre-check — the bypassed-abstraction smell. Once `judge()` accepts everything `execute()` can return, the caller has exactly one path. A literal discriminant is what lets the compiler narrow the union, which is what makes NFR-TYPE achievable rather than aspirational.

## D7 — Restoring type safety at the consumer boundary

**Decision**: Model the compile stage on the primary execution result type (optional, since interpreted languages have no compile stage), delete the `any` arm from the public result type, and fold `ExtendedExecutionResult` into the primary type.

**Rationale**: S2 and S3 together are why the consuming system casts everything to `any`. Fixing them is the whole of SC-006. Keeping the compile stage on a separate type that `execute()` never returns guarantees the erasure persists no matter what else is fixed.

## D8 — Type-checking the tests

**Decision**: Bring `test/**/*` under type checking and run the type check as part of the test command.

**Rationale**: Directly transplants `knowledge/experience.md` #4 — *"沒有 oracle 的東西會腐化"*. The fixtures in `test/fixtures/` are recorded backend responses that model the contract this feature is changing; if they are not type-checked, they will drift from the contract and the suite will keep passing for the wrong reason. Since this feature changes the result types, the fixtures **must** be checked against them.

## D9 — Import-time side effects

**Decision**: Remove the module-level invocation from the package entry point. Preserve the manual smoke-test scenarios by relocating them to a script outside the published surface.

**Rationale**: FR-006. Note that `.npmignore` excludes `src` and `test` but the entry point is compiled into `dist/`, so the side effect would ship regardless — the residue must be removed at source, not merely excluded from the package.

## D10 — Versioning and migration

**Decision**: `0.2.0`, with the breaking changes documented for the consuming system's migration: the judged-result shape gains `attribution`; the public result type is now a discriminated union rather than `any`; a new `CTLE` verdict exists.

**Rationale**: The contract changes in ways that will not type-check against v0.1.1 usage — a minor bump is correct for a `0.x` package, where the minor position carries breaking changes by convention. The consuming system's migration is a separate feature and is listed as a dependency in the specification.

## Open items carried to `/speckit-tasks`

None. All specification requirements have a determined approach. Two items are deliberately deferred and recorded as out of scope in the specification: preventing backend saturation, and eliminating redundant recompilation — both belong to the consuming system.
