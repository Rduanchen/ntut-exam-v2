# Contract: Test Harness Interfaces

The interfaces this feature exposes are internal — consumed by test files, not by end users. They
are contracts nonetheless: 29 new test files depend on them, so a change here breaks the suite.

---

## C1. `createApp()` — `backend/src/app.ts` (NEW)

```ts
export function createApp(): express.Express;
```

**Guarantees** — the returned app is byte-for-byte the production composition:

| Order | Element | Source today |
|---|---|---|
| 1 | `cors()` | `src/index.ts:23` |
| 2 | `express.json({ limit: "5mb" })` | `src/index.ts:24` |
| 3 | `express.urlencoded({ extended: true, limit: "5mb" })` | `src/index.ts:25` |
| 4 | `/user` → `userRouter` | `src/index.ts:27` |
| 5 | `/admin` → `adminRouter` | `src/index.ts:28` |
| 6 | `GET /health` | `src/index.ts:30-48` |
| 7 | `GET /` | `src/index.ts:50-52` |
| 8 | global error handler | `src/index.ts:54-70` |

**Must NOT do**: connect the database, probe Piston, create an HTTP server, bind a port, or
initialise socket namespaces. Those stay in `index.ts`.

**Error-handler contract** (what integration tests assert against, per spec.md:39):
- status = `err.statusCode ?? err.status ?? 500`
- body = `{ error: string, code?: string }`
- 5xx additionally logged with stack

**Verification**: `GET /` returns `"NTUT Exam Host Backend is running."` and `npm run dev` /
`npm start` behave identically after the extraction.

---

## C2. `TestClient` — `backend/test/helpers/test-client.ts` (NEW)

Speaks the real student wire protocol. Derived from the working flow in
`test/crypto.test.ts:168-296`.

```ts
export class TestClient {
  constructor(app: express.Express);

  /** GET /user/auth/rsa-public-key, generate an AES key, POST /user/auth/register-device */
  registerDevice(deviceUuid?: string): Promise<{ deviceUuid: string; aesKey: Buffer }>;

  /** POST /user/auth/login with an encrypted payload; stores the returned session_token */
  login(testId: string, password?: string): Promise<{ sessionToken: string }>;

  /** Encrypt `body` with the session AES key and POST it; returns the supertest response */
  post(path: string, body: object): Promise<request.Response>;
  get(path: string): Promise<request.Response>;

  /** Escape hatches for negative tests — each corrupts exactly one field */
  withTamperedTag(): TestClient;
  withReplayedNonce(): TestClient;
  withSkewedTimestamp(seconds: number): TestClient;
  withMismatchedDeviceUuid(other: string): TestClient;
}
```

**Contract with the middleware** (`src/middlewares/user-crypto.middleware.ts:30-63`): every
authenticated request body is `{ iv, ciphertext, tag, device_uuid }`, and the decrypted plaintext
must contain `session_token`, `timestamp`, and `nonce`. Omitting any of the four outer fields yields
400; a bad token or replayed nonce yields 401.

**Invariant**: `TestClient` never sets `LOAD_TEST_MODE`. A guard test asserts the variable is unset
for the whole suite.

---

## C3. `adminRequest()` — `backend/test/helpers/admin-request.ts` (NEW)

```ts
export function adminRequest(app: express.Express, token?: string): supertest.SuperTest<...>;
```

Attaches `x-admin-token` (default: the value `test/setup.ts` wrote to `process.env.ADMIN_TOKEN`).
Passing an explicit wrong token drives the 401 branch of
`src/middlewares/admin.middleware.ts:16-18`.

**Known limitation, recorded deliberately**: `verifyAdminToken` always injects
`role: "SUPER_ADMIN"` (line 23) and `requirePermission` short-circuits on that role (line 40), so
the 403 branch is unreachable over HTTP. It is unit-tested directly instead — integration tests must
not claim to cover it.

---

## C4. Endpoint coverage matrix (FR-002 / SC-002)

13 controllers, 46 endpoints. Each integration file covers its controller's endpoints with at least
one success case and one failure case (spec.md:38-39).

| Controller | Route file | Endpoints | Auth |
|---|---|---|---|
| `admin-anticheat` | `admin-anticheat.route.ts` | 3 | admin token |
| `exam-config` | `admin-config.route.ts` | 3 | admin token |
| `admin-exam-state` | `admin-exam-state.route.ts` | 2 | admin token |
| `exam-config` (init routes) | `admin-init.route.ts` | 3 | admin token |
| `admin-judger` | `admin-judger.route.ts` | 1 | admin token |
| `admin-log` | `admin-log.route.ts` | 2 | admin token |
| `admin-message` | `admin-message.route.ts` | 1 | admin token |
| `score` | `admin-score.route.ts` | 1 | admin token |
| `admin-security` | `admin-security.route.ts` | 3 | admin token |
| `admin-submission` | `admin-submission.route.ts` | 6 | admin token |
| *(system-info)* | `admin-system-info.route.ts` | 1 | admin token |
| `connection` | `connection.route.ts` | 9 | admin token |
| `user` | `user-auth.route.ts` | 4 | none / crypto |
| `user` | `user-exam.route.ts` | 3 | crypto session |
| `user-log` | `user-log.route.ts` | 1 | crypto session |
| `user-submission` | `user-submission.route.ts` | 3 | crypto session |

**Two route files do not map 1:1 to a controller file** — verified, not assumed:

- `admin-init.route.ts:7-9` dispatches to `ExamConfigController.initializeDatabase` /
  `.resetDatabase` / `.getSystemInitStatus`. Its 3 endpoints belong in the `exam-config` integration
  file, so that file covers 6 endpoints across two route files.
- `admin-system-info.route.ts:9` defines its handler **inline in the route file** — there is no
  controller. Its single endpoint reports `LOAD_TEST_MODE` warnings to the admin dashboard.

Consequence for SC-002: "100% of controller files have integration tests" can be literally satisfied
while `GET /admin/system-info` stays untested. That endpoint is worth covering regardless of the
letter of the criterion — it is the dashboard's only signal that a security bypass is active, which
makes it the visible counterpart to the guard test in research R2. `/speckit-tasks` should assign it
to `test/integration/routes/admin-system-info.test.ts`.

---

## C5. Service coverage matrix (FR-001 / SC-001)

16 services. 9 have a dedicated test today; 7 do not.

| Service | Test today | Action |
|---|---|---|
| `anti-cheat` | `test/anti-cheat.service.test.ts` | move + extend |
| `auth` | `test/unit/auth.{ip-fallback,rebinding}.test.ts` | move + extend |
| `code-storage` | `test/code-storage.service.test.ts` | move |
| `crypto` | `test/crypto.test.ts` (lines 88-135) | split out |
| `exam-config` | `test/exam-config.service.test.ts` | move |
| `init` | `test/init.service.test.ts` | move |
| `judger` | `test/judger.service.test.ts` + 4 unit files | move + consolidate |
| `system-settings` | `test/system-settings.service.test.ts` | move |
| `user-action-log` | `test/user-action-log.service.test.ts` | move |
| `binding` | — | **NEW** |
| `device` | — | **NEW** |
| `exam-config-parser` | — | **NEW** |
| `exam-state` | — | **NEW** |
| `exam` | — | **NEW** |
| `message` | — | **NEW** |
| `replay-protection` | partial, in `crypto.test.ts:136-166` | **NEW** (split out) |

`src/services/special-rules/` (`engine.ts`, `rule-provider.ts`) is a subdirectory, not one of the 16
files. spec.md:65 says "all 16 `src/services/` files" — treat the subdirectory as out of scope and
record it as a follow-up rather than silently folding it in.
