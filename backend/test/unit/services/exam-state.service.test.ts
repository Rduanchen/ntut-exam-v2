import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  ExamStateService,
  ExamState,
  DEFAULT_SUBMIT_GRACE_SECONDS,
} from '../../../src/services/exam-state.service';
import { SystemSettingsService } from '../../../src/services/system-settings.service';
import { SystemSettings } from '../../../src/models/system-settings.model';
import { Message } from '../../../src/models/message.model';
import { MessageSocketService } from '../../../src/sockets/message-socket.service';
import { satisfyInitializePreconditions } from '../../helpers/exam-phase';

/** The only forward step allowed from each phase. FINISHED is terminal. */
const FORWARD: Array<[ExamState, ExamState]> = [
  [ExamState.UNINITIALIZED, ExamState.INITIALIZED],
  [ExamState.INITIALIZED, ExamState.SETUP_FINISHED],
  [ExamState.SETUP_FINISHED, ExamState.IN_PROGRESS],
  [ExamState.IN_PROGRESS, ExamState.FINISHED],
];

const ALL_PHASES = Object.values(ExamState);

/** Put the stored phase at `phase` without going through changeState. */
async function seedPhase(phase: ExamState): Promise<void> {
  await SystemSettings.destroy({ where: { name: 'exam_state' } });
  await SystemSettingsService.createSetting('exam_state', phase);
}

describe('ExamStateService', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(MessageSocketService, 'sendStatusUpdateNotification').mockImplementation(() => {});
    /* INITIALIZED cannot be reached without a roster — that is what stops it
     * being reached by skipping initialisation. Tests about the table itself
     * should not be about that check. */
    await satisfyInitializePreconditions();
  });

  describe('getCurrentState', () => {
    it('defaults to UNINITIALIZED when nothing is stored', async () => {
      expect(await ExamStateService.getCurrentState()).toBe(ExamState.UNINITIALIZED);
    });

    it('returns the stored state', async () => {
      await seedPhase(ExamState.IN_PROGRESS);

      expect(await ExamStateService.getCurrentState()).toBe(ExamState.IN_PROGRESS);
    });

    it('falls back to UNINITIALIZED for a value outside the enum', async () => {
      await SystemSettingsService.createSetting('exam_state', 'SOMETHING_ELSE');

      expect(await ExamStateService.getCurrentState()).toBe(ExamState.UNINITIALIZED);
    });

    it('falls back to UNINITIALIZED for the retired NOT_STARTED value', async () => {
      // A database written by the pre-007 backend must not resolve to a phase.
      // Degrading to "not initialised" is the safe reading: it grants nothing.
      await SystemSettingsService.createSetting('exam_state', 'NOT_STARTED');

      expect(await ExamStateService.getCurrentState()).toBe(ExamState.UNINITIALIZED);
    });

    it('falls back to UNINITIALIZED when the stored JSON is corrupt', async () => {
      await SystemSettings.create({ name: 'exam_state', value: '{corrupt' });

      expect(await ExamStateService.getCurrentState()).toBe(ExamState.UNINITIALIZED);
    });
  });

  describe('getAllowedNext', () => {
    it.each(FORWARD)('offers exactly %s → %s', async (from, to) => {
      await seedPhase(from);

      expect(await ExamStateService.getAllowedNext()).toEqual([to]);
    });

    it('offers nothing from FINISHED', async () => {
      await seedPhase(ExamState.FINISHED);

      expect(await ExamStateService.getAllowedNext()).toEqual([]);
    });
  });

  describe('changeState — the transition table', () => {
    /* The full 5x5 grid. Four combinations are legal; the remaining twenty-one
     * must be refused, including every same-phase transition. Enumerating all
     * of them is the point: a table that only tests its own happy path proves
     * nothing about what it forbids. */
    const legal = new Set(FORWARD.map(([from, to]) => `${from}->${to}`));

    for (const from of ALL_PHASES) {
      for (const to of ALL_PHASES) {
        const isLegal = legal.has(`${from}->${to}`);

        it(`${isLegal ? 'allows' : 'refuses'} ${from} → ${to}`, async () => {
          await seedPhase(from);

          if (isLegal) {
            await ExamStateService.changeState(to);
            expect(await ExamStateService.getCurrentState()).toBe(to);
          } else {
            await expect(ExamStateService.changeState(to)).rejects.toMatchObject({
              statusCode: 400,
              code: 'invalid_transition',
            });
            expect(await ExamStateService.getCurrentState()).toBe(from);
          }
        });
      }
    }
  });

  describe('changeState — effects', () => {
    it('persists the new state and broadcasts it', async () => {
      await ExamStateService.changeState(ExamState.INITIALIZED);

      expect(await ExamStateService.getCurrentState()).toBe(ExamState.INITIALIZED);
      expect(MessageSocketService.sendStatusUpdateNotification).toHaveBeenCalledWith(
        expect.any(Number),
        ExamState.INITIALIZED,
      );
    });

    it('records a message for the transition', async () => {
      await Message.destroy({ where: {} });

      await ExamStateService.changeState(ExamState.INITIALIZED);

      const messages = await Message.findAll();
      expect(messages).toHaveLength(1);
      expect(messages[0].message).toBe(ExamState.INITIALIZED);
    });

    it('stamps the time of the transition', async () => {
      const before = Date.now();

      await ExamStateService.changeState(ExamState.INITIALIZED);

      const at = await ExamStateService.getStateChangedAt();
      expect(at).not.toBeNull();
      expect(at!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    });

    it('opens device registration when the machines are set up', async () => {
      await SystemSettingsService.setAllowDeviceRegistration(false);

      await ExamStateService.changeState(ExamState.INITIALIZED);

      expect(await SystemSettingsService.getAllowDeviceRegistration()).toBe(true);
    });

    it('closes device registration before students arrive, not when the exam starts', async () => {
      /* The window this closes is the one students walk in during. Leaving it
       * open until IN_PROGRESS — as it used to be — meant an unattended machine
       * could register itself with nobody watching. */
      await seedPhase(ExamState.INITIALIZED);
      await SystemSettingsService.setAllowDeviceRegistration(true);

      await ExamStateService.changeState(ExamState.SETUP_FINISHED);

      expect(await SystemSettingsService.getAllowDeviceRegistration()).toBe(false);
    });

    it('leaves registration closed when the exam starts', async () => {
      await seedPhase(ExamState.SETUP_FINISHED);
      await SystemSettingsService.setAllowDeviceRegistration(false);

      await ExamStateService.changeState(ExamState.IN_PROGRESS);

      expect(await SystemSettingsService.getAllowDeviceRegistration()).toBe(false);
    });

    it('updates rather than duplicates the setting across transitions', async () => {
      await ExamStateService.changeState(ExamState.INITIALIZED);
      await ExamStateService.changeState(ExamState.SETUP_FINISHED);

      expect(await SystemSettings.count({ where: { name: 'exam_state' } })).toBe(1);
    });
  });

  describe('resetToUninitialized', () => {
    /* Reset is not a transition. It is the one channel that may move the phase
     * backwards, and it must be reachable from anywhere — including FINISHED,
     * which the transition table treats as terminal. */
    it.each(ALL_PHASES)('returns to UNINITIALIZED from %s', async (from) => {
      await seedPhase(from);

      await ExamStateService.resetToUninitialized();

      expect(await ExamStateService.getCurrentState()).toBe(ExamState.UNINITIALIZED);
    });

    it('closes device registration', async () => {
      await seedPhase(ExamState.IN_PROGRESS);
      await SystemSettingsService.setAllowDeviceRegistration(true);

      await ExamStateService.resetToUninitialized();

      expect(await SystemSettingsService.getAllowDeviceRegistration()).toBe(false);
    });
  });

  describe('submit grace window', () => {
    it('is closed while the exam is still running', async () => {
      await seedPhase(ExamState.IN_PROGRESS);

      expect(await ExamStateService.isWithinSubmitGrace()).toBe(false);
    });

    it('is open immediately after the exam finishes', async () => {
      await seedPhase(ExamState.IN_PROGRESS);
      await ExamStateService.changeState(ExamState.FINISHED);

      expect(await ExamStateService.isWithinSubmitGrace()).toBe(true);
    });

    it('closes once the window has elapsed', async () => {
      await seedPhase(ExamState.IN_PROGRESS);
      await ExamStateService.changeState(ExamState.FINISHED);

      const elapsed = (DEFAULT_SUBMIT_GRACE_SECONDS + 1) * 1000;
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + elapsed);

      expect(await ExamStateService.isWithinSubmitGrace()).toBe(false);
    });

    it('reads the window length from the exam config when present', async () => {
      const config = await SystemSettingsService.getExamConfig();
      await SystemSettingsService.updateSetting('exam_config', {
        ...(config as object),
        submitGraceSeconds: 5,
      });

      expect(await ExamStateService.getSubmitGraceSeconds()).toBe(5);
    });

    it('falls back to the default when the config omits it', async () => {
      expect(await ExamStateService.getSubmitGraceSeconds()).toBe(DEFAULT_SUBMIT_GRACE_SECONDS);
    });

    it('is closed when the phase has never been stamped', async () => {
      // A FINISHED phase with no timestamp cannot be shown to be inside the
      // window, so the window is closed. Erring open would keep submissions
      // accepted indefinitely.
      await seedPhase(ExamState.FINISHED);

      expect(await ExamStateService.isWithinSubmitGrace()).toBe(false);
    });
  });
});
