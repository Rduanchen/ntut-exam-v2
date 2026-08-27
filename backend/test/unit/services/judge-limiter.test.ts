import { describe, it, expect, beforeEach } from "vitest";
import {
  withExecutionSlot,
  setExecutionCeiling,
  getExecutionCeiling,
  peakInFlightCount,
  resetPeakInFlight,
  queuedCount,
} from "../../../src/services/judge-limiter";
import { JUDGE_BOUNDS, JUDGE_DEFAULTS } from "../../../src/config/judge.config";

/**
 * A deferred task, so a test can hold slots open and observe overlap.
 *
 * Overlap is the whole point. A concurrency test whose work completes before
 * the next item is submitted passes with no limiter present at all — it would
 * have passed against the per-request limiter this replaces, and against no
 * limiter whatsoever.
 */
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

beforeEach(() => {
  setExecutionCeiling(JUDGE_DEFAULTS.maxConcurrentJobs);
  resetPeakInFlight();
});

describe("US2 - the execution ceiling holds", () => {
  it("never exceeds the ceiling when work arrives simultaneously", async () => {
    setExecutionCeiling(3);
    resetPeakInFlight();

    const gates = Array.from({ length: 20 }, deferred);
    const runs = gates.map((g) => withExecutionSlot(() => g.promise));

    // Let the limiter admit whatever it is going to admit.
    await new Promise((r) => setImmediate(r));

    expect(peakInFlightCount()).toBeLessThanOrEqual(3);
    expect(queuedCount()).toBeGreaterThan(0); // proof the work really overlapped

    gates.forEach((g) => g.resolve());
    await Promise.all(runs);

    expect(peakInFlightCount()).toBeLessThanOrEqual(3);
  });

  it("applies one ceiling across independent callers, not one each", async () => {
    // The exact failure of the limiter this replaces: it was constructed per
    // request, so k simultaneous requests admitted k x N executions.
    setExecutionCeiling(2);
    resetPeakInFlight();

    const gates = Array.from({ length: 12 }, deferred);
    const caller = (from: number) =>
      Promise.all(gates.slice(from, from + 4).map((g) => withExecutionSlot(() => g.promise)));

    const callers = [caller(0), caller(4), caller(8)]; // three independent callers
    await new Promise((r) => setImmediate(r));

    expect(peakInFlightCount()).toBeLessThanOrEqual(2); // 2, not 2 x 3

    gates.forEach((g) => g.resolve());
    await Promise.all(callers);
  });

  it("subjects retries to the ceiling like any other execution", async () => {
    setExecutionCeiling(2);
    resetPeakInFlight();

    /* Retries re-acquire a slot; they do not hold one while waiting for
     * another. Nesting would deadlock — every slot held by a task that can
     * only finish by acquiring a slot — which is why the service loops around
     * withExecutionSlot rather than recursing through it. */
    const attemptWithRetries = async (attempts: number) => {
      for (let i = 0; i < attempts; i += 1) {
        await withExecutionSlot(async () => {
          await new Promise((r) => setImmediate(r));
        });
      }
    };

    await Promise.all(Array.from({ length: 6 }, () => attemptWithRetries(3)));

    expect(peakInFlightCount()).toBeGreaterThan(0); // work really overlapped
    expect(peakInFlightCount()).toBeLessThanOrEqual(2);
  });
});

describe("US2 - the ceiling changes at runtime", () => {
  it("releases queued work when raised, without a restart", async () => {
    setExecutionCeiling(1);
    resetPeakInFlight();

    const gates = Array.from({ length: 6 }, deferred);
    const runs = gates.map((g) => withExecutionSlot(() => g.promise));
    await new Promise((r) => setImmediate(r));
    expect(peakInFlightCount()).toBe(1);

    setExecutionCeiling(4);
    await new Promise((r) => setImmediate(r));

    expect(peakInFlightCount()).toBeGreaterThan(1);
    expect(peakInFlightCount()).toBeLessThanOrEqual(4);

    gates.forEach((g) => g.resolve());
    await Promise.all(runs);
  });

  it("takes the lower value when lowered, without exceeding either bound", async () => {
    setExecutionCeiling(4);
    resetPeakInFlight();
    setExecutionCeiling(2);

    const gates = Array.from({ length: 8 }, deferred);
    const runs = gates.map((g) => withExecutionSlot(() => g.promise));
    await new Promise((r) => setImmediate(r));

    expect(peakInFlightCount()).toBeLessThanOrEqual(4);
    expect(getExecutionCeiling()).toBe(2);

    gates.forEach((g) => g.resolve());
    await Promise.all(runs);
  });
});

describe("US2 - an invalid ceiling never means unlimited", () => {
  it.each([
    ["zero", 0],
    ["negative", -5],
    ["absurd", 1_000_000],
    ["fractional", 2.7],
    ["not a number", Number.NaN],
  ])("clamps %s into range", (_label, requested) => {
    const applied = setExecutionCeiling(requested as number);

    expect(applied).toBeGreaterThanOrEqual(JUDGE_BOUNDS.maxConcurrentJobs.min);
    expect(applied).toBeLessThanOrEqual(JUDGE_BOUNDS.maxConcurrentJobs.max);
    expect(Number.isInteger(applied)).toBe(true);
    expect(getExecutionCeiling()).toBe(applied);
  });

  it("still enforces a ceiling after an invalid value was requested", async () => {
    // The failure being guarded: reading 0 as "no limit" would silently restore
    // unbounded concurrency while the configuration claims a limit is in force.
    setExecutionCeiling(0);
    resetPeakInFlight();

    const gates = Array.from({ length: 10 }, deferred);
    const runs = gates.map((g) => withExecutionSlot(() => g.promise));
    await new Promise((r) => setImmediate(r));

    expect(peakInFlightCount()).toBeLessThanOrEqual(JUDGE_BOUNDS.maxConcurrentJobs.max);
    expect(queuedCount()).toBeGreaterThan(0);

    gates.forEach((g) => g.resolve());
    await Promise.all(runs);
  });
});
