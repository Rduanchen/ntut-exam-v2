import { beforeEach, describe, expect, it } from 'vitest';
import { RehearsalAdmissionError, RehearsalService } from '../../../src/services/rehearsal.service';
import { RehearsalRepository } from '../../../src/services/rehearsal-repository';
import { JudgingWorkCoordinator } from '../../../src/services/judging-work-coordinator';
import { SystemSettingsService } from '../../../src/services/system-settings.service';
import { ExamState } from '../../../src/services/exam-state.service';
import { User } from '../../../src/models/user.model';
import { DEFAULT_EXAM_CONFIG } from '../../../src/constants/default-config.constant';
import { rehearsalRun } from '../../fixtures/rehearsal.fixture';

/** A clean machine: uninitialised, default paper, nobody on the roster. */
const cleanMachine = async () => {
  await SystemSettingsService.saveExamConfig(DEFAULT_EXAM_CONFIG);
  await User.destroy({ where: {} });
  RehearsalService.configureForTests({ examState: async () => ExamState.UNINITIALIZED });
};

beforeEach(cleanMachine);

describe('rehearsal admission', () => {
  it('reports that a clean machine can start', async () => {
    const descriptor = await RehearsalService.descriptor();
    expect(descriptor.canStart).toBe(true);
    expect(descriptor.blockedReason).toBeUndefined();
    expect(descriptor.stages.map((stage) => stage.id))
      .toEqual(['paper', 'enrol', 'admit', 'submit', 'grade', 'cleanup']);
  });

  it('refuses once the exam has left UNINITIALIZED', async () => {
    RehearsalService.configureForTests({ examState: async () => ExamState.INITIALIZED });
    expect((await RehearsalService.descriptor()).blockedReason).toBe('exam_initialized');
    await expect(RehearsalService.start({ acknowledgeWipe: true }))
      .rejects.toMatchObject({ status: 409, reason: 'exam_initialized' });
  });

  it('refuses when a real paper has been uploaded', async () => {
    /* A fresh deployment always has an exam_config row — initDatabase seeds a
     * default — so presence cannot be the signal. Content is: a paper with a
     * roster is somebody's work, and starting here would overwrite then erase it. */
    await SystemSettingsService.saveExamConfig({
      ...DEFAULT_EXAM_CONFIG,
      accessibleUsers: [{ id: '109590001', name: 'Alice' }],
    });
    expect((await RehearsalService.descriptor()).blockedReason).toBe('exam_data_present');
  });

  it('refuses when students already exist', async () => {
    await User.create({ testId: '109590002', name: 'Bob', ipAddress: null });
    expect((await RehearsalService.descriptor()).blockedReason).toBe('exam_data_present');
  });

  it('refuses while the deploy test holds the execution backend', async () => {
    const deploy = JudgingWorkCoordinator.acquireDeploy();
    expect((await RehearsalService.descriptor()).blockedReason).toBe('deploy_test_active');
    JudgingWorkCoordinator.beginDraining(deploy.lease!);
    expect((await RehearsalService.descriptor()).blockedReason).toBe('deploy_test_draining');
    JudgingWorkCoordinator.endDraining();
  });

  it('refuses while student judging is in flight', async () => {
    const student = JudgingWorkCoordinator.acquireStudent();
    expect((await RehearsalService.descriptor()).blockedReason).toBe('student_judging_active');
    student?.release();
  });

  it('refuses while an earlier rehearsal left residue behind', async () => {
    await RehearsalRepository.replace(rehearsalRun({ cleanupCompleted: false, overallOutcome: 'failed' }));
    const descriptor = await RehearsalService.descriptor();
    expect(descriptor.blockedReason).toBe('cleanup_pending');
    expect(descriptor.pendingCleanup).toBe(true);
    await expect(RehearsalService.start({ acknowledgeWipe: true }))
      .rejects.toMatchObject({ status: 409, reason: 'cleanup_pending' });
  });

  it('demands the wipe acknowledgement and changes nothing without it', async () => {
    await expect(RehearsalService.start({})).rejects.toBeInstanceOf(RehearsalAdmissionError);
    await expect(RehearsalService.start({ acknowledgeWipe: false }))
      .rejects.toMatchObject({ status: 400, reason: 'acknowledge_required' });
    expect(await RehearsalRepository.read()).toBeNull();
  });

  it('leaves the machine untouched when it refuses', async () => {
    const paper = { ...DEFAULT_EXAM_CONFIG, accessibleUsers: [{ id: '109590001', name: 'Alice' }] };
    await SystemSettingsService.saveExamConfig(paper);
    await expect(RehearsalService.start({ acknowledgeWipe: true })).rejects.toThrow();
    expect((await SystemSettingsService.getExamConfig()).accessibleUsers).toHaveLength(1);
    expect(await RehearsalRepository.read()).toBeNull();
  });

  it('hands back the run in flight instead of starting a second', async () => {
    await RehearsalRepository.replace(rehearsalRun({
      state: 'running', overallOutcome: undefined, finishedAt: undefined, cleanupCompleted: false,
    }));
    const envelope = await RehearsalService.start({ acknowledgeWipe: true });
    expect(envelope.alreadyRunning).toBe(true);
    expect(envelope.run?.state).toBe('running');
  });
});
