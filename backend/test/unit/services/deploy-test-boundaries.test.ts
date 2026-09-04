import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FaultAttribution, StatusCode, type PistonJudger } from 'piston-judger';
import { DeployTestService } from '../../../src/services/deploy-test.service';
import { DeployTestRepository } from '../../../src/services/deploy-test-repository';
import { ExamState } from '../../../src/services/exam-state.service';
import { JudgingWorkCoordinator } from '../../../src/services/judging-work-coordinator';
import { accepted, executionOk } from '../../fixtures/judge-verdicts.fixture';
import { deployRun } from '../../fixtures/deploy-test.fixture';

const cRuntime = [{ language: 'c', version: '10', aliases: ['gcc'] }];
const healthy = async () => ({ reachable: true, url: 'piston', runtimes: cRuntime });
const profile = { phases: ['smoke'] as const, languages: ['c'] as const, concurrencyLevels: [1], jobCount: 1, deadlineMs: 60_000 };
const client = (execute: PistonJudger['execute'] = vi.fn(async () => executionOk()), judge: PistonJudger['judge'] = vi.fn(() => accepted())): PistonJudger => ({ runtimes: vi.fn(async () => cRuntime), execute, judge });

beforeEach(() => DeployTestService.configureForTests({ examState: async () => ExamState.SETUP_FINISHED, health: healthy, client: () => client() }));

describe('deploy test admission and interruption boundaries', () => {
  it.each([
    ['exam_in_progress', () => DeployTestService.configureForTests({ examState: async () => ExamState.IN_PROGRESS })],
    ['student_judging_active', () => { JudgingWorkCoordinator.acquireStudent(); }],
    ['deploy_test_active', () => { JudgingWorkCoordinator.acquireDeploy(); }],
    ['deploy_test_draining', () => { const lease = JudgingWorkCoordinator.acquireDeploy().lease!; JudgingWorkCoordinator.beginDraining(lease); }],
  ])('reports descriptor block %s', async (reason, arrange) => {
    arrange(); expect(await DeployTestService.descriptor()).toMatchObject({ canStart: false, blockedReason: reason });
  });

  it('returns a concurrently-created active run idempotently after readiness', async () => {
    const held = JudgingWorkCoordinator.acquireDeploy();
    DeployTestService.configureForTests({ health: async () => { await DeployTestRepository.replace(deployRun({ state: 'running', overallOutcome: undefined, finishedAt: undefined })); return healthy(); } });
    const result = await DeployTestService.start(profile);
    expect(result.alreadyRunning).toBe(true); held.lease?.release();
  });

  it('refuses student activity and a post-readiness exam flip without partial admission', async () => {
    const student = JudgingWorkCoordinator.acquireStudent();
    await expect(DeployTestService.start(profile)).rejects.toMatchObject({ reason: 'student_judging_active' });
    student?.release();
    let checks = 0;
    DeployTestService.configureForTests({ examState: async () => ++checks === 1 ? ExamState.SETUP_FINISHED : ExamState.IN_PROGRESS });
    await expect(DeployTestService.start(profile)).rejects.toMatchObject({ reason: 'exam_in_progress' });
  });

  it('records orchestration exceptions as a failed terminal report', async () => {
    DeployTestService.configureForTests({ client: () => { throw 'factory failed'; } });
    await DeployTestService.start(profile); await DeployTestService.settle();
    expect(await DeployTestRepository.read()).toMatchObject({ state: 'failed', overallOutcome: 'failed', errors: ['factory failed'] });
  });

  it('interrupts on an exam flip and keeps partial evidence non-successful', async () => {
    let checks = 0;
    DeployTestService.configureForTests({ examState: async () => ++checks <= 2 ? ExamState.SETUP_FINISHED : ExamState.IN_PROGRESS });
    await DeployTestService.start(profile); await DeployTestService.settle();
    expect(await DeployTestRepository.read()).toMatchObject({ state: 'interrupted', overallOutcome: 'interrupted', interruptionReason: 'exam_started' });
  });

  it('freezes at deadline, reports draining, and releases only after the real promise settles', async () => {
    let resolveExecution!: (value: ReturnType<typeof executionOk>) => void;
    let fireDeadline!: () => void;
    const execute = vi.fn(() => new Promise<ReturnType<typeof executionOk>>((resolve) => { resolveExecution = resolve; }));
    const schedule = (callback: () => void) => { fireDeadline = callback; return setTimeout(callback, 60_000); };
    DeployTestService.configureForTests({ client: () => client(execute), schedule });
    await DeployTestService.start({ ...profile, phases: ['concurrency'], concurrencyLevels: [1], jobCount: 2 });
    while (!execute.mock.calls.length) await new Promise((resolve) => setImmediate(resolve));
    fireDeadline(); await new Promise((resolve) => setImmediate(resolve));
    const frozen = await DeployTestService.latest();
    expect(frozen).toMatchObject({
      run: {
        state: 'interrupted',
        interruptionReason: 'deadline_exceeded',
        concurrencyResults: [{ requested: 2, completed: 0, missing: 0, interrupted: 2 }],
      },
      draining: true,
    });
    resolveExecution(executionOk()); await DeployTestService.settle();
    expect((await DeployTestService.latest()).draining).toBe(false);
    expect((await DeployTestService.latest()).run).toEqual(frozen.run);
  });

  it('accounts missing runtimes and execution failures in concurrency output', async () => {
    DeployTestService.configureForTests({ health: async () => ({ reachable: true, url: 'piston', runtimes: [] }) });
    await DeployTestService.start({ ...profile, phases: ['concurrency'], jobCount: 2 }); await DeployTestService.settle();
    expect((await DeployTestRepository.read())?.concurrencyResults[0].missing).toBe(2);

    const execute = vi.fn(async () => { throw new Error('sandbox down'); });
    DeployTestService.configureForTests({ health: healthy, client: () => client(execute) });
    await DeployTestService.start({ ...profile, phases: ['concurrency'], jobCount: 1 }); await DeployTestService.settle();
    expect((await DeployTestRepository.read())?.concurrencyResults[0].infrastructureFailures).toBe(1);
  });

  it('counts non-AC concurrency verdicts as infrastructure failures', async () => {
    const rejected = { ...accepted(), status: StatusCode.WA, attribution: FaultAttribution.SUBMISSION };
    DeployTestService.configureForTests({ client: () => client(undefined, vi.fn(() => rejected)) });
    await DeployTestService.start({ ...profile, phases: ['concurrency'], jobCount: 1 }); await DeployTestService.settle();
    expect((await DeployTestRepository.read())?.concurrencyResults[0].infrastructureFailures).toBe(1);
  });

  it('constructs the default Piston client when no test client override is supplied', async () => {
    DeployTestService.reset();
    expect((await DeployTestService.descriptor()).activeCeiling).toBeGreaterThan(0);
    DeployTestService.configureForTests({ health: healthy });
    await DeployTestService.start(profile); await DeployTestService.settle();
    expect((await DeployTestRepository.read())?.state).toBe('failed');
  });
});
