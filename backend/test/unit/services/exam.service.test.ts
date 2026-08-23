import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

import { ExamService } from '../../../src/services/exam.service';
import { CryptoService } from '../../../src/services/crypto.service';
import { DeviceKeyMap } from '../../../src/models/device-key-map.model';
import { SystemSettings } from '../../../src/models/system-settings.model';
import { HttpError } from '../../../src/utils/http-error';
import { buildExamConfig } from '../../fixtures/exam-config.fixture';
import { buildDeviceKey, buildAesKey } from '../../fixtures/identity.fixture';

const DEVICE = 'dev-exam-1';

/** Register a device and return the AES key the "client" holds. */
const seedDevice = async (deviceUuid = DEVICE) => {
  const { raw, hex } = buildAesKey();
  await DeviceKeyMap.create({ ...buildDeviceKey({ deviceUuid, clientAesKey: hex }) });
  return raw;
};

const envelope = (aesKey: Buffer, body: Record<string, unknown>, deviceUuid = DEVICE) => ({
  ...CryptoService.encryptAESGCM(JSON.stringify(body), aesKey),
  device_uuid: deviceUuid,
});

const validBody = (aesKey: Buffer, deviceUuid = DEVICE) => ({
  session_token: CryptoService.generateSessionToken({ testId: 's-1', deviceUuid }, aesKey),
  timestamp: Date.now(),
  nonce: crypto.randomBytes(16).toString('hex'),
});

describe('ExamService.getSecureConfig', () => {
  it('returns the exam config encrypted to the device key', async () => {
    const aesKey = await seedDevice();
    await SystemSettings.upsert({
      name: 'exam_config',
      value: JSON.stringify(buildExamConfig({ testTitle: 'Secure Exam' })),
    });

    const body = validBody(aesKey);
    const result = await ExamService.getSecureConfig(envelope(aesKey, body) as any);

    expect(result.device_uuid).toBe(DEVICE);
    const decrypted = JSON.parse(CryptoService.decryptAESGCM(result, aesKey));
    expect(decrypted.testTitle).toBe('Secure Exam');
  });

  it('throws 401 for a device that was never registered', async () => {
    const aesKey = crypto.randomBytes(32);

    await expect(
      ExamService.getSecureConfig(envelope(aesKey, validBody(aesKey), 'ghost') as any),
    ).rejects.toThrowError(HttpError);
  });

  it('throws 400 when the payload cannot be decrypted with the stored key', async () => {
    await seedDevice();
    const wrongKey = crypto.randomBytes(32);

    try {
      await ExamService.getSecureConfig(envelope(wrongKey, validBody(wrongKey)) as any);
      expect.unreachable('expected decryption to fail');
    } catch (err: any) {
      expect(err).toBeInstanceOf(HttpError);
      expect(err.statusCode).toBe(400);
    }
  });

  it('throws 400 when timestamp or nonce is missing', async () => {
    const aesKey = await seedDevice();
    const body = { session_token: CryptoService.generateSessionToken({ testId: 's-1', deviceUuid: DEVICE }, aesKey) };

    try {
      await ExamService.getSecureConfig(envelope(aesKey, body) as any);
      expect.unreachable('expected a 400');
    } catch (err: any) {
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('Missing timestamp or nonce');
    }
  });

  it('throws 400 when the session token is missing', async () => {
    const aesKey = await seedDevice();
    const body = { timestamp: Date.now(), nonce: crypto.randomBytes(16).toString('hex') };

    try {
      await ExamService.getSecureConfig(envelope(aesKey, body) as any);
      expect.unreachable('expected a 400');
    } catch (err: any) {
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('session_token');
    }
  });

  it('throws 401 when the session token was signed for a different device', async () => {
    const aesKey = await seedDevice();
    const body = {
      session_token: CryptoService.generateSessionToken({ testId: 's-1', deviceUuid: 'other-device' }, aesKey),
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex'),
    };

    try {
      await ExamService.getSecureConfig(envelope(aesKey, body) as any);
      expect.unreachable('expected a 401');
    } catch (err: any) {
      expect(err.statusCode).toBe(401);
      expect(err.message).toContain('device UUID mismatch');
    }
  });

  it('rejects a replayed nonce on the second call', async () => {
    const aesKey = await seedDevice();
    await SystemSettings.upsert({ name: 'exam_config', value: JSON.stringify(buildExamConfig()) });

    const body = validBody(aesKey);
    await ExamService.getSecureConfig(envelope(aesKey, body) as any);

    await expect(
      ExamService.getSecureConfig(envelope(aesKey, body) as any),
    ).rejects.toThrowError(HttpError);
  });

  it('returns an encrypted empty object when no config is stored', async () => {
    const aesKey = await seedDevice();
    await SystemSettings.destroy({ where: { name: 'exam_config' } });

    const result = await ExamService.getSecureConfig(envelope(aesKey, validBody(aesKey)) as any);

    expect(JSON.parse(CryptoService.decryptAESGCM(result, aesKey))).toEqual({});
  });

  it('skips decryption when a pre-decrypted body is supplied by the middleware', async () => {
    const aesKey = await seedDevice();
    await SystemSettings.upsert({ name: 'exam_config', value: JSON.stringify(buildExamConfig()) });

    const body = validBody(aesKey);
    const result = await ExamService.getSecureConfig({ device_uuid: DEVICE } as any, body);

    expect(JSON.parse(CryptoService.decryptAESGCM(result, aesKey)).sections).toBeDefined();
  });
});
