import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';

import { createApp } from '../../../../src/app';
import { adminRequest } from '../../../helpers/admin-request';
import { seedExamPhase } from '../../../helpers/exam-phase';
import { ExamState } from '../../../../src/services/exam-state.service';
import { User } from '../../../../src/models/user.model';
import { ScoreBoard } from '../../../../src/models/score-board.model';
import { Submission } from '../../../../src/models/submission.model';
import { DeviceKeyMap } from '../../../../src/models/device-key-map.model';
import { LoginRequest } from '../../../../src/models/login-request.model';
import { SocketService } from '../../../../src/sockets/socket.service';
import { MessageSocketService } from '../../../../src/sockets/message-socket.service';
import { buildDeviceKey, buildAesKey } from '../../../fixtures/identity.fixture';

const STUDENT = '112590050';
const DEVICE = 'device-reentry-1';

describe('POST /admin/connection/devices/:deviceUuid/re-entry (integration)', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = createApp();
    vi.restoreAllMocks();
    vi.spyOn(SocketService, 'triggerDataUpdateEvent').mockImplementation(() => {});
    vi.spyOn(MessageSocketService, 'sendForceLogout').mockImplementation(() => {});
    await seedExamPhase(ExamState.IN_PROGRESS);

    const { hex } = buildAesKey();
    await DeviceKeyMap.create({
      ...buildDeviceKey({ deviceUuid: DEVICE, clientAesKey: hex, testId: STUDENT }),
      status: 'ONLINE',
      isOnline: true,
      socketId: 'socket-1',
    });
    await User.create({ testId: STUDENT, name: 'Re-entrant', deviceUuid: DEVICE, ipAddress: null });
    await ScoreBoard.create({ testId: STUDENT, score: 72, puzzleResults: {} });
    await Submission.create({
      testId: STUDENT,
      questionId: 'Q1',
      language: 'Python',
      codeContent: 'print(1)',
    });
  });

  it('requires an admin token', async () => {
    const res = await request(app).post(`/admin/connection/devices/${DEVICE}/re-entry`);

    expect(res.status).toBe(401);
  });

  it('clears the machine identity', async () => {
    const res = await adminRequest(app).post(`/admin/connection/devices/${DEVICE}/re-entry`);

    expect(res.status).toBe(200);
    expect(await DeviceKeyMap.findOne({ where: { deviceUuid: DEVICE } })).toBeNull();
    expect((await User.findOne({ where: { testId: STUDENT } }))!.deviceUuid).toBeNull();
  });

  it('leaves the student their work', async () => {
    /* The boundary the whole re-entry idea rests on: everything keyed by the
     * device goes, everything keyed by the student stays. A student who comes
     * back — on this seat or another — finds their answers where they were. */
    await adminRequest(app).post(`/admin/connection/devices/${DEVICE}/re-entry`);

    expect((await ScoreBoard.findOne({ where: { testId: STUDENT } }))!.score).toBe(72);
    expect(await Submission.count({ where: { testId: STUDENT } })).toBe(1);
    expect(await User.count({ where: { testId: STUDENT } })).toBe(1);
  });

  it('tells the machine to sign out', async () => {
    await adminRequest(app).post(`/admin/connection/devices/${DEVICE}/re-entry`);

    expect(MessageSocketService.sendForceLogout).toHaveBeenCalledWith(
      'socket-1',
      expect.any(String),
    );
  });

  it('sends the machine back through the same gate as a restart', async () => {
    /* No separate recovery procedure to keep working. Once cleared, the machine
     * is indistinguishable from one that crashed and came back, and asks to be
     * let in the same way. */
    await adminRequest(app).post(`/admin/connection/devices/${DEVICE}/re-entry`);

    const keyRes = await request(app).get('/user/auth/rsa-public-key');
    expect(keyRes.status).toBe(200);

    // With the gate closed, the request becomes a TA decision rather than a dead end.
    const { SystemSettingsService } = await import(
      '../../../../src/services/system-settings.service'
    );
    await SystemSettingsService.setAllowDeviceRegistration(false);

    const crypto = await import('crypto');
    const encrypted = crypto
      .publicEncrypt(
        {
          key: keyRes.body.publicKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        crypto.randomBytes(32),
      )
      .toString('base64');

    const refused = await request(app)
      .post('/user/auth/register-device')
      .send({ device_uuid: DEVICE, encrypted_aes_key: encrypted });

    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('entry_pending');

    const pending = await LoginRequest.findOne({ where: { deviceUuid: DEVICE } });
    // Nothing is bound to it any more, so there is no student to name.
    expect(pending).toMatchObject({ type: 'NEW_DEVICE', status: 'PENDING' });
  });

  it('returns 404 for a machine that is not registered', async () => {
    const res = await adminRequest(app).post('/admin/connection/devices/ghost/re-entry');

    expect(res.status).toBe(404);
  });
});
