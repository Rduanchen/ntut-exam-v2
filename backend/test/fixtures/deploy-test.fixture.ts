import type { DeploymentTestRun } from '../../src/types/deploy-test.type';

export const deployRun = (overrides: Partial<DeploymentTestRun> = {}): DeploymentTestRun => ({
  id: '3d594650-3436-4a90-a896-9676be5e1173', state: 'completed', overallOutcome: 'passed',
  profile: { phases: ['smoke'], languages: ['c', 'cpp', 'python'], concurrencyLevels: [1, 4, 8], jobCount: 100, deadlineMs: 60_000 },
  settings: {
    compileTimeout: { value: 30_000, origin: 'default' }, compileMemoryLimit: { value: -1, origin: 'default' },
    maxConcurrentJobs: { value: 4, origin: 'default' }, maxSystemRetries: { value: 2, origin: 'default' },
    runTimeLimit: 10_000, runMemoryLimit: 256 * 1024 * 1024,
  },
  activeCeiling: 4, runtimes: [], progress: { phase: 'finalizing', completed: 3, total: 3, updatedAt: 10 },
  probes: [], concurrencyResults: [], errors: [], startedAt: 1, finishedAt: 10,
  ...overrides,
});
