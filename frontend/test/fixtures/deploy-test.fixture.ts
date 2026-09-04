import type { DeploymentTestRun, ProfileDescriptor, RunEnvelope } from '../../src/types/deploy-test';

export const descriptor: ProfileDescriptor = {
  defaults: { phases: ['smoke', 'verdict', 'concurrency'], languages: ['c', 'cpp', 'python'], concurrencyLevels: [1, 4, 8], jobCount: 100, deadlineMs: 900_000 },
  bounds: { maxLevels: 8, minConcurrency: 1, maxConcurrency: 64, minJobs: 1, maxJobs: 500, minDeadlineMs: 60_000, maxDeadlineMs: 1_800_000 },
  activeCeiling: 4, canStart: true,
};

export const deployRun = (overrides: Partial<DeploymentTestRun> = {}): DeploymentTestRun => ({
  id: 'run-1', state: 'completed', overallOutcome: 'passed', profile: descriptor.defaults,
  settings: {}, activeCeiling: 4, runtimes: [], progress: { phase: 'finalizing', completed: 3, total: 3, updatedAt: 2 },
  probes: [{ probeId: 'smoke-c', phase: 'smoke', semanticLanguage: 'c', scenario: 'ac', expectedStatus: 'AC', expectedAttribution: 'submission', observedStatus: 'AC', observedAttribution: 'submission', runtime: { language: 'c', version: '10' }, status: 'passed', attempts: [], diagnostic: 'Accepted' }],
  concurrencyResults: [], errors: [], startedAt: 1, finishedAt: 2, ...overrides,
});

export const envelope = (run: DeploymentTestRun | null = deployRun()): RunEnvelope => ({ run, draining: false });
