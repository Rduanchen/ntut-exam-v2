import { seedExamPhase } from '../../helpers/exam-phase';
import { ExamState } from '../../../src/services/exam-state.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';

import { ExamService } from '../../../src/services/exam.service';
import { CryptoService } from '../../../src/services/crypto.service';
import { ExamConfigCryptoService } from '../../../src/services/exam-config-crypto.service';
import { SystemSettingsService } from '../../../src/services/system-settings.service';
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

/** What every request carries. The exam key endpoint also needs a session. */
const baseBody = () => ({
  timestamp: Date.now(),
  nonce: crypto.randomBytes(16).toString('hex'),
});

const sessionBody = (aesKey: Buffer, deviceUuid = DEVICE) => ({
  ...baseBody(),
  session_token: CryptoService.generateSessionToken({ testId: 's-1', deviceUuid }, aesKey),
});

/** Prepare and store a split paper, as initialisation does. */
const seedPreparedPaper = async (overrides = {}) => {
  const config = buildExamConfig({ testTitle: 'Secure Exam', ...overrides });
  await SystemSettings.upsert({ name: 'exam_config', value: JSON.stringify(config) });

  const prepared = ExamConfigCryptoService.prepare(config);
  await SystemSettingsService.upsertSetting('exam_key', prepared.examKey);
  await SystemSettingsService.upsertSetting('exam_config_meta', prepared.meta);
  await SystemSettingsService.upsertSetting('exam_config_cipher', prepared.cipher);
  return { config, prepared };
};

describe('ExamService.getSecureConfig', () => {
  beforeEach(() => seedExamPhase(ExamState.SETUP_FINISHED));
  it('hands back the split paper, not the paper', async () => {
    const aesKey = await seedDevice();
    await seedPreparedPaper();

    const result = await ExamService.getSecureConfig(envelope(aesKey, baseBody()) as any);

    expect(result.device_uuid).toBe(DEVICE);
    const decrypted = JSON.parse(CryptoService.decryptAESGCM(result, aesKey));
    expect(decrypted.meta.testTitle).toBe('Secure Exam');
    expect(decrypted.cipher).toEqual({
      iv: expect.any(String),
      ciphertext: expect.any(String),
      tag: expect.any(String),
    });
  });

  it('carries nothing a student could read before the exam starts', async () => {
    /* The point of the whole split. This is the payload that reaches a machine
     * in INITIALIZED, with students not yet in the room. */
    const aesKey = await seedDevice();
    await seedPreparedPaper();

    const result = await ExamService.getSecureConfig(envelope(aesKey, baseBody()) as any);
    const decrypted = CryptoService.decryptAESGCM(result, aesKey);

    for (const needle of ['Two Sum', 'subtasks', 'startPassword', '"input"', '"output"']) {
      expect(decrypted).not.toContain(needle);
    }
  });

  it('does not require a session token', async () => {
    /* Delivery happens before anyone has logged in — that is the whole reason
     * to deliver early. Demanding a session would make it impossible then. */
    const aesKey = await seedDevice();
    await seedPreparedPaper();

    const result = await ExamService.getSecureConfig(envelope(aesKey, baseBody()) as any);

    expect(result.device_uuid).toBe(DEVICE);
  });

  it('throws 401 for a device that was never registered', async () => {
    const aesKey = crypto.randomBytes(32);

    await expect(
      ExamService.getSecureConfig(envelope(aesKey, baseBody(), 'ghost') as any),
    ).rejects.toThrowError(HttpError);
  });

  it('throws 400 when the payload cannot be decrypted with the stored key', async () => {
    await seedDevice();
    const wrongKey = crypto.randomBytes(32);

    try {
      await ExamService.getSecureConfig(envelope(wrongKey, baseBody()) as any);
      expect.unreachable('expected decryption to fail');
    } catch (err: any) {
      expect(err).toBeInstanceOf(HttpError);
      expect(err.statusCode).toBe(400);
    }
  });

  it('throws 400 when timestamp or nonce is missing', async () => {
    const aesKey = await seedDevice();

    try {
      await ExamService.getSecureConfig(envelope(aesKey, {}) as any);
      expect.unreachable('expected a 400');
    } catch (err: any) {
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('Invalid encrypted request');
    }
  });

  it('rejects an expired request before delivering a paper', async () => {
    const key = await seedDevice(); await seedPreparedPaper();
    await expect(ExamService.getSecureConfig(envelope(key, { ...baseBody(), timestamp: Date.now() - 3600000 }))).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects a replayed nonce on the second call', async () => {
    const aesKey = await seedDevice();
    await seedPreparedPaper();

    const body = baseBody();
    await ExamService.getSecureConfig(envelope(aesKey, body) as any);

    await expect(
      ExamService.getSecureConfig(envelope(aesKey, body) as any),
    ).rejects.toThrowError(HttpError);
  });

  it('refuses when the paper has not been prepared', async () => {
    /* Better to say so than to hand back an empty paper, which a machine would
     * treat as a real exam with no questions. */
    const aesKey = await seedDevice();
    await SystemSettings.destroy({ where: { name: 'exam_config_meta' } });
    await SystemSettings.destroy({ where: { name: 'exam_config_cipher' } });

    try {
      await ExamService.getSecureConfig(envelope(aesKey, baseBody()) as any);
      expect.unreachable('expected a 409');
    } catch (err: any) {
      expect(err.statusCode).toBe(409);
    }
  });

  it('does not accept a pre-decrypted body as a substitute for device authentication', async () => {
    const aesKey = await seedDevice();
    await seedPreparedPaper();

    await expect(ExamService.getSecureConfig({ device_uuid: DEVICE } as any, baseBody())).rejects.toThrow('Invalid encrypted request');
  });
});

describe('ExamService delivery race protection', () => {
  it.each([ExamState.UNINITIALIZED, ExamState.FINISHED])('refuses delivery in %s', async phase => {
    const key = await seedDevice(); await seedPreparedPaper(); await seedExamPhase(phase);
    await expect(ExamService.getSecureConfig(envelope(key, baseBody()))).rejects.toMatchObject({ statusCode: 409 });
  });
  it.each(['remove', 'key', 'reset'])('rejects %s while preparing a response', async action => {
    const key = await seedDevice(); await seedPreparedPaper(); await seedExamPhase(ExamState.SETUP_FINISHED);
    const original = SystemSettingsService.getPreparedPaper.bind(SystemSettingsService);
    const spy = vi.spyOn(SystemSettingsService, 'getPreparedPaper').mockImplementationOnce(async () => {
      const paper = await original();
      if (action === 'remove') await DeviceKeyMap.destroy({ where: { deviceUuid: DEVICE } });
      if (action === 'key') await DeviceKeyMap.update({ clientAesKey: crypto.randomBytes(32).toString('hex') }, { where: { deviceUuid: DEVICE } });
      if (action === 'reset') await seedExamPhase(ExamState.UNINITIALIZED);
      return paper;
    });
    await expect(ExamService.getSecureConfig(envelope(key, baseBody()))).rejects.toMatchObject({ statusCode: 409 });
    spy.mockRestore();
  });
});

describe('ExamService.getExamKey', () => {
  it('returns the key that opens the delivered paper', async () => {
    const aesKey = await seedDevice();
    const { prepared } = await seedPreparedPaper();

    const result = await ExamService.getExamKey(envelope(aesKey, sessionBody(aesKey)) as any);

    const { examKey } = JSON.parse(CryptoService.decryptAESGCM(result, aesKey));
    expect(examKey).toBe(prepared.examKey);
    expect(ExamConfigCryptoService.decryptSecret(prepared.cipher, examKey).puzzles[0].title).toBe(
      'Two Sum',
    );
  });

  it('is idempotent — a retry after a dropped connection gets the same key', async () => {
    const aesKey = await seedDevice();
    await seedPreparedPaper();

    const first = await ExamService.getExamKey(envelope(aesKey, sessionBody(aesKey)) as any);
    const second = await ExamService.getExamKey(envelope(aesKey, sessionBody(aesKey)) as any);

    expect(JSON.parse(CryptoService.decryptAESGCM(first, aesKey))).toEqual(
      JSON.parse(CryptoService.decryptAESGCM(second, aesKey)),
    );
  });

  it('requires a session token, unlike paper delivery', async () => {
    /* The paper can be delivered to a machine; the key belongs to a student
     * who has proved who they are. */
    const aesKey = await seedDevice();
    await seedPreparedPaper();

    try {
      await ExamService.getExamKey(envelope(aesKey, baseBody()) as any);
      expect.unreachable('expected a 400');
    } catch (err: any) {
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('session_token');
    }
  });

  it('throws 401 when the session token was signed for a different device', async () => {
    const aesKey = await seedDevice();
    await seedPreparedPaper();

    try {
      await ExamService.getExamKey(envelope(aesKey, sessionBody(aesKey, 'other-device')) as any);
      expect.unreachable('expected a 401');
    } catch (err: any) {
      expect(err.statusCode).toBe(401);
      expect(err.message).toContain('device UUID mismatch');
    }
  });

  it('refuses when no key exists rather than inventing one', async () => {
    const aesKey = await seedDevice();
    await seedPreparedPaper();
    await SystemSettings.destroy({ where: { name: 'exam_key' } });

    try {
      await ExamService.getExamKey(envelope(aesKey, sessionBody(aesKey)) as any);
      expect.unreachable('expected a 409');
    } catch (err: any) {
      expect(err.statusCode).toBe(409);
    }
  });

  it('throws 401 for a device that was never registered', async () => {
    const aesKey = crypto.randomBytes(32);
    await seedPreparedPaper();

    await expect(
      ExamService.getExamKey(envelope(aesKey, sessionBody(aesKey, 'ghost'), 'ghost') as any),
    ).rejects.toThrowError(HttpError);
  });
});
