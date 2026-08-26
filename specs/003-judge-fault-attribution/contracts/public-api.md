# Contract: `piston-judger` Public API (v0.2.0)

**Feature**: 003-judge-fault-attribution
**Contract type**: library public surface (npm package)
**Breaking**: yes — see Migration.

This document defines the contract the package guarantees to consumers. It states shapes and guarantees, not implementation.

## Exports

| Export | Kind | Change in v0.2.0 |
|--------|------|------------------|
| `pistonJudger(options)` | factory → client + `judge` | unchanged entry shape |
| `piston(options)` | factory → client only | unchanged entry shape |
| `StatusCode` | enum of `Verdict` | **`CTLE` added** |
| `FaultAttribution` | enum | **new** |
| `CompareMode` | enum | unchanged |
| `DEFAULT_LIMITS` | constant | **new** (FR-008) |
| `ExecutionOutcome` | type | **new — replaces `Result`** |
| `ExecutionResult` | type | **now models the compile stage** |
| `StageOutcome` | type | **new** |
| `EffectiveLimits` | type | **new** |
| `JudgedResult` | type | **`attribution` added** |
| `Result` | type | **removed** (it erased to `any`) |
| `ExtendedExecutionResult` | type | **removed** (folded into `ExecutionResult`) |

## Guarantees

### G1 — Import purity
Importing the package performs no I/O, starts no timers, and writes nothing to any process output stream. Importing in an environment with no backend reachable succeeds. *(FR-006)*

### G2 — Output silence
The package never writes submission content, execution output, or request payloads to any process output stream, at any log level, in any code path. *(FR-007, NFR-SEC)*

### G3 — Total judging
`judge(outcome, options)` accepts **every** value `execute()` can return, including the failure arm, and returns a `JudgedResult` for all of them. It does not throw for any backend or transport condition. *(FR-010)*

> This guarantee is what allows a consumer to delete its own pre-classification checks. A consumer that still needs a pre-check indicates a violation.

### G4 — Attribution is total and single-step
Every `JudgedResult` carries an `attribution`. Determining the responsible party requires reading exactly one field — no inspection of raw payloads, no consumer-side classification. *(FR-001, SC-002)*

### G5 — Attribution never reads submission-authored data
`stdout`, `stderr`, and `output` are never inputs to any attribution decision. A submission cannot change its own attribution by what it prints. *(FR-003, NFR-SEC, SC-004)*

### G6 — System failures are never charged to the submission
A stage terminated by the backend on a time allowance or by an internal error is attributed to the system, regardless of the exit status reported for that stage. Where attribution is genuinely ambiguous — a compile stage that ran out of time — the result is attributed to the **system**. *(FR-002, SC-001)*

### G7 — Facts survive to the consumer
The per-stage backend facts (`code`, `signal`, `status`, `message`, resource usage) reach the consumer unmodified. No failure is reduced to a single verdict before the consumer can see the facts behind it. *(FR-004, FR-005)*

### G8 — Effective limits are reported
Every execution result reports the allowances actually applied. Defaults are additionally readable as `DEFAULT_LIMITS` without performing an execution. *(FR-008)*

### G9 — Comparison preconditions
Output comparison is attempted only when the run stage completed normally **and** an expected output was supplied. The empty output of a terminated stage is never compared and never reported as a mismatch. *(FR-011)*

### G10 — Catalogue freshness
The runtime catalogue is refreshed after a bounded time-to-live. A failed refresh is surfaced to the caller, never silently replaced by the stale copy. *(FR-009)*

### G11 — Type safety at the boundary
No exported type contains `any`. `ExecutionOutcome` is narrowable by its literal discriminant. A consumer can read any attribution or stage fact without escape-hatch typing. *(NFR-TYPE, SC-006)*

## Behavioural contract — attribution table

| Condition | `status` | `attribution` |
|-----------|----------|---------------|
| Transport / backend unreachable | `SE` | `system` |
| Compile stage internal error | `SE` | `system` |
| **Compile stage timed out** | **`CTLE`** | **`system`** |
| Compile stage compiler diagnostic | `CE` | `submission` |
| Run stage internal error | `SE` | `system` |
| Run stage timed out | `TLE` | `submission` |
| Run stage output allowance exceeded | `OLE` | `submission` |
| Run stage memory allowance exceeded | `MLE` | `submission` |
| Run stage runtime failure | `RE` | `submission` |
| Output mismatch | `WA` | `submission` |
| Output match / no expected output | `AC` | `submission` |

Evaluation order is normative and specified in `data-model.md`. No submission verdict may be produced before all system-attributable conditions are ruled out.

## Migration from v0.1.1

| v0.1.1 | v0.2.0 | Consumer action |
|--------|--------|-----------------|
| `execute()` returns `Result` (`any`) | returns `ExecutionOutcome` (discriminated union) | Narrow on the discriminant; remove `any` casts |
| Manual pre-check for `success === false` before judging | `judge()` accepts the failure arm | **Delete the pre-check** |
| Compile timeout ⇒ `CE` | ⇒ `CTLE` with `attribution: system` | Do not score as a submission failure; retry per local policy |
| Submission printing `Killed` ⇒ `MLE` | no effect on attribution | none — defect removal |
| `ExtendedExecutionResult` | folded into `ExecutionResult` | Update type references |
| Compile-stage allowance silently defaulted | reported in `limits`; `DEFAULT_LIMITS` exported | Set explicitly from local configuration |

**Consumer-visible risk**: a consumer that switches exhaustively on `StatusCode` will not handle `CTLE`. Consumers are expected to branch on `attribution` first, then on `status`.

## Non-guarantees

Stated so the consuming system does not mistake this feature for a stability fix:

- **No protection against backend saturation.** This package reports attribution correctly; it does not limit concurrency and cannot prevent overload.
- **No reduction in compilation load.** One execution still means one compilation.
- **No retry.** Retrying a `system`-attributed result is the consumer's policy decision, made with machine-state information this library does not have.
