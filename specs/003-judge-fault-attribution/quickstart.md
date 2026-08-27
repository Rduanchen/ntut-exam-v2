# Quickstart: Validating Judge Fault Attribution

**Feature**: 003-judge-fault-attribution
**Target repo**: `~/Documents/my-code/ntut-exam/node-piston`

How to prove this feature works. Contract details are in `contracts/public-api.md`; entity rules are in `data-model.md`.

## Prerequisites

- Node.js and the target repository's dependencies installed.
- **Offline validations (V1–V5) require no execution backend** — that is the point of most of them.
- V6 requires a reachable Piston instance. One is available at `http://localhost:2000` on the maintainer's machine (gcc runtimes only — no Python/Java/JavaScript installed at the time of writing).

## Setup

```
cd ~/Documents/my-code/ntut-exam/node-piston
npm install
npm run build
```

---

## V1 — Import purity *(G1, FR-006, SC-003)*

The single most important pre-publication check: the current working tree fails this.

Import the built package in a process with **no backend reachable** and with network access observable. Expect:

- the import completes successfully,
- **zero** network requests are attempted,
- **zero** bytes are written to stdout or stderr.

Run it against `dist/`, not `src/` — the residue is compiled into the published artifact, so checking the source alone does not prove the package is clean.

> **Regression watch**: this must be an automated test, not a manual step. It is the check that would have caught the debug residue before it reached the working tree.

## V2 — The incident scenario *(G6, FR-002, SC-001)*

The scenario that caused real harm. Judge a recorded execution result whose compile stage reports:

`code: null`, `signal: SIGKILL`, `status: TO`, `message: "Time limit exceeded (wall clock)"`, `stderr: ""`

Expect: verdict `CTLE`, attribution `system`.

**Fail condition**: verdict `CE`, or attribution `submission`. Either means the incident is not fixed.

Then judge a result whose compile stage reports a genuine compiler diagnostic (non-zero `code`, populated `stderr`, `signal: null`). Expect verdict `CE`, attribution `submission`. Both directions must hold — a fix that attributes *everything* to the system is not a fix.

`test/fixtures/` already contains recorded backend responses; extend them rather than inventing shapes.

## V3 — Forged system status *(G5, FR-003, SC-004)*

Judge a result for a submission that **completed normally** but whose `stderr` (and separately, whose `stdout`) contains the text `Killed`.

Expect: attribution and verdict entirely unaffected — the same verdict as an identical result without that text.

Then judge a result for a submission genuinely terminated for exceeding its memory allowance, where the evidence is in the backend-authored fields only. Expect verdict `MLE`.

> This is an anti-cheat check, not only a correctness check. If it fails, a student can choose their own verdict.

## V4 — Total judging *(G3, FR-010, SC-002)*

Pass the failure arm of `ExecutionOutcome` — the value produced when the backend is unreachable — directly to `judge()`.

Expect: a `JudgedResult` with verdict `SE` and attribution `system`. **It must not throw.**

**Consumer-facing proof**: after this passes, the consuming system's pre-check (`executeRes.success === false || executeRes.error || !executeRes.run`) becomes dead code. If that pre-check is still required, G3 is not met.

## V5 — Type safety at the boundary *(G11, NFR-TYPE, SC-006)*

Type-check the package **including its tests** (this is a new requirement — tests are currently excluded, see research S7/D8).

Then, in a scratch consumer file, read an attribution and a compile-stage fact from a judged result **without** any escape-hatch cast, and confirm it type-checks. Confirm also that the compiler rejects reading `run` from the failure arm without narrowing — if it does not, the discriminated union is not narrowing and the `any` erasure has survived.

## V6 — Catalogue freshness *(G10, FR-009)*

With a reachable backend: query the catalogue twice inside the freshness window and confirm the backend is contacted once. Advance past the window (inject the clock rather than sleeping), query again, and confirm a refetch occurs.

Then make the backend unreachable and query past the window. Expect the failure to be surfaced to the caller — **not** a silent stale copy and **not** an empty catalogue.

## V7 — Effective limits *(G8, FR-008)*

Execute without supplying a compile-stage time allowance. Confirm the result reports the value actually applied, and that the same value is readable from the exported defaults without executing anything.

Execute again supplying an explicit allowance, and confirm the reported effective value is the supplied one.

---

## Release verification *(FR-012, SC-007)*

```
npm run build
npm pack --dry-run
```

Before any publication, confirm from the packed file list that:

- no development-only scratch or manual-test entry point is included,
- `dist/index.js` contains no module-level invocation (grep the built artifact, not the source),
- the version is `0.2.0`.

**Publication is a human action.** The automated agent prepares and verifies the artifact and stops. `npm login` is required and is the maintainer's to perform.

## Definition of done

| Check | Proves |
|-------|--------|
| V1 | SC-003 — safe to publish |
| V2 | SC-001 — no student is charged for a system failure |
| V3 | SC-004 — attribution cannot be forged |
| V4 | SC-002 — consumer needs no pre-check |
| V5 | SC-006 — no escape-hatch typing needed |
| V6, V7 | FR-008, FR-009 |
| Full suite | SC-005 — every scenario in the spec is covered |

**Not proven by any of the above, by design**: that judging is faster, or that the backend stops being saturated. See the non-guarantees in `contracts/public-api.md`.
