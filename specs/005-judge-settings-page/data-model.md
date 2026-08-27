# Phase 1 Data Model: Judge Settings Page

**Feature**: 005-judge-settings-page

All entities are view-side. This feature persists nothing of its own — the backend owns the state.

## SettingOrigin

Where a value in force came from. Supplied by the backend; the page's job is to keep it visible.

| Value | Means | Presentation |
|-------|-------|--------------|
| `config` | Chosen in the exam configuration | Deliberate |
| `env` | Seeded from the environment on first run | Deliberate |
| `default` | Nobody chose it | Untouched |
| `clamped` | **The configured value was rejected as out of range** | Distinct from all three above |

**Rules**:
- Every displayed setting MUST carry one (FR-002).
- `clamped` MUST be visually distinct in *kind*, not merely in degree: the other three describe where a working value came from, while `clamped` says an operator's value was not honoured (research D4).
- A `clamped` setting MUST also state the value actually in force (FR-003).
- An unrecognised origin MUST render without breaking the page (FR-016).

## SettingGroup

The lifetime a setting belongs to. This is the reason the page is grouped at all — the three obey different rules, and an operator who does not know which is which will lose work.

| Group | Contains | Editable | Survives a configuration upload |
|-------|----------|----------|-------------------------------|
| `exam` | Time and memory allowances, comparison mode, compile allowances, retry maximum | yes | **no — replaced** |
| `machine` | Concurrency ceiling | yes | **no — replaced** |
| `container` | The execution backend's own startup settings | **no** | not applicable |

**Rules**:
- `exam` and `machine` MUST be distinguishable on screen (FR-004). They are edited the same way but describe different things: one travels with the exam paper, the other describes the hardware under it.
- `container` MUST be read-only and MUST name where it is changed (FR-005).
- Both editable groups MUST carry the statement that a configuration upload replaces them (FR-006). It applies to both, which is exactly why it cannot be attached to only one.

## EffectiveSetting

One row on the page.

| Field | Notes |
|-------|-------|
| `key` | Identifier as the backend names it |
| `value` | The value in force |
| `origin` | A `SettingOrigin` |
| `group` | A `SettingGroup` |

**Rules**:
- `value` is always the value **in force**, never a pending edit (FR-009).
- The page MUST NOT display a value the backend did not supply. For `container` settings no value exists, so none is shown (research D5) — a fabricated number is worse than the absence it hides.

## DraftEdit

An operator's unsaved change.

| Field | Notes |
|-------|-------|
| `key` | Which setting |
| `value` | What the operator typed |

**Rules**:
- MUST be visually distinct from the value in force until saved (FR-009).
- MUST NOT be applied until an explicit save (research D6): a concurrency ceiling applied per keystroke makes a half-typed `12` briefly `1`.
- After a failed save the draft MUST remain a draft — it MUST NOT be promoted into the displayed value in force (FR-008).
- After a successful save the page MUST show what the backend reports, not what the operator typed. They differ whenever a value was clamped.

## BackendHealth

| Field | Notes |
|-------|-------|
| `reachable` | Whether the execution backend answered |
| `runtimes` | Languages and versions actually installed, with their aliases |
| `checkedAt` | When this was observed |
| `error` | Present when unreachable |

**Rules**:
- Unreachable is a **reported state**, not a page failure (FR-013).
- MUST be re-checkable on demand without a reload (FR-012).
- `checkedAt` MUST be shown: "reachable" without a timestamp is a claim about an unknown moment, and the whole point is checking shortly before an exam.

## LanguageRequirement

One language the current exam paper depends on, resolved against what the backend can run.

| Field | Notes |
|-------|-------|
| `examLanguage` | As the exam configuration names it (`Cpp`, `Python`, …) |
| `available` | Whether the backend can run it |
| `matchedRuntime` | The runtime that satisfied it, when one did |

**Matching rule** (research D1):

> Lowercase `examLanguage`, then match against a runtime's `language` **or** any of its `aliases`.

- Matching on `language` alone reports C++ missing on every machine, because the exam calls it `Cpp` and the backend calls it `c++`. The alias list contains `cpp`, which closes the gap without copying the backend's mapping table into a second place that nothing keeps in step.
- An unmatched language is reported **missing**. That is the safe direction: a false "missing" is visible and correctable, a false "present" is discovered during the exam.
- A missing language MUST be surfaced prominently and MUST name the language (FR-011).

## PageLoadState

Settings and health load independently (research D7).

| State | Settings panel | Health panel |
|-------|---------------|--------------|
| both loaded | values shown | status shown |
| settings failed | **no values at all** | still usable |
| health failed | still usable | failure shown |

**Rules**:
- A failed settings load MUST show no values rather than stale ones (FR-015). Rendering last-known values after a failed refresh states something false exactly when an operator is deciding whether to change it.
- Neither failure may disable the other panel (SC-008). Health is the slower and more failure-prone of the two, and also the P1 reason to open the page at all.
