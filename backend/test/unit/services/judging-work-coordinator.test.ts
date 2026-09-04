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
