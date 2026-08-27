# Phase 1 Data Model: Judge Backend Migration

**Feature**: 004-judge-backend-migration

## SubmissionStatus

The lifecycle of one submission, as a **closed typed set** replacing today's unconstrained string (research S2).

| Value | Meaning | Scored? | Counted as a wrong answer? |
|-------|---------|---------|---------------------------|
| `Pending` | Submitted, not yet judged | no | no |
| `Judging` | Currently being judged | no | no |
| `Graded` | Judged; the verdict is the student's | yes | if the verdict says so |
| `SystemError` | Could not be judged for reasons that were not the student's | **no** | **no** |

**Rules**:
- `SystemError` replaces the former `"Error"`, which already meant this but was named as though the student owned it (research D3). The set does not grow.
- A submission in `SystemError` MUST carry no score and MUST be excluded from wrong-answer counts (FR-002, FR-005).
- Only `Judging` is transient. Any submission found in `Judging` at startup was interrupted and MUST return to `Pending` (FR-012).
- The set MUST be expressed as a type, so a fifth value cannot appear by typo.

**Transitions**:
```
Pending ──judging starts──> Judging ──verdict is the student's──> Graded
                              │
                              ├──system failure survives retries──> SystemError
                              │
                              └──interrupted, seen at startup──> Pending
```

## JudgingSettings

Operator-controlled parameters. Live inside the exam configuration, so a configuration upload replaces them wholesale (research D6).

| Field | Meaning | Notes |
|-------|---------|-------|
| `compileTimeout` | Compile-stage wall-clock allowance | The value whose silent default triggered the incident |
| `compileMemoryLimit` | Compile-stage memory allowance | |
| `maxConcurrentJobs` | Ceiling on executions in flight, system-wide | A property of **this machine**, not of the exam paper |
| `maxSystemRetries` | Retries for a system-attributed verdict | Default 2 (three attempts) |

Existing fields (`timeLimit`, `memoryLimit`, `compareMode`) are unchanged.

**Rules**:
- Every field is optional with a documented default, so an absent field yields the default rather than the previous value (FR-015).
- `maxConcurrentJobs` MUST be clamped into a valid range; an invalid value MUST NEVER resolve to unlimited (FR-019, research D7).
- Values that no code reads MUST NOT exist (FR-021).

## EffectiveSetting

One resolved value together with where it came from (FR-016).

| Field | Notes |
|-------|-------|
| `value` | The value in force |
| `origin` | `config` \| `env` \| `default` \| `clamped` |

**Rules**:
- Resolution order: stored configuration → environment → default. Environment is a **first-run seed only** and MUST NOT override stored configuration (research D6).
- `clamped` MUST be reported when a configured value was outside the valid range, so an operator learns their setting was not honoured.

**Why provenance exists**: without it, "10 seconds because nobody chose" and "10 seconds because someone measured" are indistinguishable — which is how the original silent allowance stayed invisible until it cost students marks.

## JudgingJob

One background judging run for one student. **Not durable** — the submissions are the durable record (research D4).

| Field | Notes |
|-------|-------|
| `id` | The handle returned when judging is accepted |
| `testId` | The student being judged |
| `state` | `waiting` \| `running` \| `finished` \| `failed` |
| `startedAt` / `finishedAt` | |
| `outcome` | A `JudgingOutcome`, once finished |

**Rules**:
- At most one job per student may be non-terminal at a time. A request for a student already being judged MUST return the existing handle rather than starting a second run (FR-013, research D5).
- `failed` means the run itself broke, distinct from a run that finished having recorded system failures. A job MUST NOT remain non-terminal after its run ends (FR-010).

## JudgingOutcome

The summary of a finished run.

| Field | Notes |
|-------|-------|
| `graded` | Submissions judged with a verdict owned by the student |
| `systemFailures` | Submissions that ended in `SystemError` |
| `retriesUsed` | Total retries consumed |

**Rules**:
- `systemFailures` MUST be reported separately from student failures, and MUST be `0` rather than absent when there were none (FR-020, SC-005).
- These counts are what turn attribution from a stored field into something an operator can act on.

## ExecutionSlot (conceptual)

Not persisted — the unit the concurrency ceiling governs.

**Rules**:
- One slot is held for the duration of **one execution against the backend**, not one submission and not one request (FR-006, FR-007).
- The total held at any moment MUST NOT exceed `maxConcurrentJobs`, counted across the whole process regardless of how many requests are in flight.
- **Retries MUST acquire a slot like any other execution.** A retry that bypasses the ceiling adds load exactly when the machine is already failing.
- The ceiling MUST be changeable while slots are held and work is queued, without restarting (FR-008).

## ExecutionBackendHealth

| Field | Notes |
|-------|-------|
| `reachable` | Whether the backend answered |
| `runtimes` | The languages actually installed |
| `checkedAt` | When this was observed |

**Rules**:
- Reported on demand, not only at startup (research S6).
- An unreachable backend is a normal report, not an error — the operator asked a question and gets an answer (FR-018).
