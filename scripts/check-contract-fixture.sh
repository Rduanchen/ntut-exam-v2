#!/usr/bin/env bash
# Feature 007 — verify the exam-config payload contract fixture is byte-identical
# across all three schema definitions.
#
# config schema has THREE independent definitions in this project:
#   host/backend/src/schemas/config.schema.ts      (zod ^3)
#   host/frontend/src/types/config.ts              (TypeScript type)
#   desktop/src/main/schemas/examConfig.schema.ts  (zod ^4)
#
# Each holds a copy of the same fixture. They must not drift: the copies are the
# only thing anchoring three definitions that share no code. See
# specs/007-exam-lifecycle-state-machine/contracts/exam-phase-api.md G25.
set -euo pipefail

HOST_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURE="test/fixtures/exam-config-payload.fixture.json"
DESKTOP_REPO="${DESKTOP_REPO:-$HOST_ROOT/../desktop}"

BACKEND="$HOST_ROOT/backend/$FIXTURE"
FRONTEND="$HOST_ROOT/frontend/$FIXTURE"
DESKTOP="$DESKTOP_REPO/$FIXTURE"

fail() { echo "✗ $*" >&2; exit 1; }

[ -f "$BACKEND" ]  || fail "missing $BACKEND"
[ -f "$FRONTEND" ] || fail "missing $FRONTEND"

diff -q "$BACKEND" "$FRONTEND" >/dev/null \
  || fail "backend and frontend fixtures differ — run 'diff $BACKEND $FRONTEND'"

if [ -f "$DESKTOP" ]; then
  diff -q "$BACKEND" "$DESKTOP" >/dev/null \
    || fail "backend and desktop fixtures differ — run 'diff $BACKEND $DESKTOP'"
  echo "✓ contract fixture identical across backend, frontend, desktop"
elif [ "${SKIP_DESKTOP:-0}" = "1" ]; then
  echo "✓ contract fixture identical across backend, frontend (desktop skipped)"
else
  fail "desktop fixture not found at $DESKTOP
  The desktop repo holds the third definition of this contract and must be
  checked. Set DESKTOP_REPO=<path>, or SKIP_DESKTOP=1 if it is genuinely
  unavailable (CI without that checkout)."
fi

LANGUAGE_FIXTURE="test/fixtures/exam-languages.fixture.json"
if [ -f "$DESKTOP_REPO/$LANGUAGE_FIXTURE" ]; then
  diff -q "$HOST_ROOT/backend/$LANGUAGE_FIXTURE" "$DESKTOP_REPO/$LANGUAGE_FIXTURE" >/dev/null || fail "language fixtures differ"
  echo "✓ language contract fixture identical across backend and desktop"
elif [ "${SKIP_DESKTOP:-0}" != "1" ]; then
  fail "desktop language fixture missing"
fi
