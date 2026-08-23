import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ExamStateService, ExamState } from '../../../src/services/exam-state.service';
import { SystemSettingsService } from '../../../src/services/system-settings.service';
import { SystemSettings } from '../../../src/models/system-settings.model';
import { Message } from '../../../src/models/message.model';
import { MessageSocketService } from '../../../src/sockets/message-socket.service';

describe('ExamStateService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(MessageSocketService, 'sendStatusUpdateNotification').mockImplementation(() => {});
  });

  describe('getCurrentState', () => {
    it('defaults to UNINITIALIZED when nothing is stored', async () => {
      expect(await ExamStateService.getCurrentState()).toBe(ExamState.UNINITIALIZED);
    });

    it('returns the stored state', async () => {
      await SystemSettingsService.createSetting('exam_state', ExamState.IN_PROGRESS);

      expect(await ExamStateService.getCurrentState()).toBe(ExamState.IN_PROGRESS);
    });

    it('falls back to UNINITIALIZED for a value outside the enum', async () => {
      await SystemSettingsService.createSetting('exam_state', 'SOMETHING_ELSE');

      expect(await ExamStateService.getCurrentState()).toBe(ExamState.UNINITIALIZED);
    });

    it('falls back to UNINITIALIZED when the stored JSON is corrupt', async () => {
      await SystemSettings.create({ name: 'exam_state', value: '{corrupt' });

      // A corrupt state must not throw — it degrades to "not initialised".
      expect(await ExamStateService.getCurrentState()).toBe(ExamState.UNINITIALIZED);
    });
  });

  describe('changeState', () => {
    it('persists the new state and broadcasts it', async () => {
      await ExamStateService.changeState(ExamState.NOT_STARTED);

      expect(await ExamStateService.getCurrentState()).toBe(ExamState.NOT_STARTED);
      expect(MessageSocketService.sendStatusUpdateNotification).toHaveBeenCalledWith(
        expect.any(Number),
        ExamState.NOT_STARTED,
      );
    });

    it('records a message for the transition', async () => {
      await Message.destroy({ where: {} });

      await ExamStateService.changeState(ExamState.NOT_STARTED);

      const messages = await Message.findAll();
      expect(messages).toHaveLength(1);
      expect(messages[0].message).toBe(ExamState.NOT_STARTED);
    });

    it('is a no-op when the state is unchanged', async () => {
      await ExamStateService.changeState(ExamState.NOT_STARTED);
      vi.clearAllMocks();
      await Message.destroy({ where: {} });

      await ExamStateService.changeState(ExamState.NOT_STARTED);

      expect(MessageSocketService.sendStatusUpdateNotification).not.toHaveBeenCalled();
      expect(await Message.count()).toBe(0);
    });

    it('closes device registration when the exam starts', async () => {
      await SystemSettingsService.setAllowDeviceRegistration(true);

      await ExamStateService.changeState(ExamState.IN_PROGRESS);

      // Once students are answering, a new device must not be able to register
      // itself without TA involvement.
      expect(await SystemSettingsService.getAllowDeviceRegistration()).toBe(false);
    });

    it('leaves device registration alone for other transitions', async () => {
      await SystemSettingsService.setAllowDeviceRegistration(true);

      await ExamStateService.changeState(ExamState.NOT_STARTED);

      expect(await SystemSettingsService.getAllowDeviceRegistration()).toBe(true);
    });

    it('updates rather than duplicates the setting on a second transition', async () => {
      await ExamStateService.changeState(ExamState.NOT_STARTED);
      await ExamStateService.changeState(ExamState.FINISHED);

      expect(await ExamStateService.getCurrentState()).toBe(ExamState.FINISHED);
      expect(await SystemSettings.count({ where: { name: 'exam_state' } })).toBe(1);
    });
  });
});
