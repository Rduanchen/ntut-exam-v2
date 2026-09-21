import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RehearsalStartupService } from '../../../src/services/rehearsal-startup.service';
import { RehearsalRepository } from '../../../src/services/rehearsal-repository';
import { InitService } from '../../../src/services/init.service';
import { User } from '../../../src/models/user.model';
import { ScoreBoard } from '../../../src/models/score-board.model';
import { ExamStateService, ExamState } from '../../../src/services/exam-state.service';
import { SystemSettingsService } from '../../../src/services/system-settings.service';
import { rehearsalRun } from '../../fixtures/rehearsal.fixture';

beforeEach(() => vi.restoreAllMocks());

describe('recovering from a killed rehearsal', () => {
  it('does nothing when the last rehearsal finished', async () => {
    await RehearsalRepository.replace(rehearsalRun());
    const wipe = vi.spyOn(InitService, 'wipeAllData');
    await RehearsalStartupService.run();
    expect(wipe).not.toHaveBeenCalled();
    expect((await RehearsalRepository.read())?.state).toBe('completed');
  });

  it('does nothing when no rehearsal has ever run', async () => {
    const wipe = vi.spyOn(InitService, 'wipeAllData');
    await RehearsalStartupService.run();
    expect(wipe).not.toHaveBeenCalled();
  });

  it('erases the half-built exam a killed rehearsal left behind', async () => {
    /* The machine as a crash leaves it: a roster, a scoreboard and a phase
     * past UNINITIALIZED, with a run record claiming ownership. */
    await User.create({ testId: '__rehearsal__', name: 'Rehearsal Student', ipAddress: null });
    await ScoreBoard.create({ testId: '__rehearsal__', score: 0, puzzleResults: {} });
    await SystemSettingsService.upsertSetting('exam_key', 'abc');
    await ExamStateService.resetToUninitialized();
    await SystemSettingsService.upsertSetting('exam_state', ExamState.IN_PROGRESS);

    await RehearsalRepository.replace(rehearsalRun({
      state: 'running',
      overallOutcome: undefined,
      finishedAt: undefined,
      cleanupCompleted: false,
      currentStage: 'submit',
      ownsSystemState: true,
    }));

    await RehearsalStartupService.run(999);

    expect(await User.count()).toBe(0);
    expect(await SystemSettingsService.getSetting('exam_key')).toBeNull();
    expect(await ExamStateService.getCurrentState()).toBe(ExamState.UNINITIALIZED);

    const run = await RehearsalRepository.read();
    expect(run?.state).toBe('interrupted');
    expect(run?.interruptionReason).toBe('process_restart');
    expect(run?.cleanupCompleted).toBe(true);
    expect(run?.finishedAt).toBe(999);
    expect(run?.currentStage).toBeUndefined();
  });

  it('closes out the stages so the report is readable', async () => {
    await RehearsalRepository.replace(rehearsalRun({
      state: 'running',
      overallOutcome: undefined,
      finishedAt: undefined,
      cleanupCompleted: false,
      stages: [
        { id: 'paper', status: 'passed', timeoutMs: 1, checks: [] },
        { id: 'enrol', status: 'running', timeoutMs: 1, checks: [] },
        { id: 'admit', status: 'pending', timeoutMs: 1, checks: [] },
        { id: 'submit', status: 'pending', timeoutMs: 1, checks: [] },
        { id: 'grade', status: 'pending', timeoutMs: 1, checks: [] },
        { id: 'cleanup', status: 'pending', timeoutMs: 1, checks: [] },
      ],
    }));

    await RehearsalStartupService.run();

    const stages = (await RehearsalRepository.read())!.stages;
    expect(stages.map((stage) => stage.status)).toEqual(['passed', 'failed', 'skipped', 'skipped', 'skipped', 'skipped']);
  });

  it('leaves the machine marked dirty when the wipe fails', async () => {
    vi.spyOn(InitService, 'wipeAllData').mockRejectedValue(new Error('disk on fire'));
    await RehearsalRepository.replace(rehearsalRun({
      state: 'running', overallOutcome: undefined, finishedAt: undefined, cleanupCompleted: false,
    }));

    await RehearsalStartupService.run();

    const run = await RehearsalRepository.read();
    expect(run?.cleanupCompleted).toBe(false);
    expect(run?.cleanupError).toContain('disk on fire');
  });

  it('does not wipe a run that never claimed ownership', async () => {
    /* The safety property this whole service rests on: only a run that wrote
     * `ownsSystemState` before its first mutation may cause a boot-time wipe. */
    const wipe = vi.spyOn(InitService, 'wipeAllData');
    await RehearsalRepository.replace(rehearsalRun({
      state: 'queued', overallOutcome: undefined, finishedAt: undefined,
      cleanupCompleted: false, ownsSystemState: false,
    }));

    await RehearsalStartupService.run();

    expect(wipe).not.toHaveBeenCalled();
    expect((await RehearsalRepository.read())?.cleanupCompleted).toBe(true);
  });
});
