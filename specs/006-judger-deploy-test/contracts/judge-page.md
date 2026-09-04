# Judge Page Contract: Deploy Test

## Route and navigation

- The existing `/judge` route remains the only route.
- The page presents two tabs: **Settings** and **Deploy Test**.
- Opening Deploy Test, starting a run, watching progress, reading results, and exporting the report never changes route.
- Existing primary navigation remains unchanged.

## Deploy Test states

### Initial loading

- Profile/defaults and latest run load independently from existing judge settings/health.
- A failure in either domain does not hide or disable the other domain.
- If the latest run is active, the Deploy Test tab is selected and polling resumes.

### Ready

- Show server-provided phases, fixed language scope, derived default concurrency levels, numeric bounds, active ceiling, and deadline.
- Run requires an explicit click and confirmation describing resource consumption.
- Client validation is advisory; server validation remains authoritative.

### Start refused

- Show the server reason (`exam_in_progress`, student judging, active/draining deploy test, unreachable backend, or invalid profile).
- If the server returns the already-active deploy run, display and poll that run instead of creating an error-only state.
- Preserve the previous terminal report when admission fails.

### Queued/running

- Show lifecycle, start time, current phase, completed/total progress, and freshness time.
- Poll recursively one second after each completed response; requests never overlap.
- A transient polling error labels displayed progress as stale, keeps it visible, and retries.
- Navigating away/unmounting stops polling only; it does not stop backend work.

### Terminal

- Show lifecycle separately from overall outcome.
- Render every selected probe with expected/observed verdict and attribution, attempts, duration, and bounded diagnostic.
- Render every concurrency level with submitted/actual concurrency, exact accounting, throughput, p50/p95/p99/max, system-failure rate, and warnings.
- `completed + failed` must be visibly different from a successful report.
- Interrupted reports show the interruption reason and never use success styling.
- Export is enabled for a terminal report and serializes the exact object currently displayed.

## Component responsibilities

- `JudgeSettingsView.vue`: route-level tabs and independent domain loading/unmount coordination only.
- `DeployTestPanel.vue`: compose profile, status, and result components; no network or timer calls.
- `DeployTestProfileForm.vue`: edit profile within server bounds and emit explicit start.
- `DeployTestRunStatus.vue`: lifecycle, timestamps, freshness, phase, and progress.
- `DeployTestProbeResults.vue`: smoke/verdict evidence.
- `DeployTestConcurrencyResults.vue`: per-level measurements/accounting.
- `deploy-test.store.ts`: authoritative run/profile state, start, restore, non-overlapping polling, stale-response generation guard, and export orchestration.
- `api/deploy-test.ts`: typed HTTP only.
- `download-json.ts`: Blob/object-URL/click/revoke mechanics only.

## Polling invariants

- Only one timer and one status request may exist for the active store generation.
- A start/restore of a different run invalidates older generations.
- Late responses from an invalid generation cannot overwrite current state.
- All terminal states stop polling.
- The client never manufactures a terminal state from a timeout or network error.
- Remount always asks backend truth; no run/report is restored from localStorage.

## Accessibility and diagnostics

- Tab selection, run action, status, progress, and export are keyboard reachable.
- Outcome is communicated by text/icon as well as color.
- Progress exposes completed and total values to assistive technology.
- Large diagnostics remain truncated and expandable only within the bounded value received.
- Tables retain labels at narrow widths and may scroll horizontally rather than dropping columns.

## Test selectors

Stable semantic selectors should cover at least:

- `judge-tab-settings`, `judge-tab-deploy-test`
- `deploy-test-panel`, `deploy-test-profile`, `deploy-test-start`
- `deploy-test-error`, `deploy-test-stale`
- `deploy-test-status`, `deploy-test-progress`, `deploy-test-outcome`
- `deploy-test-probe-row`, `deploy-test-concurrency-row`
- `deploy-test-export`

Selectors describe user-visible roles and must not expose component implementation internals.
