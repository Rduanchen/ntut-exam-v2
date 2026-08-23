# Quickstart: Validating Comprehensive Backend Tests

How to run and verify this feature's acceptance criteria. Every command runs from `backend/`.

## Prerequisites

```bash
cd backend
pnpm install          # supertest must be present; see step 0
```

No Piston server, no database file, and no running backend are required — everything is mocked or
in-memory. If a test needs a live service, that test is wrong.

## Step 0 — Add the missing dev dependency

```bash
pnpm add -D supertest @types/supertest
```

spec.md:88 lists this as an assumption; it is not installed today.

## Step 1 — Run the suite

```bash
npm run test
```

`npm run test` is `tsc -p tsconfig.test.json && vitest run`: it **type-checks test code before
running it**. A fixture that has drifted from `src/schemas/` fails here rather than producing a
confusing runtime error.

Expected: all tests pass, exit code 0.

Baseline before this feature (2026-08-23): `14 files / 53 tests`, ~0.9s.

## Step 2 — Verify the anti-drift gate actually blocks

The gate is the reason this feature does not rot again, so prove it works rather than trusting it:

```bash
# Temporarily break a fixture's type, e.g. drop a required field from buildExamConfig()
npm run test; echo "exit=$?"     # expect a non-zero exit and a TS error, NOT a test failure
git checkout -- test/            # restore
```

Verified on 2026-08-23: removing `environmentVariables` from a fixture produced
`error TS2741: Property 'environmentVariables' is missing` and `exit=2`.

## Step 3 — Verify FR-001 / SC-001 (every service has a unit test)

```bash
for s in src/services/*.service.ts; do
  b=$(basename "$s" .service.ts)
  [ -f "test/unit/services/$b.service.test.ts" ] || echo "MISSING unit test: $b"
done
```

Expected: no output. There are 16 service files; 7 have no dedicated test as of 2026-08-23
(`binding`, `device`, `exam-config-parser`, `exam-state`, `exam`, `message`, `replay-protection`).

## Step 4 — Verify FR-002 / SC-002 (every controller has an integration test)

```bash
for c in src/controllers/*/*.controller.ts; do
  d=$(basename "$(dirname "$c")"); b=$(basename "$c" .controller.ts)
  [ -f "test/integration/controllers/$d/$b.test.ts" ] || echo "MISSING integration test: $d/$b"
done
grep -rl "supertest" test/integration | wc -l    # expect 13
```

Expected: no missing files, and every integration file uses `supertest`.

## Step 5 — Verify FR-004 / SC-004 (folder hygiene)

```bash
ls test/*.test.ts 2>/dev/null && echo "FAIL: loose test files in test/ root" || echo "OK: root is clean"
ls test/
```

Expected: `test/` contains only `setup.ts`, `fixtures/`, `helpers/`, `unit/`, `integration/`.

## Step 6 — Verify FR-003 (no database file is written)

```bash
rm -f database.sqlite
npm run test
test -f database.sqlite && echo "FAIL: a test wrote a real database" || echo "OK: in-memory only"
```

## Step 7 — Verify the security guard (research R2)

```bash
grep -rn "LOAD_TEST_MODE" test/ | grep -v "guard"
```

Expected: no test *sets* `LOAD_TEST_MODE`. The only permitted reference is the guard test that
asserts it is unset. If a test enables `pure` mode, student authentication is not being tested at
all — see research.md R2.

## Step 8 — Verify SC-003 (suite under 20 seconds)

```bash
npm run test 2>&1 | grep Duration
```

Expected: well under 20s. Investigate any single file over ~2s — the usual cause is a real timer or
an unmocked network call rather than genuine work.

## Step 9 — Coverage report

```bash
npx vitest run --coverage
```

Reports `src/services/**` and `src/controllers/**`. No threshold is enforced in this feature
(research R8); record the measured floor so a follow-up can enforce it.

## Verifying the `createApp()` extraction did not change behaviour

```bash
npm run build                 # tsc must still succeed against src only
npm run dev                   # then, in another shell:
curl -s localhost:3000/       # "NTUT Exam Host Backend is running."
curl -s localhost:3000/health # {"status":"UP","database":"UP",...}
```

The seam is behaviour-preserving by contract (contracts/test-harness.md C1). If `/health` or the
error-response shape changes, the extraction is wrong.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `SQLITE_ERROR: no such table: X` | a test built its own `new Sequelize(...)` with an incomplete model list — use the singleton (research R4) |
| `MessageSocketService not initialized` warning | expected; services tolerate it. To assert a broadcast, `vi.spyOn` the service method |
| A test passes alone but fails in the suite | state bleed — the file is not relying on `setup.ts`'s per-test `sync({ force: true })` |
| Type error in a test but `npm run build` is clean | correct: `tsconfig.json` covers `src/` only, `tsconfig.test.json` covers both |
