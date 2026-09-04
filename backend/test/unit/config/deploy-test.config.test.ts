import { describe, expect, it } from 'vitest';
import { defaultConcurrencyLevels, defaultDeployTestProfile, DEPLOY_TEST_BOUNDS } from '../../../src/config/deploy-test.config';
import { deploymentTestProfileSchema } from '../../../src/schemas/deploy-test.schema';

describe('deploy test profile', () => {
  it('derives stable bounded defaults from the active ceiling', () => {
    expect(defaultConcurrencyLevels(4)).toEqual([1, 4, 8]);
    expect(defaultConcurrencyLevels(64)).toEqual([1, 64]);
    expect(defaultDeployTestProfile(4).jobCount).toBe(100);
  });

  it.each([
    { phases: ['smoke'], languages: ['c'], concurrencyLevels: [0], jobCount: 1, deadlineMs: 60_000 },
    { phases: ['smoke', 'smoke'], languages: ['c'], concurrencyLevels: [1], jobCount: 1, deadlineMs: 60_000 },
    { phases: ['smoke'], languages: ['c'], concurrencyLevels: [2, 1], jobCount: 1, deadlineMs: 60_000 },
    { phases: ['smoke'], languages: ['c'], concurrencyLevels: [1], jobCount: DEPLOY_TEST_BOUNDS.maxJobs + 1, deadlineMs: 60_000 },
    { phases: ['smoke'], languages: ['c'], concurrencyLevels: [1], jobCount: 1, deadlineMs: 1, surprise: true },
  ])('rejects unsafe or ambiguous input %#', (profile) => {
    expect(() => deploymentTestProfileSchema.parse(profile)).toThrow();
  });
});
