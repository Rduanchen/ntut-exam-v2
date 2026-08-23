# Phase 0 Research: Comprehensive Backend Tests

All findings below were verified against the code on 2026-08-23, not inferred from documentation.

---

## R1. How does supertest reach the real application?

**Decision**: Extract `createApp(): express.Express` into `backend/src/app.ts`. `src/index.ts`
imports it and retains only process lifecycle (DB init, Piston probe, socket bootstrap, `listen`).
Integration tests call `supertest(createApp())`.

**Rationale**: `src/index.ts:20-70` builds the app at module scope and `src/index.ts:112` calls
`startServer()` unconditionally at import. Importing it from a test would connect the file
database (`initDatabase`), probe a Piston server over the network (`checkPistonServer`), and bind
a TCP port. There is no seam.

The duplication this forces already exists in the repo: `test/crypto.test.ts:52-63` creates its own
`express()`, mounts `userRouter`/`adminRouter` by hand, and writes its **own** error handler. That
handler differs from production's (`src/index.ts:54-70` also emits `err.code` and logs 5xx). Tests
written against it cannot satisfy spec.md:39, which requires that "the global error handler
intercepts and returns correct error structures".

**Alternatives considered**:
- *Keep hand-assembling an app per test file* — status quo. Rejected: tests a different app than
  production (different error handler, no `cors`, no 5mb body limits), and the divergence is silent.
- *Start the real server and point supertest at the URL* — what `crypto.test.ts` does with `fetch`.
  Rejected: real sockets, port lifecycle to clean up, slower, and it does not remove the duplication.
- *`vi.mock` the whole app* — rejected: an integration test that mocks the integration point tests
  nothing.

**Scope note**: this is the only planned change to `src/`. It is behaviour-preserving; `index.ts`
must produce a byte-identical middleware/route/error-handler ordering.

---

## R2. How do integration tests authenticate as a student?

**Decision**: Tests speak the **real AES-GCM wire protocol** via a `TestClient` helper in
`test/helpers/`. `LOAD_TEST_MODE=pure` is rejected as a harness.

**Rationale**: `src/middlewares/user-crypto.middleware.ts:16-73` performs five steps — AES key
lookup, GCM decryption, session-token signature verification, device-UUID match, replay protection.
`LOAD_TEST_MODE=pure` (lines 17-28) skips all five and accepts a plaintext `{ device_uuid, testId }`.

Using that bypass would mean the entire student authentication path is never executed by the suite.
This contradicts `knowledge/principles.md:5` — "考試系統的完整性與公平性是不可妥協的。所有連線與身份綁定
（包含 IP 與裝置 ID）都必須經過嚴格驗證" — and Constitution IV. A regression in decryption, token
verification, or replay protection would ship green.

Feasibility is already demonstrated: `test/crypto.test.ts:168-296` runs the complete client flow
(fetch RSA public key → `register-device` → `login` → receive `session_token` → issue an encrypted
request) against the real middleware. `CryptoService` exposes everything a client needs —
`encryptAESGCM` (line 58), `generateSessionToken` (line 82), `getRsaPublicKey` (line 18). The work is
to promote that flow into a reusable helper, not to invent it.

**Additional benefit**: negative security cases become cheap and are currently untested — tampered
GCM tag, replayed nonce, timestamp drift, session token bound to a different `device_uuid`
(middleware line 51-53).

**Alternatives considered**:
- *`LOAD_TEST_MODE=pure`* — rejected as above. **Mitigation added instead**: a guard test asserting
  `process.env.LOAD_TEST_MODE` is unset during the suite, so the bypass can never be silently enabled.
- *`vi.mock` the crypto middleware* — acceptable only for controller tests where crypto is
  incidental. Rejected as the default because it would apply to all 3 user controllers, which is
  where the security surface lives.

---

## R3. How do integration tests authenticate as an admin?

**Decision**: Send `x-admin-token: <ADMIN_TOKEN>`; `test/setup.ts` sets `process.env.ADMIN_TOKEN`
to a fixed test value. Helper: `adminRequest(app)`.

**Rationale**: `src/middlewares/admin.middleware.ts:8-28` compares a Bearer or `x-admin-token`
header against `process.env.ADMIN_TOKEN || "admin-secret"`. No session, no database. All 10 admin
controllers are reachable with one header.

`requirePermission` (lines 33-48) short-circuits for `SUPER_ADMIN`, which `verifyAdminToken` always
injects (line 23) — so the permission branch for a non-super admin is **currently unreachable
through HTTP**. Unit-test `requirePermission` directly rather than pretending integration covers it.

**Free negative cases**: missing token and wrong token both yield 401, satisfying spec.md:39 for all
admin routes at near-zero cost.

---

## R4. Database strategy and reset between tests

**Decision**: One database — the `sequelize` singleton from `src/config/database.config.ts`, forced
to `:memory:` by `test/setup.ts` setting `DB_STORAGE` before any import. Per-test
`sequelize.sync({ force: true })` plus re-seeding the default exam config. **Delete every
per-file `new Sequelize(...)`.**

**Rationale**: the suite currently runs two incompatible strategies at once. `test/setup.ts:21-39`
initialises the singleton and force-syncs it before each test, while 5 legacy files construct their
own `new Sequelize({ storage: ":memory:", models: [...] })`. Because `sequelize-typescript` model
classes are global, the later constructor **re-binds the shared model classes to its own instance** —
so a per-file database silently hijacks the models away from the singleton for the rest of that file.

This is the concrete mechanism behind spec.md:47's "太亂了", and it has already caused a failure:
`test/init.service.test.ts` registered 8 of 10 models, so `InitService.wipeAllData()` crashed with
`SQLITE_ERROR: no such table: login_requests` once `LoginRequest`/`UnblockedDevice` were added to
production but not to the test's hand-maintained model list. The singleton has the full list in one
place (`database.config.ts:28-39`) and cannot drift.

The singleton path is already proven: all 6 `test/unit/` files from feature 001 use it and pass.

**Concurrency caveat and mitigation**: Vitest runs test *files* in parallel worker processes; each
worker has its own module registry, hence its own `:memory:` database — cross-file isolation is
automatic. The residual risk is *within* a process: `database.config.ts:41-46` configures
`pool.max: 5`, and each SQLite `:memory:` connection is a distinct database. Sequelize's SQLite
dialect keeps one connection for `:memory:` in practice, which is why the current tests pass, but
this is incidental rather than guaranteed. **Mitigation**: set `pool: { max: 1 }` when
`DB_STORAGE === ':memory:'`, making the invariant explicit instead of relying on dialect behaviour.

**Alternatives considered**:
- *Transaction rollback per test* — faster, but Sequelize requires threading the transaction through
  every service call. Services take no transaction parameter, so this would mean changing `src/`.
  Rejected: `sync({ force: true })` on an in-memory SQLite costs ~1ms at current suite size.
- *A fresh Sequelize per file (status quo)* — rejected as above.

---

## R5. Mocking external systems

**Decision**: `socket.io` stays mocked globally in `test/setup.ts:7-19`. Add a global `vi.mock` for
`piston-judger`. Individual tests spy on `SocketService` methods when asserting broadcasts.

**Rationale**: spec.md:90 assumes Piston is mocked. `judger.service.ts` calls it for every
submission; an unmocked call would hit a real sandbox over the network, violating the "no real
network" constraint and making results depend on a Piston server being up. The 001 unit tests
already mock at the `src/modules/judger` level; the global mock makes the guarantee suite-wide
rather than per-file.

Socket mocking must remain global: `src/index.ts:72-75` initialises both namespaces at import, and
`SocketService.triggerAlertEvent` is called on every anti-cheat violation. Note that services already
tolerate an uninitialised socket (observed warning: "Failed to send status update notification via
socket: MessageSocketService not initialized"), so a partial mock degrades to a warning rather than a
failure — acceptable, but tests asserting a broadcast must spy explicitly rather than rely on it.

---

## R6. Test folder layout

**Decision**:

```text
test/
├── setup.ts
├── fixtures/            # typed builders, single source of truth for valid data
├── helpers/             # TestClient, adminRequest
├── unit/services/       # 16 files, mirroring src/services/
└── integration/controllers/{admin,user}/   # 13 files, mirroring src/controllers/
```

**Rationale**: FR-004 asks for `unit/` + `integration/`; mirroring the source tree makes SC-001 and
SC-002 verifiable with `ls` rather than a coverage report. `fixtures/` is separated from `helpers/`
because they fail differently: a stale fixture is a *data* drift (caught by the type checker), a
stale helper is a *protocol* drift (caught only by a failing test).

**Migration of existing files**:
- 9 root `*.test.ts` → `unit/services/` (7 of them), with the 5 per-file Sequelize instances removed
- `test/crypto.test.ts` **splits**: primitives (lines 88-135) and replay protection (136-166) →
  `unit/services/crypto.service.test.ts` and `unit/services/replay-protection.service.test.ts`;
  the E2E API scenarios (167-405) → `integration/` rewritten on supertest; the client flow →
  `helpers/test-client.ts`
- `test/unit/{auth,judger}.*.test.ts` (feature 001) → `unit/services/`, keeping their behavioural
  names as `describe` blocks so the 001 acceptance criteria stay traceable
- `test/index.test.ts` — already deleted (was `expect(1 + 1).toBe(2)`)

**Constraint**: the 6 feature-001 tests encode security acceptance criteria (sandbox isolation,
output truncation, TLE, IP fallback, TA rebinding). Moving them must not weaken an assertion; they
are relocated verbatim apart from import paths.

---

## R7. Fixture design — preventing recurrence of the 2026-08-23 drift

**Decision**: One typed builder per entity in `test/fixtures/`, e.g.
`buildExamConfig(overrides?: DeepPartial<ExamConfig>): ExamConfig`, returning a **valid** object
typed as the production type.

**Rationale**: the 7 failures found on 2026-08-23 all came from fixtures duplicated across files and
updated in none. `exam-config.service.test.ts` and `init.service.test.ts` held byte-identical
90-line `validConfig` literals; when `b2729ae` made `environmentVariables.startPassword` mandatory,
both rotted. `knowledge/experience.md:19` — "考試環境的初始化必須是強制的、嚴格校驗的" — is the reason
the schema tightened, so the schema is right and the duplication is the defect.

Typing the builder's return as `ExamConfig` (rather than an untyped literal) means the next schema
change fails `tsc -p tsconfig.test.json`, which now gates `npm run test`. This was verified by
deliberately removing `environmentVariables` from a fixture: `npm run test` exited 2 with TS2741.

---

## R8. Coverage configuration

**Decision**: widen `vitest.config.ts` `coverage.include` from the two feature-001 files to
`src/services/**` and `src/controllers/**`. Do not set a hard threshold in this feature; report only.

**Measured floor (recorded 2026-08-23, after implementation)**:

| Scope | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| `src/services/**` | 87.29 | 76.90 | 94.66 | 87.24 |
| `src/controllers/admin/**` | 78.92 | 73.17 | 100 | 78.85 |
| `src/controllers/user/**` | 73.33 | 59.78 | 100 | 73.33 |
| **All in-scope files** | **83.53** | **73.59** | **96.77** | **83.39** |

Suite: 34 files / 257 tests in ~2.6s. A follow-up may set the threshold at these
numbers; function coverage at 96.77% is the closest to enforceable today, while
branch coverage at 73.59% is the honest gap against Constitution VI.

**Rationale**: `vitest.config.ts` currently includes only `judger.service.ts` and `auth.service.ts`,
a leftover from feature 001's targeted goal — it would report a misleading near-100% for a suite
that covers a fraction of the backend. Constitution VI demands 100%, but a threshold that fails the
build before the 29 new test files exist would block the feature it is meant to protect. Sequencing:
land the tests, measure, then set the threshold at the measured floor in a follow-up.

---

## Unresolved

None. No `NEEDS CLARIFICATION` markers remain in Technical Context.
