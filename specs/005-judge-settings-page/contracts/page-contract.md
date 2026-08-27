# Contract: Judge Settings Page

**Feature**: 005-judge-settings-page
**Contract type**: UI surface plus the backend endpoints it consumes
**Backend changes**: none. Every endpoint already exists (feature 004).

## Consumed endpoints

| Endpoint | Used for | Failure handling |
|----------|----------|------------------|
| `GET /admin/judger/settings` | Effective settings with origins | Panel shows a failure, **no values** |
| `PUT /admin/judger/settings` | Apply a change | Reported; draft stays a draft |
| `GET /admin/judger/health` | Reachability + installed runtimes | Panel shows unreachable |
| `GET /admin/config` | Which languages the exam paper requires | Language check unavailable; rest of page unaffected |

Authorisation rides on the existing shared client (research S3). No new scheme.

## Guarantees

### G1 — Nothing is displayed that was not reported
Every value on the page comes from the backend. Where no value exists — the execution backend's own container settings — **none is shown**, and the absence is labelled. A guess about a running container is worse than the hunt it saves. *(FR-005, research D5)*

### G2 — Every value carries its origin
No setting is displayed without saying where its value came from. `clamped` is distinct in kind from the other three, and states the value actually in force. *(FR-002, FR-003)*

> This is the requirement that answers the original incident. A number shown without its origin is indistinguishable from the silent default that caused it.

### G3 — Groups reflect lifetime
Settings following the exam paper are distinguishable from those describing this machine, and both are distinguishable from those changed elsewhere. *(FR-004, FR-005)*

### G4 — The replacement rule is stated where it bites
Both editable groups carry the statement that uploading a configuration file replaces them. It is not a footnote elsewhere. *(FR-006)*

### G5 — Drafts are not values
An unsaved edit is visually distinct from the value in force, is applied only on explicit save, and after a failed save remains a draft. After a successful save the page shows what the backend reports — which differs from what was typed whenever a value was clamped. *(FR-007, FR-008, FR-009)*

### G6 — Capability is checkable before an exam
The page reports reachability, the languages and versions actually installed, when that was observed, and any language the exam requires that the backend cannot run — naming it. Re-checkable without a reload. *(FR-010 – FR-013)*

### G7 — A language is matched by meaning
`Cpp` matches `c++`; `Python` matches `python`. Matching is against a runtime's name **or** its aliases, so a naming difference is never reported as a missing language. An unmatched language is reported missing, which is the safe direction. *(FR-011, research D1)*

### G8 — Capacity is presented as measured, not chosen
The concurrency ceiling is presented as a property of this machine, with the measurement method, not as a number to copy forward. *(FR-014)*

### G9 — Panels fail independently
A settings failure leaves health usable and vice versa. A settings failure shows no values rather than stale ones. *(FR-015, SC-008)*

### G10 — Unknown data does not break the page
A setting or origin the page does not recognise renders without preventing the rest from working. *(FR-016)*

## Navigation

The page is reachable from the primary navigation, separate from the exam paper editor. *(FR-001)*

## Non-guarantees

- **No new capability.** Every endpoint consumed already worked before this feature. What changes is that a person can reach it.
- **The container's own settings are named, not shown.** Their values are not obtainable without a backend change.
- **Health is checked, not monitored.** On open and on demand — the value is in checking before an exam, not in a live dashboard.
- **The rest of the frontend gains no tests.** The framework arrives here and covers this feature.
