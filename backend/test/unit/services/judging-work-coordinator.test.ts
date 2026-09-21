import { beforeEach, describe, expect, it } from 'vitest';
import { JudgingWorkCoordinator } from '../../../src/services/judging-work-coordinator';

beforeEach(() => JudgingWorkCoordinator.reset());
describe('judging work admission', () => {
  it('makes student and deploy work mutually exclusive and release idempotent', () => {
    const student = JudgingWorkCoordinator.acquireStudent();
    expect(student).not.toBeNull();
    expect(JudgingWorkCoordinator.acquireDeploy().reason).toBe('student_judging_active');
    student?.release(); student?.release();
    const deploy = JudgingWorkCoordinator.acquireDeploy();
    expect(deploy.lease).toBeDefined();
    expect(JudgingWorkCoordinator.acquireDeploy().reason).toBe('deploy_test_active');
    expect(JudgingWorkCoordinator.acquireStudent()).toBeNull();
    deploy.lease?.release();
  });
  it('retains exclusion during draining', () => {
    const deploy = JudgingWorkCoordinator.acquireDeploy();
    JudgingWorkCoordinator.beginDraining(deploy.lease!);
    expect(JudgingWorkCoordinator.acquireStudent()).toBeNull();
    expect(JudgingWorkCoordinator.acquireDeploy().reason).toBe('deploy_test_draining');
    JudgingWorkCoordinator.endDraining();
    expect(JudgingWorkCoordinator.acquireStudent()).not.toBeNull();
  });
});

describe('rehearsal admission', () => {
  it('excludes the deploy test in both directions', () => {
    const rehearsal = JudgingWorkCoordinator.acquireRehearsal();
    expect(rehearsal.lease).toBeDefined();
    expect(JudgingWorkCoordinator.hasRehearsalWork()).toBe(true);
    expect(JudgingWorkCoordinator.acquireDeploy().reason).toBe('rehearsal_active');
    expect(JudgingWorkCoordinator.acquireRehearsal().reason).toBe('rehearsal_active');
    rehearsal.lease?.release();

    const deploy = JudgingWorkCoordinator.acquireDeploy();
    expect(deploy.lease).toBeDefined();
    expect(JudgingWorkCoordinator.acquireRehearsal().reason).toBe('deploy_test_active');
    deploy.lease?.release();
  });

  it('does NOT block student judging', () => {
    /* The rehearsal's own grading stage goes through JudgeQueueService, which
     * calls acquireStudent(). Blocking here would deadlock the rehearsal
     * against itself at the one stage it most needs to exercise.
     *
     * Safe because a rehearsal only starts on an uninitialised system with an
     * empty user table, and drives every phase transition itself — so no real
     * student can exist to compete. */
    const rehearsal = JudgingWorkCoordinator.acquireRehearsal();
    const student = JudgingWorkCoordinator.acquireStudent();
    expect(student).not.toBeNull();
    student?.release();
    rehearsal.lease?.release();
  });

  it('refuses while student judging or draining is in flight', () => {
    const student = JudgingWorkCoordinator.acquireStudent();
    expect(JudgingWorkCoordinator.acquireRehearsal().reason).toBe('student_judging_active');
    student?.release();

    const deploy = JudgingWorkCoordinator.acquireDeploy();
    JudgingWorkCoordinator.beginDraining(deploy.lease!);
    expect(JudgingWorkCoordinator.acquireRehearsal().reason).toBe('deploy_test_draining');
    JudgingWorkCoordinator.endDraining();
  });

  it('releases idempotently and clears on reset', () => {
    const rehearsal = JudgingWorkCoordinator.acquireRehearsal();
    rehearsal.lease?.release();
    rehearsal.lease?.release();
    expect(JudgingWorkCoordinator.hasRehearsalWork()).toBe(false);

    JudgingWorkCoordinator.acquireRehearsal();
    JudgingWorkCoordinator.reset();
    expect(JudgingWorkCoordinator.hasRehearsalWork()).toBe(false);
  });
});
