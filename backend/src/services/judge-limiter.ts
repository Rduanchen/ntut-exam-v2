import pLimit from "p-limit";
import {
  JUDGE_BOUNDS,
  JUDGE_DEFAULTS,
  resolveJudgeSettings,
  type EffectiveJudgeSettings,
  type JudgeSettings,
} from "../config/judge.config";
import logger from "../utils/logger.util";

/**
 * The single ceiling on executions in flight against the execution backend.
 *
 * Three properties matter, and each corresponds to a way the previous
 * arrangement failed:
 *
 * 1. **One instance for the whole process.** The limiter it replaces was
 *    constructed per HTTP request, so N simultaneous requests admitted 5N
 *    executions — which is not a ceiling at all. Measured consequence: 0%
 *    failures at concurrency 20 and 23% at 30, a cliff crossed with nothing
 *    to stop it.
 *
 * 2. **It wraps the execution call, not a submission and not a request.** That
 *    is what makes the ceiling independent of how callers above batch work.
 *    Today's one-request-to-one-execution ratio is a coincidence of a
 *    sequential inner loop; wrapping any higher layer would leave the ceiling
 *    depending on that coincidence.
 *
 * 3. **Retries go through it too.** Retries surge exactly when the machine is
 *    already failing, which is when bypassing the ceiling does the most damage.
 */

const clampCeiling = (requested: number): number => {
  const { min, max } = JUDGE_BOUNDS.maxConcurrentJobs;
  if (!Number.isFinite(requested)) return JUDGE_DEFAULTS.maxConcurrentJobs;
  return Math.min(Math.max(Math.round(requested), min), max);
};

const limit = pLimit(JUDGE_DEFAULTS.maxConcurrentJobs);

/** Highest simultaneous in-flight count observed, for verifying the ceiling. */
let peakInFlight = 0;

/**
 * Run one execution under the ceiling.
 *
 * Every call that reaches the execution backend must go through here. A caller
 * that reaches it directly is not merely bypassing a convenience — it is
 * removing the only thing standing between a busy exam and the cliff.
 *
 * MUST NOT be nested. Acquiring a slot from inside a slot deadlocks as soon as
 * every slot is held by a task waiting for another: the holders can only
 * proceed by acquiring, and can only release by proceeding. Retries therefore
 * loop *around* this call, releasing between attempts, rather than recursing
 * through it. (Learned the hard way — a test written the nested way hung and
 * starved every test that followed it.)
 */
export async function withExecutionSlot<T>(task: () => Promise<T>): Promise<T> {
  return limit(async () => {
    peakInFlight = Math.max(peakInFlight, limit.activeCount);
    return task();
  });
}

/**
 * Change the ceiling while the system is running.
 *
 * An out-of-range value is clamped, never treated as unlimited: reading zero or
 * a negative number as "no limit" would silently restore unbounded concurrency
 * while the configuration claims a limit is in force.
 *
 * Raising the ceiling releases queued work immediately rather than waiting for
 * in-flight work to drain.
 */
export function setExecutionCeiling(requested: number): number {
  const ceiling = clampCeiling(requested);
  if (ceiling !== requested) {
    logger.warn(
      `[JudgeLimiter] Requested concurrency ceiling ${requested} is outside ` +
        `[${JUDGE_BOUNDS.maxConcurrentJobs.min}, ${JUDGE_BOUNDS.maxConcurrentJobs.max}]; clamped to ${ceiling}.`,
    );
  }
  if (limit.concurrency !== ceiling) {
    logger.info(`[JudgeLimiter] Concurrency ceiling ${limit.concurrency} -> ${ceiling}`);
    limit.concurrency = ceiling;
  }
  return ceiling;
}

export function getExecutionCeiling(): number {
  return limit.concurrency;
}

/** Executions running right now. */
export function inFlightCount(): number {
  return limit.activeCount;
}

/** Executions waiting for a slot. */
export function queuedCount(): number {
  return limit.pendingCount;
}

/**
 * Highest simultaneous in-flight count since the last reset.
 *
 * Exists so a test can assert the *maximum*, not an average. A concurrency test
 * that samples averages, or that submits work sequentially, passes with no
 * limiter present at all.
 */
export function peakInFlightCount(): number {
  return peakInFlight;
}

export function resetPeakInFlight(): void {
  peakInFlight = 0;
}

/**
 * Resolve settings and apply the ceiling they specify.
 *
 * Called at startup, whenever settings are written, and at the start of each
 * judging run — the last of those is what makes an uploaded configuration take
 * effect without anyone remembering to restart anything. It is idempotent, so
 * calling it often costs nothing.
 */
export function applyJudgeSettings(
  stored?: Partial<JudgeSettings> | null,
): EffectiveJudgeSettings {
  const effective = resolveJudgeSettings(stored);
  setExecutionCeiling(effective.maxConcurrentJobs.value);
  return effective;
}
