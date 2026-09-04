import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FaultAttribution, StatusCode, type PistonJudger } from 'piston-judger';
import { DeployTestService } from '../../../src/services/deploy-test.service';
import { DeployTestRepository } from '../../../src/services/deploy-test-repository';
import { ExamState } from '../../../src/services/exam-state.service';
import { accepted, executionOk } from '../../fixtures/judge-verdicts.fixture';
import type { DeploymentTestProfile } from '../../../src/types/deploy-test.type';

const runtimes = [
  { language: 'c', version: '10', aliases: ['gcc'] },
  { language: 'c++', version: '10', aliases: ['cpp', 'g++'] },
  { language: 'python', version: '3.12', aliases: ['python3'] },
];
const client: PistonJudger = { runtimes: vi.fn(async () => runtimes), execute: vi.fn(async () => executionOk()), judge: vi.fn(() => accepted()) };
const profile = (overrides: Partial<DeploymentTestProfile> = {}): DeploymentTestProfile => ({ phases: ['smoke'], languages: ['c', 'cpp', 'python'], concurrencyLevels: [1], jobCount: 1, deadlineMs: 60_000, ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  DeployTestService.configureForTests({ examState: async () => ExamState.SETUP_FINISHED, health: async () => ({ reachable: true, url: 'piston', runtimes }), client: () => client });
});

describe('deployment test lifecycle', () => {
  it('persists queued work, runs every available smoke language, and freezes a terminal report', async () => {
    const admitted = await DeployTestService.start(profile());
    expect(admitted.run?.state).toBe('queued');
    await DeployTestService.settle();
    const run = await DeployTestRepository.read();
    expect(run).toMatchObject({ state: 'completed', overallOutcome: 'passed', progress: { completed: 3, total: 3 } });
    expect(run?.probes.map((probe) => probe.semanticLanguage)).toEqual(['c', 'cpp', 'python']);
    expect(run?.runtimes.find((runtime) => runtime.semanticLanguage === 'cpp')?.language).toBe('c++');
  });
  it('marks an absent runtime blocked without suppressing available languages', async () => {
    DeployTestService.configureForTests({ health: async () => ({ reachable: true, url: 'piston', runtimes: runtimes.slice(0, 2) }), client: () => client });
    await DeployTestService.start(profile()); await DeployTestService.settle();
    const run = await DeployTestRepository.read();
    expect(run?.probes.find((probe) => probe.semanticLanguage === 'python')?.status).toBe('blocked');
    expect(run?.overallOutcome).toBe('warning');
  });
  it('refuses active exams and unreachable Piston before creating a run', async () => {
    DeployTestService.configureForTests({ examState: async () => ExamState.IN_PROGRESS });
    await expect(DeployTestService.start(profile())).rejects.toMatchObject({ status: 409, reason: 'exam_in_progress' });
    DeployTestService.configureForTests({ examState: async () => ExamState.SETUP_FINISHED, health: async () => ({ reachable: false, url: 'piston', runtimes: [], error: 'down' }) });
    await expect(DeployTestService.start(profile())).rejects.toMatchObject({ status: 503, reason: 'piston_unreachable' });
    expect(await DeployTestRepository.read()).toBeNull();
  });
  it('accounts for one hundred concurrent jobs while obeying the active ceiling', async () => {
    client.judge = vi.fn(() => ({ ...accepted(), status: StatusCode.AC, attribution: FaultAttribution.SUBMISSION }));
    await DeployTestService.start(profile({ phases: ['concurrency'], languages: ['c'], concurrencyLevels: [1, 4, 8], jobCount: 100 }));
    await DeployTestService.settle();
    const run = await DeployTestRepository.read();
    expect(run?.concurrencyResults.reduce((sum, result) => sum + result.requested, 0)).toBe(100);
    for (const result of run?.concurrencyResults ?? []) {
      expect(result.completed + result.missing + result.interrupted).toBe(result.requested);
      expect(result.observedPeakExecutionConcurrency).toBeLessThanOrEqual(run?.activeCeiling ?? 0);
    }
  });
});
