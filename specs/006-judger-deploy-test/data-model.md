# Data Model: Judger Deploy Test

## Overview

The durable boundary is one latest `DeploymentTestRun` JSON document stored under a protected singleton system-settings key. Runtime validation is mandatory on every read. In-memory coordination adds active promises and leases, but those are operational state and never serialized as if they could survive a restart.

## Enumerations

### RunState

- `queued`: admitted and persisted, background execution not yet started
- `running`: at least one phase has started
- `completed`: all selected phases reached accounting completion; success is determined separately
- `failed`: runner/orchestration failed and could not complete normal accounting
- `interrupted`: admissions stopped because of exam activation, deadline, restart, or explicit lifecycle safety

Terminal states: `completed`, `failed`, `interrupted`.

### OverallOutcome

- `passed`: full required suite selected; every required probe matched; every load job accounted; no system-attributed attempt; post-check healthy; no degradation warning
- `warning`: correctness and accounting passed, but the selected suite was partial or deterministic degradation threshold was crossed
- `failed`: a required runtime/probe failed or was blocked, a system-attributed attempt occurred, a job was missing/timed out, accounting disagreed, or the post-check failed
- `interrupted`: the lifecycle ended before selected work completed

`completed` is not synonymous with `passed`.

### Phase

- `readiness`
- `smoke`
- `verdict`
- `concurrency`
- `post-check`
- `finalizing`

### ProbeStatus

- `passed`
- `failed`
- `blocked`

### InterruptionReason

- `exam_started`
- `deadline_exceeded`
- `process_restart`
- `orchestration_failure`

## DeploymentTestProfile

Operator-reviewed and server-normalized input.

| Field | Type | Validation / Meaning |
|-------|------|----------------------|
| `phases` | array of `smoke`, `verdict`, `concurrency` | Unique; at least one; default all |
| `languages` | array of `c`, `cpp`, `python` | Unique; at least one; default all; a full pass requires all three |
| `concurrencyLevels` | integer array | Required only for concurrency; strictly ascending, unique, 1..64, at most 8 |
| `jobCount` | integer | Total load jobs across levels; 1..500; default 100 |
| `deadlineMs` | integer | Whole-run admission/report deadline; 60,000..1,800,000; default 900,000 |

Default concurrency levels derive from the current active ceiling: unique ascending `[1, ceiling, min(2 × ceiling, 64)]`.

`jobCount` is the total across all selected levels. Each level receives `floor(jobCount / levelCount)` jobs, with the remainder assigned one-by-one to ascending levels.

Unknown properties and impossible phase/parameter combinations are rejected before a run exists.

## ProfileDescriptor

Server authority returned to the page before execution.

| Field | Type | Meaning |
|-------|------|---------|
| `defaults` | `DeploymentTestProfile` | Defaults resolved against the active ceiling |
| `bounds` | object | Allowed phase/language sets and numeric min/max/count constraints |
| `activeCeiling` | integer | Current process-wide execution ceiling |
| `canStart` | boolean | Current admission snapshot; final admission remains atomic at POST |
| `blockedReason` | optional enum/string | `exam_in_progress`, `student_judging_active`, `deploy_test_active`, `deploy_test_draining`, or backend-unavailable explanation |

## EffectiveSettingsSnapshot

Immutable values captured at admission.

| Field | Type | Meaning |
|-------|------|---------|
| `compileTimeout` | value + origin | Applied compile allowance and provenance |
| `compileMemoryLimit` | value + origin | Applied compile-memory allowance and provenance |
| `maxConcurrentJobs` | value + origin | Configured ceiling and provenance |
| `maxSystemRetries` | value + origin | Retry count and provenance |
| `runTimeLimit` | integer | Server-owned probe run allowance |
| `runMemoryLimit` | integer | Server-owned probe memory allowance |

## RuntimeSnapshot

One observation from the live Piston catalogue.

| Field | Type | Validation / Meaning |
|-------|------|----------------------|
| `semanticLanguage` | `c`, `cpp`, `python` | Product language |
| `available` | boolean | Whether a compatible runtime was resolved |
| `language` | optional string | Exact primary Piston language sent to execution |
| `version` | optional string | Exact observed version sent to execution |
| `aliases` | string array | Observed aliases, bounded in count/length |
| `checkedAt` | epoch milliseconds | Catalogue observation time |

Resolution uses exact canonical name, then reported aliases. An unavailable runtime has no invented version.

## AttemptResult

Bounded summary of one real execution attempt.

| Field | Type | Meaning |
|-------|------|---------|
| `attempt` | positive integer | 1-based attempt number |
| `status` | verdict status | AC/WA/TLE/MLE/OLE/RE/CE/CTLE/SE |
| `attribution` | `submission` or `system` | Read before status |
| `stage` | `compile`, `run`, `none` | Failure/success stage |
| `enqueuedAt` | epoch milliseconds | Logical submission time |
| `slotAcquiredAt` | epoch milliseconds | Entry into the real execution slot |
| `finishedAt` | epoch milliseconds | Attempt resolution time |
| `queueMs` | non-negative number | slotAcquiredAt - enqueuedAt |
| `executionMs` | non-negative number | finishedAt - slotAcquiredAt |
| `totalMs` | non-negative number | finishedAt - enqueuedAt |
| `diagnostic` | string <= 5,000 characters | Truncated before storage/transport/log display |

Raw stdout/stderr and full backend payloads are not persisted.

## ProbeResult

Comparison of a fixed probe with observed execution.

| Field | Type | Meaning |
|-------|------|---------|
| `probeId` | stable string | Server-owned fixture identity |
| `phase` | `smoke` or `verdict` | Owning phase |
| `semanticLanguage` | `c`, `cpp`, `python` | Requested product language |
| `runtime` | optional language/version | Resolved observed runtime |
| `scenario` | `ac`, `ce`, `re`, `tle`, `mle`, `ole` | Controlled behavior |
| `expectedStatus` | verdict status | Required final verdict |
| `expectedAttribution` | attribution | Required fault owner |
| `observedStatus` | optional verdict status | Absent only when blocked/interrupted before observation |
| `observedAttribution` | optional attribution | Absent only when blocked/interrupted before observation |
| `status` | ProbeStatus | Comparison outcome |
| `attempts` | bounded AttemptResult array | Includes system failures and retries |
| `diagnostic` | string <= 5,000 characters | Human-readable bounded summary |

Rules:

- `passed` requires expected status and attribution and zero system-attributed attempts.
- A missing required runtime produces `blocked` and prevents overall pass.
- Late attempts after terminal freeze never mutate this entity.

## Distribution

| Field | Type | Meaning |
|-------|------|---------|
| `p50` | non-negative number | nearest-rank 50th percentile |
| `p95` | non-negative number | nearest-rank 95th percentile |
| `p99` | non-negative number | nearest-rank 99th percentile |
| `max` | non-negative number | maximum sample |

Nearest-rank index for percentile `p` and sorted sample count `n` is `ceil(p × n) - 1`, clamped to the valid index range. Empty distributions are absent rather than filled with zero.

## ConcurrencyLevelResult

Accounting and measurements for one level.

| Field | Type | Validation / Meaning |
|-------|------|----------------------|
| `submittedConcurrency` | integer | Requested logical worker count |
| `activeCeiling` | integer | Snapshotted global execution ceiling |
| `observedPeakExecutionConcurrency` | integer | Deploy-local peak inside real slots; MUST be <= activeCeiling |
| `requested` | integer | Jobs allocated to this level |
| `completed` | integer | Terminal execution responses |
| `expectedFailures` | integer | Controlled submission-attributed outcomes, if used |
| `infrastructureFailures` | integer | Any system-attributed attempt/final result |
| `timedOut` | integer | Deadline-classified jobs |
| `missing` | integer | Jobs with no valid accounting outcome |
| `interrupted` | integer | Never admitted after lifecycle interruption |
| `throughputPerSecond` | non-negative number | Accounted terminal jobs / level wall seconds |
| `endToEndLatencyMs` | Distribution | Queue + execution |
| `queueLatencyMs` | Distribution | Waiting for global slot |
| `executionLatencyMs` | Distribution | Real execution call duration |
| `warnings` | bounded string array | Deterministic degradation findings |
| `sampleErrors` | at most 10 bounded diagnostics | Representative failures only |

Accounting invariant:

`requested = completed + timedOut + missing + interrupted`

`infrastructureFailures` and `expectedFailures` classify members of `completed`; they are not added again to the accounting sum.

## DeploymentTestProgress

| Field | Type | Meaning |
|-------|------|---------|
| `phase` | Phase | Current/last phase |
| `completed` | non-negative integer | Accounted work units |
| `total` | non-negative integer | All selected work units |
| `updatedAt` | epoch milliseconds | Freshness indicator |

Invariant: `0 <= completed <= total`; progress never decreases.

## DeploymentTestRun

Latest durable aggregate.

| Field | Type | Meaning |
|-------|------|---------|
| `id` | UUID | Run identity |
| `state` | RunState | Lifecycle, independent of outcome |
| `overallOutcome` | optional OverallOutcome | Required in terminal state |
| `profile` | DeploymentTestProfile | Normalized immutable input |
| `settings` | EffectiveSettingsSnapshot | Immutable admission snapshot |
| `activeCeiling` | integer | Immutable execution ceiling snapshot |
| `runtimes` | RuntimeSnapshot array | Immutable readiness snapshot |
| `progress` | DeploymentTestProgress | Monotonic progress checkpoint |
| `probes` | ProbeResult array | Bounded probe evidence |
| `concurrencyResults` | ConcurrencyLevelResult array | Completed level summaries |
| `errors` | bounded array of strings <= 5,000 chars | Orchestration/system summaries |
| `startedAt` | epoch milliseconds | Admission time |
| `finishedAt` | optional epoch milliseconds | Required in terminal state |
| `interruptionReason` | optional InterruptionReason | Required when interrupted |

Durability rules:

- Persist `queued` before returning 202.
- Persist lifecycle/phase boundaries and progress no more than once per throttle interval.
- Persist one frozen terminal document atomically.
- A new admitted run replaces the singleton latest document; failed admission does not erase the previous report.
- On startup, queued/running becomes interrupted with preserved evidence.

## OperationalEnvelope

Returned beside the durable run but not part of the frozen report.

| Field | Type | Meaning |
|-------|------|---------|
| `run` | DeploymentTestRun or null | Latest durable evidence |
| `alreadyRunning` | optional boolean | Start request received existing run |
| `draining` | boolean | Late underlying promises still occupy/await real limiter slots |
| `stale` | optional boolean | Frontend-only label after a polling failure; never persisted as backend truth |

While `draining` is true, new deploy admission remains blocked even if the durable run is terminal.

## State Transitions

```text
admission accepted
       │
       ▼
    queued ───────► running ───────► completed
       │               │  └────────► failed
       │               └───────────► interrupted
       └───────────────────────────► interrupted
```

Invalid transitions:

- Any terminal state to any different lifecycle state.
- Any terminal report mutation from a late execution completion.
- `completed` without an overall outcome and exact accounting.
- `passed` with blocked/failed probes, a system-attributed attempt, missing/timed-out work, unhealthy post-check, or an incomplete required suite.
