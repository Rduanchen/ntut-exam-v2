import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';

import { createApp } from '../../../../src/app';
import { adminRequest } from '../../../helpers/admin-request';
import { seedExamPhase, satisfyInitializePreconditions } from '../../../helpers/exam-phase';
import { ExamState, ExamStateService } from '../../../../src/services/exam-state.service';
import { SystemSettingsService } from '../../../../src/services/system-settings.service';
import { SystemSettings } from '../../../../src/models/system-settings.model';
import { User } from '../../../../src/models/user.model';
import { ScoreBoard } from '../../../../src/models/score-board.model';
import { Submission } from '../../../../src/models/submission.model';
import { DeviceKeyMap } from '../../../../src/models/device-key-map.model';
import { Message } from '../../../../src/models/message.model';
import { MessageSocketService } from '../../../../src/sockets/message-socket.service';
import { SocketService } from '../../../../src/sockets/socket.service';
import { buildDeviceKey, buildAesKey } from '../../../fixtures/identity.fixture';

describe('POST /admin/init/reset (integration)', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = createApp();
    vi.restoreAllMocks();
    vi.spyOn(SocketService, 'triggerDataUpdateEvent').mockImplementation(() => {});
    vi.spyOn(MessageSocketService, 'sendStatusUpdateNotification').mockImplementation(() => {});
    vi.spyOn(MessageSocketService, 'sendExamReset').mockImplementation(() => {});

    await satisfyInitializePreconditions();
    await seedExamPhase(ExamState.IN_PROGRESS);

    const { hex } = buildAesKey();
    await DeviceKeyMap.create({ ...buildDeviceKey({ deviceUuid: 'dev-1', clientAesKey: hex, testId: 's-1' }) });
    await User.create({ testId: 's-1', name: 'Student', deviceUuid: 'dev-1', ipAddress: null });
    await ScoreBoard.create({ testId: 's-1', score: 50, puzzleResults: {} });
    await Submission.create({ testId: 's-1', questionId: 'Q1', language: 'Python', codeContent: 'x' });
  });

  const reset = () =>
    adminRequest(app).post('/admin/init/reset').send({ confirm: 'RESET' });

  it('requires the confirmation string', async () => {
    const before = await User.count();

    const res = await adminRequest(app).post('/admin/init/reset').send({});

    expect(res.status).toBe(400);
    expect(await User.count()).toBe(before);
  });

  it('requires an admin token', async () => {
    const res = await request(app).post('/admin/init/reset').send({ confirm: 'RESET' });

    expect(res.status).toBe(401);
  });

  it('returns to the phase that grants nothing', async () => {
    /* From IN_PROGRESS, which the transition table has no edge out of except
     * forwards. Reset is the one channel that may move backwards. */
    await reset();

    expect(await ExamStateService.getCurrentState()).toBe(ExamState.UNINITIALIZED);
  });

  it('leaves nothing behind that could open the previous paper', async () => {
    await reset();

    expect(await SystemSettingsService.getSetting('exam_key')).toBeNull();
    expect(await SystemSettingsService.getSetting('exam_config_cipher')).toBeNull();
    expect(await SystemSettingsService.getSetting('exam_config_meta')).toBeNull();
  });

  it('clears the exam data', async () => {
    await reset();

    expect(await User.count()).toBe(0);
    expect(await ScoreBoard.count()).toBe(0);
    expect(await Submission.count()).toBe(0);
    expect(await DeviceKeyMap.count()).toBe(0);
  });

  it('closes registration on the way out', async () => {
    await SystemSettingsService.setAllowDeviceRegistration(true);

    await reset();

    expect(await SystemSettingsService.getAllowDeviceRegistration()).toBe(false);
  });

  it('announces itself on its own channel', async () => {
    /* What a machine must do here is nothing like a phase change: forget its
     * identity, its key and its paper. Carrying that on the status channel
     * would put a destructive operation inside ordinary message handling. */
    await reset();

    expect(MessageSocketService.sendExamReset).toHaveBeenCalledOnce();
    expect(MessageSocketService.sendStatusUpdateNotification).not.toHaveBeenCalled();
  });

  it('writes no message describing itself', async () => {
    // Reset empties the message table first, so such a row would be deleted
    // by the same operation that wrote it.
    await Message.create({ type: 'EXAM', message: 'earlier' } as any);

    await reset();

    expect(await Message.count()).toBe(0);
  });

  it('leaves the deployment able to run another exam', async () => {
    /* The point of reset. Previously a machine kept a key the server had
     * forgotten, every request afterwards was refused, and there was no path
     * back — so reset was unusable in practice. */
    await reset();

    expect(await ExamStateService.getAllowedNext()).toEqual([ExamState.INITIALIZED]);

    await SystemSettings.upsert({
      name: 'exam_config',
      value: (await SystemSettings.findOne({ where: { name: 'exam_config' } }))?.value ?? '{}',
    });
    await satisfyInitializePreconditions();

    const res = await adminRequest(app)
      .post('/admin/exam-state')
      .send({ state: ExamState.INITIALIZED });

    expect(res.status).toBe(200);
  });
});
