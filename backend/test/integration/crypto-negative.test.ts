import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import request from 'supertest';
import type express from 'express';

import { createApp } from '../../src/app';
import { TestClient } from '../helpers/test-client';
import { CryptoService } from '../../src/services/crypto.service';
import { User } from '../../src/models/user.model';
import { DeviceKeyMap } from '../../src/models/device-key-map.model';
import { SystemSettings } from '../../src/models/system-settings.model';
import { buildExamConfig } from '../fixtures/exam-config.fixture';
import { ExamState } from '../../src/services/exam-state.service';
import { seedExamPhase, satisfyInitializePreconditions } from '../helpers/exam-phase';

/**
 * The security surface the `LOAD_TEST_MODE=pure` bypass would have skipped
 * entirely. Each case corrupts exactly one element of the envelope.
 */
/* Driven through /user/exam/messages, which still carries the session-token
 * middleware. Paper delivery used to serve this purpose, but it now runs
 * before anyone has logged in and so cannot require a session — these cases
 * are about the middleware, not about that endpoint. */
describe('Crypto middleware negative cases (integration)', () => {
  let app: express.Express;
  let client: TestClient;
  const studentId = '112590030';

  beforeEach(async () => {
    /* Student endpoints are phase-gated; seed a running exam so these tests
     * reach the crypto layer they are about. */
    await seedExamPhase(ExamState.IN_PROGRESS);
    await satisfyInitializePreconditions();
    app = createApp();
    await SystemSettings.upsert({ name: 'exam_config', value: JSON.stringify(buildExamConfig()) });
    await User.create({ testId: studentId, name: 'Target', ipAddress: null });

    client = new TestClient(app);
    await client.registerDevice('device-neg-1');
    await client.login(studentId);
  });

  it('returns 400 when the envelope is missing cryptographic fields', async () => {
    const res = await request(app).post('/user/exam/messages').send({ device_uuid: 'device-neg-1' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing required cryptographic fields');
  });

  it('returns 401 when the GCM auth tag is tampered', async () => {
    const res = await client.withTamperedTag().post('/user/exam/messages');

    expect(res.status).toBe(401);
  });

  it('returns 401 when a nonce is replayed', async () => {
    const nonce = crypto.randomBytes(16).toString('hex');

    const first = await client.useNonce(nonce).post('/user/exam/messages');
    expect(first.status).toBe(200);

    const replay = await client.useNonce(nonce).post('/user/exam/messages');
    expect(replay.status).toBe(401);
  });

  it('returns 401 when the timestamp has drifted beyond the allowed window', async () => {
    const res = await client.withSkewedTimestamp(-30).post('/user/exam/messages');

    expect(res.status).toBe(401);
  });

  it('returns 401 when the session token was issued for a different device', async () => {
    // Register a second device that shares the first device's AES key, so the
    // payload decrypts cleanly and the *token/device* check is what fails.
    await DeviceKeyMap.create({
      deviceUuid: 'device-neg-2',
      ipAddress: '127.0.0.1',
      clientAesKey: client.key.toString('hex'),
      isOnline: false,
      status: 'UNBOUND',
      testId: null,
      socketId: null,
    });

    const res = await client.withMismatchedDeviceUuid('device-neg-2').post('/user/exam/messages');

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('does not match device UUID');
  });

  it('returns 401 for a device that is not registered at all', async () => {
    const aesKey = crypto.randomBytes(32);
    const envelope = CryptoService.encryptAESGCM(
      JSON.stringify({ session_token: 'x', timestamp: Date.now(), nonce: 'n' }),
      aesKey,
    );

    const res = await request(app)
      .post('/user/exam/messages')
      .send({ ...envelope, device_uuid: 'never-registered' });

    expect(res.status).toBe(401);
  });

  it('returns 400 when the decrypted body lacks session_token, timestamp, or nonce', async () => {
    const envelope = CryptoService.encryptAESGCM(JSON.stringify({ hello: 'world' }), client.key);

    const res = await request(app)
      .post('/user/exam/messages')
      .send({ ...envelope, device_uuid: client.uuid });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('missing session_token');
  });
});
