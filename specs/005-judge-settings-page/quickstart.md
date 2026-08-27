# Quickstart: Validating the Judge Settings Page

**Feature**: 005-judge-settings-page

Contract details are in `contracts/page-contract.md`; entity rules are in `data-model.md`.

## Prerequisites

```
cd frontend
npm install
npm test        # the suite this feature introduces
npm run build   # includes the type check
```

Most validations run against a stubbed backend — that is the point of separating data access (research D3). V7 wants a real one.

---

## V1 — The exam's languages are checked against the machine *(G6, G7, SC-001)*

The reason this page is worth opening before an exam.

Stub the backend as reachable with only the C family installed, and an exam paper requiring Python. Confirm the page:

- reports the backend reachable,
- lists the installed languages and versions,
- states prominently that **Python** is missing, naming it.

Then stub an exam requiring `Cpp` against a backend reporting `c++` with alias `cpp`. Confirm it is **satisfied**.

> That second case is the one that matters. Matching on name alone reports C++ missing on every machine, and a false alarm minutes before an exam costs more than the check saves.

Finally, stub an unreachable backend and confirm the page says so as a state, and remains usable.

## V2 — Origins are visible and clamping is loud *(G2, SC-003, SC-004)*

Stub settings whose values come from different origins. Confirm each is distinguishable, and that an operator can tell a deliberate value from an untouched default without leaving the page.

Then stub a `clamped` setting. Confirm it is distinct **in kind** from the other three, and states the value actually in force.

> Failing this reproduces the original defect at the presentation layer: a number nobody can attribute is the same as a silent default.

## V3 — Editing takes effect without a restart *(G5, SC-002)*

Change a value and save. Confirm the page reports the value in force afterwards, taken from the backend's response rather than from what was typed.

Then have the backend clamp the saved value. Confirm the page shows the **applied** value, not the typed one.

Then make the save fail. Confirm the failure is reported and the attempted value is **not** shown as in force.

## V4 — Drafts are distinguishable from reality *(G5, FR-009)*

Edit a field without saving. Confirm the unsaved value is visibly distinct from the value in force, and that nothing has been applied.

## V5 — The replacement rule is stated where settings are edited *(G4, SC-005)*

Confirm both editable groups carry the statement that uploading a configuration file replaces them, and that an operator can tell from the page alone which settings that covers.

## V6 — Capacity guidance and read-only settings *(G1, G3, G8, SC-006)*

Confirm the concurrency ceiling is presented as a property of this machine, directing the operator to measure rather than copy.

Confirm the execution backend's own container settings are shown as read-only, name where they are changed, and **display no value** — the page cannot know them, and a plausible wrong number is worse than an honest gap.

## V7 — Panels fail independently *(G9, SC-008)*

Fail the settings request and confirm the health panel still works. Fail health and confirm settings still work.

Then fail a settings **refresh** after a successful load, and confirm no values remain on screen. Stale values shown as current are a lie told at the exact moment an operator is deciding whether to change something.

## V8 — Unknown data does not break the page *(G10, FR-016)*

Stub a setting key and an origin the page does not recognise. Confirm the rest of the page renders and works.

---

## Definition of done

| Check | Proves |
|-------|--------|
| V1 | SC-001 — the machine can be verified before an exam |
| V2 | SC-003, SC-004 — values are attributable |
| V3 | SC-002 — no file edits, no restarts |
| V4, V5 | SC-005 — the deployment model is visible |
| V6 | SC-006 — capacity is measured, not copied |
| V7, V8 | SC-008 — failure is contained |
| Full suite | SC-007 — coverage in a suite that did not exist |

**Not proven by any of the above, by design**: that judging behaves any differently. This feature adds no capability — it makes reachable what features 003 and 004 already built. Every endpoint it calls worked before it existed.
