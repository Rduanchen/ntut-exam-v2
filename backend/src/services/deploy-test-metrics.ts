import { DEPLOY_TEST_ERROR_SAMPLE_LIMIT } from "../config/deploy-test.config";
import type { ConcurrencyResult, DeployTestAttempt } from "../types/deploy-test.type";
import { truncateJudgerOutput } from "../utils/judger-output.util";

export function nearestRank(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)];
}

export function distribution(values: number[]) {
  return { p50: nearestRank(values, .5), p95: nearestRank(values, .95), p99: nearestRank(values, .99), max: values.length ? Math.max(...values) : 0 };
}

export function distributeJobs(total: number, levels: number[]): number[] {
  const base = Math.floor(total / levels.length);
  const remainder = total % levels.length;
  return levels.map((_level, index) => base + (index < remainder ? 1 : 0));
}

export function summarizeConcurrency(input: {
  submittedConcurrency: number;
  activeCeiling: number;
  observedPeak: number;
  requested: number;
  attempts: DeployTestAttempt[];
  expectedFailures: number;
  infrastructureFailures: number;
  interrupted: number;
  durationMs: number;
  errors: string[];
}): ConcurrencyResult {
  const completed = input.attempts.length;
  const missing = Math.max(0, input.requested - completed - input.interrupted);
  const warnings: string[] = [];
  if (input.submittedConcurrency > input.activeCeiling) warnings.push("Submitted concurrency exceeded the active ceiling; excess work queued safely.");
  if (input.infrastructureFailures > 0) warnings.push("Infrastructure-attributed failures were observed.");
  if (missing > 0) warnings.push("Some requested jobs produced no terminal evidence.");
  return {
    submittedConcurrency: input.submittedConcurrency,
    activeCeiling: input.activeCeiling,
    observedPeakExecutionConcurrency: Math.min(input.observedPeak, input.activeCeiling),
    requested: input.requested,
    completed,
    expectedFailures: input.expectedFailures,
    infrastructureFailures: input.infrastructureFailures,
    missing,
    interrupted: input.interrupted,
    throughputPerSecond: input.durationMs > 0 ? completed / (input.durationMs / 1000) : 0,
    queueLatencyMs: distribution(input.attempts.map((a) => a.queueMs)),
    executionLatencyMs: distribution(input.attempts.map((a) => a.executionMs)),
    totalLatencyMs: distribution(input.attempts.map((a) => a.totalMs)),
    infrastructureFailureRate: input.requested > 0 ? input.infrastructureFailures / input.requested : 0,
    warnings,
    sampleErrors: input.errors.slice(0, DEPLOY_TEST_ERROR_SAMPLE_LIMIT).map((error) => truncateJudgerOutput(error)),
  };
}
