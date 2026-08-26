# Phase 1 Data Model: Judge Fault Attribution

**Feature**: 003-judge-fault-attribution

All entities below are in-memory value objects. This library has no persistence.

## FaultAttribution

The central entity of this feature — the classification the current contract cannot express.

| Value | Meaning |
|-------|---------|
| `submission` | The failure is a property of the submitted code. It is reproducible and re-running will not change it. |
| `system` | The failure is a property of the environment. Re-running may produce a different outcome. |

**Rules**:
- Every judged result carries exactly one attribution, including successful ones (a pass is attributed to the submission).
- When attribution cannot be determined from the available facts, it MUST be `system` (governing principle: bias toward the student).
- Attribution MUST be derivable without reading any submission-authored field (see `StageOutcome` field trust below).

## StageOutcome

The factual record of one execution stage (`compile` or `run`), as reported by the execution backend. Carries no judgement.

| Field | Type | Authored by | Trusted for attribution |
|-------|------|-------------|------------------------|
| `code` | integer or null | backend | ✅ |
| `signal` | string or null | backend | ✅ |
| `status` | string or null | backend | ✅ |
| `message` | string or null | backend | ✅ |
| `memory` | integer | backend | ✅ |
| `cpu_time` | integer | backend | ✅ |
| `wall_time` | integer | backend | ✅ |
| `stdout` | string | **submission** | ❌ never |
| `stderr` | string | **submission** | ❌ never |
| `output` | string | **submission** | ❌ never |

**Rules**:
- `code` is null whenever the stage was terminated by a signal; therefore `code !== 0` alone is never sufficient evidence of a submission fault.
- The trust column is a **checkable invariant**: any attribution predicate naming `stdout`, `stderr`, or `output` violates FR-003 by construction.

**Backend status values** (`status`):

| Value | Meaning |
|-------|---------|
| `TO` | Terminated on a time allowance |
| `OL` | Terminated on an output allowance |
| `RE` | Exited with a non-zero status |
| `XX` | Backend internal error |
| null | Completed normally |

## ExecutionResult

The complete factual record of one submission run.

| Field | Type | Notes |
|-------|------|-------|
| `language` | string | |
| `version` | string | |
| `compile` | `StageOutcome` or absent | **Absent for interpreted languages.** Absence is not a pass and not a failure. |
| `run` | `StageOutcome` | Always present on a successful execution. |
| `limits` | `EffectiveLimits` | The allowances actually applied (FR-008). |

**Rules**:
- The compile stage MUST be modelled on this type, not on a separate subtype (research S3/D7) — otherwise it remains unreachable to typed consumers.
- This type carries no verdict and no attribution.

## ExecutionOutcome

A discriminated union covering everything an execution attempt can produce. Replaces the current `any`-erasing result type (research S2/D6).

| Arm | Discriminant | Payload |
|-----|--------------|---------|
| success | `ok: true` | an `ExecutionResult` |
| failure | `ok: false` | an error describing a transport or backend failure |

**Rules**:
- The discriminant MUST be a literal type so that the compiler narrows the union (NFR-TYPE).
- The union MUST NOT contain `any` in any arm — a union containing `any` erases to `any`.
- The judging entry point MUST accept **both** arms. The failure arm judges to a `system`-attributed system-error verdict; it MUST NOT throw (FR-010, and it is what removes the consumer's pre-check).

## EffectiveLimits

The allowances actually applied to an execution, echoed back to the caller.

| Field | Notes |
|-------|-------|
| `compile_timeout` | The field whose silent default triggered the incident |
| `run_timeout` | |
| `compile_cpu_time` | |
| `run_cpu_time` | |
| `compile_memory_limit` | |
| `run_memory_limit` | |

**Rules**:
- Populated with the resolved values, whether supplied by the caller or defaulted.
- The defaults MUST also be exported as named public constants so a caller can read them without performing an execution (FR-008).

## Verdict

The outcome classification. Existing values are retained; one is added.

| Value | Meaning | Attribution |
|-------|---------|-------------|
| `AC` | Accepted | submission |
| `WA` | Wrong answer | submission |
| `TLE` | Run stage exceeded its time allowance | submission |
| `MLE` | Run stage exceeded its memory allowance | submission |
| `OLE` | Run stage exceeded its output allowance | submission |
| `RE` | Run stage failed at runtime | submission |
| `CE` | Compile stage reported a compiler diagnostic | submission |
| **`CTLE`** | **Compile stage terminated on its time allowance** | **system** |
| `SE` | Backend internal error, or transport failure | system |

**Rules**:
- `CTLE` is new in this feature. It exists so that "the compiler ran out of time" stays distinguishable from "the backend was unreachable", which matters when tuning a machine.
- The attribution column is fixed per verdict, so attribution and verdict can never contradict each other.

## JudgedResult

The verdict delivered to the consumer.

| Field | Notes |
|-------|-------|
| `status` | a `Verdict` |
| `attribution` | a `FaultAttribution` — readable in a single step (SC-002) |
| `message` | human-readable explanation |
| `actualOutput` | present only when a stage completed normally |
| `expectedOutput` | present only when the caller supplied one |
| `details` | the per-stage `StageOutcome` values, unmodified (FR-004) |

**Rules**:
- `details` MUST carry the raw stage facts through unmodified, so a consumer can audit or extend the classification without re-fetching the payload (FR-004, FR-005).
- Output comparison MUST NOT be performed unless the run stage completed normally and an expected output was supplied (FR-011). In particular, the empty output of a terminated stage MUST NOT be compared and reported as a mismatch.

## RuntimeCatalogue

The set of languages the backend can run, with an observation time.

| Field | Notes |
|-------|-------|
| `runtimes` | language / version / aliases |
| `fetchedAt` | when this copy was observed |

**Rules**:
- Considered fresh for a bounded time-to-live (default 5 minutes, caller-overridable).
- A failed refresh MUST be surfaced, not silently substituted with the stale copy (FR-009).
- This is the only cross-invocation state in the library, and it is read-only data (NFR-CONC).

## Attribution decision order

Attribution is resolved before any submission verdict is considered. The order is itself a requirement, because the incident was caused by the compile-error branch being evaluated before any timeout check.

1. Execution failure arm (transport / backend unreachable) → `SE`, system
2. Compile stage backend-internal-error → `SE`, system
3. Compile stage terminated on time → `CTLE`, **system**
4. Compile stage compiler diagnostic → `CE`, submission
5. Run stage backend-internal-error → `SE`, system
6. Run stage terminated on time → `TLE`, submission
7. Run stage terminated on output allowance → `OLE`, submission
8. Run stage exceeded memory allowance → `MLE`, submission
9. Run stage failed at runtime → `RE`, submission
10. Output comparison → `AC` / `WA`, submission

**Rule**: no submission verdict may be produced before every system-attributable condition has been ruled out.
