import { describe, expect, it } from 'vitest';
import { distributeJobs, nearestRank, summarizeConcurrency } from '../../../src/services/deploy-test-metrics';
import type { DeployTestAttempt } from '../../../src/types/deploy-test.type';

const attempt = (totalMs: number): DeployTestAttempt => ({ attempt: 1, status: 'AC', attribution: 'submission', stage: 'run', enqueuedAt: 0, slotAcquiredAt: 1, finishedAt: totalMs, queueMs: 1, executionMs: totalMs - 1, totalMs, diagnostic: '' });
describe('deployment metrics', () => {
  it('uses nearest-rank percentiles and handles empty input', () => {
    expect(nearestRank([], .95)).toBe(0);
    expect(nearestRank([1, 2, 3, 4], .95)).toBe(4);
  });
  it('allocates every job exactly once', () => expect(distributeJobs(100, [1, 4, 8]).reduce((a, b) => a + b, 0)).toBe(100));
  it('reports exact accounting, warnings, throughput and capped samples', () => {
    const result = summarizeConcurrency({ submittedConcurrency: 8, activeCeiling: 4, observedPeak: 7, requested: 4, attempts: [attempt(10), attempt(20)], expectedFailures: 0, infrastructureFailures: 1, interrupted: 1, durationMs: 1000, errors: Array.from({ length: 20 }, (_, i) => `e${i}`) });
    expect(result.completed + result.missing + result.interrupted).toBe(result.requested);
    expect(result.observedPeakExecutionConcurrency).toBe(4);
    expect(result.throughputPerSecond).toBe(2);
    expect(result.sampleErrors).toHaveLength(10);
    expect(result.warnings.length).toBeGreaterThan(1);
  });
});
