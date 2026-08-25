# Phase 1 Data Model: Comprehensive Backend Tests

This feature adds no production entities. The "data model" here is the **test data surface**: the
fixture builders that are the single source of truth for valid data, and the persistence entities
they populate. Both are typed against production types so that a schema change breaks compilation.

---

## 1. Fixture builders (`test/fixtures/`)

Each builder returns a **valid** object typed as the production type, with a deep-partial override
hook. Validity is the invariant: a builder that returns something the schema rejects is a bug.

| Builder | Returns | Backed by | Key validation rules it must satisfy |
|---|---|---|---|
| `buildExamConfig(o?)` | `ExamConfig` | `src/schemas/config.schema.ts:63-78` | `environmentVariables.startPassword` non-empty (line 72); `judgerSettings.compareMode` present after parse (line 69); `language` ∈ supported keys (line 41); `accessibleUsers[].ip` a valid IP or `""` (line 60) |
| `buildUser(o?)` | `User` attrs | `src/models/user.model.ts` | `testId` unique; `ipAddress` nullable; `deviceUuid` **null at init** (see §3) |
| `buildDeviceKey(o?)` | `DeviceKeyMap` attrs | `src/models/device-key-map.model.ts` | `clientAesKey` a hex-encoded 32-byte key — `DeviceService.getAesKey` does `Buffer.from(clientAesKey, "hex")` (device.service.ts:123) |
| `buildSubmission(o?)` | `Submission` attrs | `src/models/submission.model.ts` | `questionId` must exist in the exam config used by the same test |
| `buildViolation(o?)` | `ViolationLog` attrs | `src/models/violation-log.model.ts` | `type`, `message`, `testId` non-null; `isOk` defaults false |
| `buildSpecialRule(o?)` | `SpecialRule` | `config.schema.ts:13-23` | `type` ∈ regex \| use \| composite \| nestedLoop; `multiplier` ∈ [0,1] |

**Composition rule**: a builder never writes to the database. Persisting is the caller's job
(`await User.create(buildUser())`), so the same builder serves both unit tests (no DB) and
integration tests (DB).

---

## 2. Persistence entities touched by tests

All 10 models are registered on the singleton in `src/config/database.config.ts:28-39`. Tests never
re-declare this list — the `init.service.test.ts` failure of 2026-08-23 (`no such table:
login_requests`) was caused by a hand-maintained duplicate falling behind.

| Model | Table | Role in tests |
|---|---|---|
| `User` | `users` | Identity, IP binding, `deviceUuid` binding state |
| `DeviceKeyMap` | — | AES key per device; required for any authenticated user request |
| `LoginRequest` | `login_requests` | TA-approved rebinding queue |
| `UnblockedDevice` | — | Admin-granted rebinding exemptions |
| `ScoreBoard` | — | Per-user scores and `puzzleResults` tree |
| `Submission` | — | Code submissions and grading status |
| `ViolationLog` | `violation_logs` | Anti-cheat violations |
| `UserActionLog` | — | Action trail; anti-cheat reads it to detect multi-IP / multi-user |
| `Message` | — | TA ↔ student messaging |
| `SystemSettings` | — | Key/value store; holds `exam_config` as a JSON string |

---

## 3. State transitions the tests must pin

These are behaviours that changed in production and where the tests previously asserted the *old*
state. They are recorded here so the rewritten tests assert the current contract deliberately.

### Device binding lifecycle
```
initialization        → User.deviceUuid = null, no DeviceKeyMap row   (ae7470f: decoupled)
register-device       → DeviceKeyMap row created with clientAesKey
login                 → User.deviceUuid bound; session_token issued
second device attempt → LoginRequest created; requires TA approval     (cc86e4d)
TA approval / unbind  → deviceUuid cleared AND ipAddress cleared       (cc86e4d)
```
Init no longer pre-allocates a `deviceUuid` even for a user with a configured IP.

### Exam config lifecycle
```
no config          → restrictedUpdate throws 404      (exam-config.service.ts:27-29)
validateAndSave    → full Zod validation, 400 on failure
restrictedUpdate   → accepts the new config wholesale, EXCEPT:
                     accessibleUsers and environmentVariables are force-retained from the stored
                     config (lines 39-40), and structural changes are rejected with 400:
                     section/puzzle counts and ids, subtask count, language, visible/hidden
                     test-case counts (lines 42-84)
```
Note: `testTitle` and puzzle `title` **are** mutable after initialization. The old test asserted the
opposite; the service does not implement a field allow-list.

### Violation collapsing
```
first occurrence          → ViolationLog created, socket alert fired
repeat, same type+message, isOk=false → existing row's `time` updated, NO second alert
                                        (anti-cheat.service.ts:87-101)
```

---

## 4. Test double registry

| Double | Scope | Where | Why |
|---|---|---|---|
| `socket.io` `Server` | global | `test/setup.ts:7-19` | prevents port binding at import of `src/index.ts` |
| `piston-judger` | global | `test/setup.ts` (to add) | prevents real sandbox execution over the network |
| `SocketService.triggerAlertEvent` | per test | `vi.spyOn` | asserting an alert fired, rather than suppressing it |
| `CryptoService` | per test, unit only | `vi.mock` | already used by `unit/auth.rebinding.test.ts`; **must not** be used in integration tests (research R2) |

---

## 5. Environment contract

| Variable | Test value | Set by | Effect if wrong |
|---|---|---|---|
| `DB_STORAGE` | `:memory:` | `test/setup.ts:4`, before any import | tests write a real `database.sqlite` |
| `ADMIN_TOKEN` | fixed test value | `test/setup.ts` (to add) | admin routes fall back to `"admin-secret"` |
| `LOAD_TEST_MODE` | **must be unset** | asserted by a guard test | crypto verification silently bypassed |
| `NODE_ENV` | not `development` | default | Sequelize logs every query |
