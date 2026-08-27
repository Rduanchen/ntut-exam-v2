# Feature Specification: Judge Settings Page

**Feature Branch**: `[005-judge-settings-page]`

**Created**: 2026-08-27

**Status**: Draft

**Scope**: `frontend/` only. Feature 004 built the endpoints; this feature makes them reachable.

**Input**: User description: "新增前端「評測器設定」頁面，讓助教與管理員能在不改檔案、不重啟系統的情況下調整評測參數，並在考試開始前確認評測後端是否可用。... 前端目前完全沒有介面消費這兩個端點，所以那些能力等於不存在。"

## Context

Feature 004 made judging settings readable, writable and attributable, and made the execution backend's health queryable. **None of it is reachable.** Tuning still means editing a file, and "the execution backend has no Python installed" is still discovered during an exam rather than before one.

A capability nobody can reach is not a capability. This feature closes that gap and nothing else.

Governing constraints from the project knowledge base:
- `knowledge/history/確立考卷即機器完整設定.md` — one configuration file fully defines one exam machine, and uploads replace rather than merge. The page must state this rather than hide it.
- The derived principle **Fault Attribution Isolation** — a system condition that could affect grading must be visible.
- `README.md` — the concurrency sweep method, and the measured cliff behind it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Confirm the machine can run this exam, before it starts (Priority: P1)

Before an exam begins, an operator checks that the execution backend is reachable and can actually run every language the exam paper uses.

**Why this priority**: This is the failure that already happened and had no warning surface — a backend with only the C family installed, an exam paper expecting Python, and nothing anywhere that said so until students were sitting down. It is also the cheapest possible check: one glance, minutes before an exam, against an outage that would otherwise consume it.

**Independent test**: Open the page against a backend missing a language the exam requires; confirm the gap is stated prominently and names the missing language. Valuable on its own even if no setting is ever edited.

**Acceptance Scenarios**:

1. **Given** a reachable execution backend, **When** the page is opened, **Then** it shows that it is reachable and lists the languages and versions it can run.
2. **Given** an exam paper requiring a language the backend cannot run, **When** the page is opened, **Then** the mismatch is shown prominently and names the missing language.
3. **Given** an unreachable execution backend, **When** the page is opened, **Then** it says so plainly, as a reported state rather than a broken page.
4. **Given** an operator who has just installed a language, **When** they re-run the check from the page, **Then** the refreshed result is shown without reloading or restarting anything.

---

### User Story 2 - See where each setting's value came from (Priority: P1)

An operator reviewing judging settings can tell, for each value, whether someone chose it deliberately, whether it is an untouched default, or whether their own value was rejected as out of range.

**Why this priority**: Provenance is the whole reason the backend reports it. The original incident was caused by a limit that nobody knew existed, silently defaulting inside a dependency. Displaying a number without its origin recreates exactly that condition — an operator sees "30 seconds" and cannot tell whether it was measured or merely never chosen.

**Independent test**: View settings whose values come from different origins and confirm each is labelled distinguishably; set an out-of-range value and confirm it is shown as rejected rather than silently displayed as if accepted.

**Acceptance Scenarios**:

1. **Given** a setting taking its value from the exam configuration, **When** it is displayed, **Then** it is distinguishable from one taking a default.
2. **Given** a setting whose configured value was outside the permitted range, **When** it is displayed, **Then** it is shown prominently as rejected, together with the value actually in force.
3. **Given** any displayed setting, **When** an operator looks at it, **Then** they can determine its origin without consulting documentation or another screen.

---

### User Story 3 - Change a setting without editing files or restarting (Priority: P1)

An operator adjusts a judging setting from the page and it takes effect immediately.

**Why this priority**: The stated purpose of the feature. Shares P1 with the two above because a page that only displays would leave tuning exactly where it is today — in a file, on a machine, during an exam.

**Independent test**: Change a value, save, and confirm the page reports the new value in force; confirm an invalid value is refused or shown as clamped rather than silently accepted.

**Acceptance Scenarios**:

1. **Given** an operator editing a setting, **When** they save, **Then** the new value is in force without a restart and the page reflects it.
2. **Given** an operator entering a value outside the permitted range, **When** they save, **Then** the page shows the value actually applied and that theirs was not honoured.
3. **Given** a save that fails, **When** it fails, **Then** the operator is told, and the page does not display the attempted value as though it had been applied.
4. **Given** an operator who has made edits but not saved, **When** they look at the page, **Then** unsaved changes are distinguishable from values in force.

---

### User Story 4 - Understand which settings survive a configuration upload (Priority: P2)

An operator can tell, from the page itself, that what they change here will be replaced the next time a configuration file is uploaded.

**Why this priority**: This is the single most surprising consequence of the deployment model. An operator who tunes a machine, then uploads an exam paper, and silently loses the tuning will conclude the page is broken. Saying so plainly costs a sentence. P2 because it prevents a misunderstanding rather than an outage.

**Independent test**: Open the page and confirm the replacement behaviour is stated where the settings are edited, not buried elsewhere.

**Acceptance Scenarios**:

1. **Given** the settings page, **When** an operator views the editable settings, **Then** it states that uploading a configuration file will replace them.
2. **Given** the page, **When** an operator views it, **Then** settings are grouped so that those following the exam paper are distinguishable from those describing this machine.

---

### User Story 5 - Know that capacity must be measured, not guessed (Priority: P2)

An operator setting the concurrency ceiling is told that the right value is a property of this machine and how to find it.

**Why this priority**: The ceiling is the one setting that travels with an exam paper while describing hardware. Copying a paper to a different machine carries a value sized for the wrong one — and the symptom of getting it wrong is the original incident. Guidance at the point of editing is what prevents a number being copied forward forever.

**Independent test**: View the concurrency setting and confirm it carries guidance identifying it as machine-specific and pointing to the measurement method.

**Acceptance Scenarios**:

1. **Given** the concurrency ceiling, **When** an operator views it, **Then** it is presented as a property of this machine, not of the exam.
2. **Given** an operator about to change it, **When** they view the guidance, **Then** they are directed to measure this machine rather than copy a value.

---

### User Story 6 - See settings that cannot be changed here, and where to change them (Priority: P3)

An operator can see the execution backend's own container settings, and is told plainly that they are changed elsewhere.

**Why this priority**: Without this, an operator hunting for the backend's own concurrency ceiling either concludes it does not exist or edits the wrong one. P3 because a determined operator will find the file; this saves the hunt.

**Independent test**: Confirm the read-only settings are shown as read-only and name the file that governs them.

**Acceptance Scenarios**:

1. **Given** settings that only take effect when the execution backend starts, **When** they are displayed, **Then** they are clearly not editable here.
2. **Given** such a setting, **When** an operator wants to change it, **Then** the page names where it is changed.

---

### Edge Cases

- **The settings request fails.** The page must not present stale or invented values as current.
- **The health check is slow or times out.** The rest of the page must remain usable; health is one panel, not a precondition.
- **No exam configuration exists yet.** Settings should still be viewable, since defaults are still in force — a machine with no exam loaded is exactly when an operator is preparing one.
- **The exam paper uses a language the backend reports under a different name.** A naming difference must not be reported as a missing language; the check exists to catch genuine absences, and a false alarm before an exam is expensive.
- **An operator opens the page during an exam.** Changing the concurrency ceiling mid-exam is legitimate — it is how an operator reacts to a struggling machine — and must not require a restart.
- **Two operators edit simultaneously.** The last save wins; the page must not silently present one operator's unsaved edits as though they were in force.
- **The backend reports a setting the page does not know about.** Unknown settings must not break the page.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The judging settings MUST be reachable from the application's primary navigation, on a page of their own, separate from the exam paper editor.
- **FR-002**: Each setting MUST be displayed with its value in force and the origin of that value.
- **FR-003**: A value rejected as out of range MUST be shown prominently as rejected, alongside the value actually applied.
- **FR-004**: Editable settings MUST be grouped so that those following the exam paper are distinguishable from those describing this machine.
- **FR-005**: Settings that only take effect when the execution backend starts MUST be shown as read-only, naming where they are changed.
- **FR-006**: The page MUST state, where settings are edited, that uploading a configuration file replaces them.
- **FR-007**: Saving a setting MUST apply it without requiring a restart, and the page MUST then show the value in force.
- **FR-008**: A failed save MUST be reported, and the attempted value MUST NOT be presented as applied.
- **FR-009**: Unsaved edits MUST be distinguishable from values in force.
- **FR-010**: The page MUST report whether the execution backend is reachable and which languages and versions it can run.
- **FR-011**: A language required by the current exam paper but absent from the execution backend MUST be shown prominently, naming the language.
- **FR-012**: The health check MUST be re-runnable from the page without a reload.
- **FR-013**: An unreachable execution backend MUST be reported as a state, not as a page failure.
- **FR-014**: The concurrency ceiling MUST carry guidance identifying it as a property of this machine and directing the operator to measure it.
- **FR-015**: A failure to load settings MUST NOT result in stale or invented values being shown as current.
- **FR-016**: Settings the page does not recognise MUST NOT prevent the rest of the page from working.

### Non-Functional Requirements (Constitution Mandated)

- **NFR-TYPE**: The data exchanged with the backend MUST be strictly typed at the boundary; escape-hatch typing MUST NOT be required to read a setting, an origin, or a health report (Constitution I).
- **NFR-COUPLE**: Data access MUST be separable from presentation, so the page's behaviour is testable without a live backend (Constitution V).
- **NFR-TEST**: The frontend currently has no automated test framework. One MUST be introduced, and every scenario in this specification MUST have automated coverage (Constitution VI).
- **NFR-SEC**: The page MUST sit behind the same authorisation as other administrative screens (Constitution IV).

### Key Entities

- **Effective Setting**: One judging parameter — its value in force, and the origin of that value (chosen in the configuration, seeded from the environment, an untouched default, or clamped after being rejected).
- **Setting Group**: The lifetime a setting belongs to — follows the exam paper, describes this machine, or belongs to the execution backend's own startup configuration.
- **Execution Backend Health**: Reachability, the languages and versions actually installed, and when it was observed.
- **Language Requirement**: A language the current exam paper depends on, matched against what the backend can run.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can determine, in under one minute and without leaving the page, whether the machine can run every language the exam requires.
- **SC-002**: Changing a judging setting requires **zero** file edits and **zero** restarts.
- **SC-003**: For every displayed setting, an operator can state its origin without consulting documentation.
- **SC-004**: A value rejected as out of range is never displayed as though it had been accepted.
- **SC-005**: An operator can state, from the page alone, which settings a configuration upload will replace.
- **SC-006**: An operator setting the concurrency ceiling is directed to measure this machine rather than reuse a number.
- **SC-007**: 100% of the scenarios in this specification are covered by automated tests, in a frontend test suite that did not previously exist.
- **SC-008**: A failure of either the settings request or the health check leaves the remainder of the page usable.

## Assumptions

- Feature 004's endpoints are available and behave as its contract states: settings readable and writable with provenance, health reporting reachability and installed runtimes.
- The page is for operators — teaching assistants and administrators — and reuses the existing administrative authorisation. No new roles are introduced.
- Saving is explicit rather than on every keystroke, matching the existing configuration editor and avoiding a partially-typed number being applied as a live concurrency ceiling.
- The exam paper's language names and the execution backend's language names differ in form, so matching is by meaning rather than by literal equality.
- Health is checked when the page opens and on demand, not polled continuously; the value is in checking before an exam, not in a live monitor.
- A frontend test framework is introduced with this feature, covering this page. Retrofitting tests to the rest of the frontend is out of scope.

## Dependencies

- Feature 004 (merged 2026-08-27) provides every endpoint this page consumes. No backend change is required or permitted here.
- The exam configuration must be readable to determine which languages the paper requires.

## Out of Scope

- **Any backend change.** This feature makes existing capability reachable; if something is missing, that is a finding to record, not to fix here.
- **Live visualisation of judging progress.** The existing live-update channel already refreshes results.
- **Retrofitting tests to the rest of the frontend.** The framework arrives here; the backlog it exposes is a separate concern.
- **Editing the execution backend's own container settings.** They are read at startup; presenting them as editable would be a lie.
