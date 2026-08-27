# Quickstart: Validating Judge Backend Migration

**Feature**: 004-judge-backend-migration

How to prove this feature works. Contract details are in `contracts/admin-judging-api.md`; entity rules are in `data-model.md`.

## Prerequisites

- Backend dependencies installed, with `piston-judger@0.2.0`.
- **V1–V6 need no execution backend** — they drive judging through a scripted double.
- V7 and V8 need a reachable Piston instance. Note the local one has only the gcc family installed; that absence is itself what V8 makes visible.

## Setup

```
cd backend
npm install
npm test          # type-checks src and test, then runs the suite
```

---

## V1 — A student is not marked down for a busy machine *(G1, SC-001)*

Script the execution double to return a system-attributed verdict for a compile stage terminated on time. Judge a submission and confirm:

- the submission does **not** end in a graded state,
- its score is unchanged — not zero, **unchanged**,
- it is retried,
- after retries are exhausted it ends in the system-failure state,
- it is **not** counted among wrong answers.

Then script a genuine compiler diagnostic and confirm the opposite: graded, scored as the student's, and **not retried** (G2). Both directions must hold — a change that attributes everything to the system would pass the first half and be just as wrong.

## V2 — The ceiling holds under simultaneous arrivals *(G3, SC-002)*

The load shape that caused the incident, so test it as the incident occurred — **concurrently, not sequentially**.

Set a small ceiling. Fire several independent judging requests at once, each covering several submissions. Have the execution double record the number of calls in flight at every moment.

Expect the observed maximum to never exceed the ceiling.

> A sequential test passes with no limiter at all. If the test does not overlap requests, it proves nothing.

Then confirm the ceiling applies **across** requests, not per request: with ceiling *N* and *k* simultaneous requests, the maximum in flight is *N*, not *N × k*.

## V3 — Retries respect the ceiling *(G3)*

Script the double to fail systemically for the first attempts. Confirm that while retries are being consumed, in-flight executions still never exceed the ceiling.

> This is the case where a limiter is most tempting to bypass and most damaging to bypass: retries surge exactly when the machine is already failing.

## V4 — The ceiling changes without a restart *(FR-008)*

With work queued, lower and then raise the ceiling. Confirm the new value governs subsequent admissions and that no moment exceeds the higher of the two.

Then set the ceiling to zero, a negative number, and an absurdly large number. Confirm each is clamped, reported as clamped, and that **none results in unlimited concurrency** (G8).

## V5 — Judging returns immediately and completes in the background *(G4, G5, SC-003)*

Queue a large amount of work, then issue one more judging request. Confirm:

- it is acknowledged in under a second with a handle,
- the handle's state can be queried and moves through waiting → running → finished,
- the live-update channel is notified on completion,
- the outcome is retrievable **by querying** even if the notification is discarded — a lost notification must not look like lost work,
- a second request for a student already being judged returns the **existing** handle (FR-013).

## V6 — An interrupted run leaves nothing stuck *(G5, SC-007)*

Put submissions into the in-progress judging state, then run the startup path. Confirm they return to a re-judgeable state and none remains stuck (FR-012).

## V7 — One configuration file configures one machine *(G7, SC-004)*

Upload a configuration containing judging settings; confirm they take effect, including the concurrency ceiling.

Upload one **omitting** them; confirm the documented defaults apply and the previous values are **not** retained. This is the assertion that proves replacement rather than merge — a merge implementation passes the first upload and fails this one.

Change a setting through the management interface, then upload a configuration again; confirm the file wins.

Read the settings back and confirm each reports its origin, so a default is distinguishable from a deliberate choice (FR-016).

## V8 — Backend health is visible before an exam *(SC-008)*

Query health and confirm it reports reachability plus the languages actually installed. Stop the backend and query again; confirm unreachability is **reported**, not raised as an error.

## V9 — Grading trusts the verdict *(G6, SC-006)*

Confirm by inspection that grading contains no pre-check of raw execution responses before judging, and no escape-hatch typing to read a verdict, an attribution, or an execution fact. The type check covering both sources is the enforcement; this is the reading of it.

## V10 — System failures are visible *(G9, SC-005)*

Judge a mixed batch where some submissions fail systemically and others are simply wrong. Confirm the finished outcome states the system-failure count separately, and that a clean run reports zero rather than omitting the field.

---

## Deployment verification *(FR-022, FR-023)*

Bring the stack up from the committed configuration and confirm the execution backend runs with the isolation settings its documentation requires and with its own capacity ceiling. Confirm the documentation records both the recommended settings and the sweep method for measuring a given machine.

## Definition of done

| Check | Proves |
|-------|--------|
| V1 | SC-001 — no student loses marks to a busy machine |
| V2, V3, V4 | SC-002 — the ceiling actually holds |
| V5 | SC-003 — triggering never blocks |
| V6 | SC-007 — nothing gets stuck |
| V7 | SC-004 — one file, one machine |
| V8 | SC-008 — problems visible before the exam |
| V9 | SC-006 — the abstraction is trusted |
| V10 | SC-005 — attribution is actionable |

**Not proven by any of the above, by design**: that judging is faster. Every test case still recompiles the submission. See the non-guarantees in `contracts/admin-judging-api.md`.
