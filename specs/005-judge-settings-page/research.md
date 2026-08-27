# Phase 0 Research: Judge Settings Page

**Feature**: 005-judge-settings-page
**Date**: 2026-08-27

## Source Survey

| # | Finding | Evidence | Bearing |
|---|---------|----------|---------|
| S1 | **The frontend's exam-config type still describes the pre-004 schema.** `judgerSettings` lists three fields; the backend schema now has seven. Nothing failed, because nothing binds the two. | `frontend/src/types/config.ts` vs `backend/src/schemas/config.schema.ts` | The frontend has no oracle for backend contract changes. Directly relevant: this feature adds a screen whose entire content is that contract. |
| S2 | **`LanguageKey` is `string`.** A mistyped language in an exam configuration is caught by nothing on this side. | `frontend/src/types/config.ts` line 1 | Bears on FR-011: the "required language" set comes from data no type constrains. |
| S3 | **Authorisation is already handled.** An axios interceptor attaches the admin bearer token to every request. | `frontend/src/plugins/axios.ts` | NFR-SEC needs no work; the page inherits it by using the shared client. Recorded so it is not re-solved. |
| S4 | **The frontend has no test framework and no standalone type check.** `vue-tsc` runs only as part of `build`. | `frontend/package.json` scripts | NFR-TEST is the largest single piece of this feature — larger than the page. |
| S5 | **Two conventions for reaching the backend coexist.** Most stores call `axios` inline; `src/api/judging.ts` (added in 004) is a typed module. | `frontend/src/stores/*.store.ts` vs `frontend/src/api/judging.ts` | Picking one matters for NFR-COUPLE, which requires the page to be testable without a live backend. |
| S6 | **The backend cannot report the execution backend's own container settings.** Health returns reachability and runtimes; nothing exposes `PISTON_MAX_CONCURRENT_JOBS` or its neighbours, and nothing can — they are container environment variables read at startup. | `backend/src/constants/piston.config.ts`, `docker-compose.yml` | Constrains US6. See D5: the page must not display a value it cannot know. |

---

## D1 — Matching an exam's languages against what the backend can run

**Decision**: Lowercase the exam configuration's language key and match it against each runtime's `language` **or** its `aliases`. Do not reproduce the backend's language mapping.

**Rationale**: The exam configuration names languages `Python`, `Cpp`, `C`, `Java`, `JavaScript`; the execution backend reports `python`, `c++`, `c`, `java`, `javascript`. `Cpp → c++` is not derivable by any string transformation, so a naive comparison reports C++ as missing on every machine — a false alarm minutes before an exam, which the specification calls out as expensive.

The backend already owns a mapping table, but copying it here would create a second copy of a contract with nothing to keep them in step — the exact drift S1 shows has already happened once.

**The aliases make the copy unnecessary.** Verified against the live instance:

```
{"language":"c",   "aliases":["gcc"]}
{"language":"c++", "aliases":["cpp","g++"]}
```

`"Cpp".toLowerCase()` is `"cpp"`, which is an alias of `c++`. The remaining four match `language` directly once lowercased. So one rule — lowercase, then match language or aliases — covers every language the system supports, and keeps working if the backend's mapping changes, because it derives from what the backend *reports* rather than from what another module *believes*.

**Alternatives considered**:
- *Duplicate the backend's mapping table*: rejected — a second copy of a contract, with S1 as evidence of what happens next.
- *Match on `language` only*: rejected — reports C++ missing on every machine.
- *Have the backend expose the mapping*: the cleanest answer, and out of scope (no backend changes). Recorded as a finding.

**Residual risk**: this depends on the execution backend publishing a useful alias set. If a future language matches neither its name nor an alias it is reported missing — the safe direction, since a false "missing" is visible and a false "present" is not.

## D2 — Introducing a test framework

**Decision**: Vitest with Vue Test Utils and a DOM environment, scoped to this feature's page, store and API module. Add a standalone type-check script alongside it.

**Rationale**: Vitest is already the backend's runner and shares Vite's configuration, so the frontend does not acquire a second toolchain. Testing the page's *behaviour* — what an operator can see and do — rather than component internals keeps the tests aligned with the specification's scenarios and survives a Vuetify upgrade.

The standalone type check matters independently: `vue-tsc` currently runs only inside `build`, so drift like S1 stays invisible until someone builds. A type check that is not routinely run is not a guard.

**Scope discipline**: the framework arrives with this feature and covers this feature. Retrofitting the rest of the frontend is out of scope, and is the thing most likely to expand quietly.

## D3 — Where the data lives

**Decision**: A typed API module for the two endpoints, a store holding page state, and a view that renders it. Follow the `src/api/judging.ts` convention rather than inline axios (S5).

**Rationale**: NFR-COUPLE requires the page's behaviour to be testable without a live backend. Separating the calls lets a test drive "the backend says a language is missing" or "the settings request failed" directly, which is what every scenario in the specification actually asserts. Inline axios inside a component forces every test to mock HTTP, which tests the mock as much as the page.

## D4 — Displaying provenance

**Decision**: Each setting shows its value and a distinguishable origin marker; `clamped` is visually distinct from the other three and states the value actually in force.

**Rationale**: The three benign origins differ in *confidence* — configured, seeded, defaulted — while `clamped` differs in *kind*: the operator's own value was rejected. Presenting all four alike loses the one distinction that requires action.

The requirement exists because the incident was caused by a limit nobody knew existed. Showing a number without its origin recreates that: an operator sees "30 seconds" and cannot tell whether it was measured or merely never chosen.

## D5 — Settings the page cannot read

**Decision**: For the execution backend's own container settings, show **what they are and where they are changed — never a value.**

**Rationale**: S6 — nothing exposes these values, and nothing can without a backend change that is out of scope. The page could display the compose file's defaults, but they would be a *guess* about a running container: an operator who edited the file without redeploying, or who deployed with an override, would be shown a confident wrong number.

A missing value labelled as unavailable is honest. A fabricated one is worse than the hunt it saves. This is the rule the judging library now follows: report facts, do not manufacture the ones you do not have.

**Alternatives considered**: *Read the compose file at build time* — rejected; it describes the file, not the container. *Add a backend endpoint* — the right answer, out of scope, recorded as a finding.

## D6 — Save semantics

**Decision**: Explicit save with dirty tracking; edits are visibly distinct from values in force until saved.

**Rationale**: A concurrency ceiling applied on every keystroke means a partially typed `12` is briefly `1`. Explicit save also matches the existing configuration editor, so operators meet one interaction model rather than two.

## D7 — Independent failure

**Decision**: Settings and health load independently; either failing leaves the other usable, and a failed settings load shows no values at all rather than stale ones.

**Rationale**: SC-008. Health is the slower and more failure-prone of the two — it depends on a third system — and it is also the P1 reason to open the page before an exam. Coupling them makes the most valuable panel hostage to the least reliable one. And a settings panel that keeps rendering last-known values after a failed refresh tells an operator something false at the moment they are deciding whether to change it.

## Findings recorded, not fixed here

Both need backend changes, which this feature excludes:

- **The execution backend's container settings are not reportable** (S6). Until they are, US6 can name them but not show them.
- **The language mapping lives only in the backend** (D1). The alias-based match makes a copy unnecessary, but an explicit endpoint would be sturdier than inference.

Also recorded: the frontend's exam-config type has already drifted from the backend schema (S1), and nothing would have caught it. That is broader than this feature; the type check added in D2 makes the *next* drift visible but does not bind the two schemas.

## Open items carried to `/speckit-tasks`

None.
