import { buildExamConfig } from '../../../fixtures/exam-config.fixture';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../../src/app';
import { TestClient } from '../../../helpers/test-client';
import { seedExamPhase } from '../../../helpers/exam-phase';
import { ExamState } from '../../../../src/services/exam-state.service';
import { SystemSettingsService } from '../../../../src/services/system-settings.service';
import { DeviceKeyMap } from '../../../../src/models/device-key-map.model';

describe('registered-device exam languages', () => {
  let client: TestClient;
  beforeEach(async () => {
    await seedExamPhase(ExamState.INITIALIZED);
    await SystemSettingsService.upsertSetting('exam_config', buildExamConfig());
    client = new TestClient(createApp());
    await client.registerDevice('language-device');
  });
  it('returns only the languages of the exam without login', async () => {
    const response = await client.post('/user/exam/languages');
    expect(response.status).toBe(200);
    const body = client.decrypt<{ languages: string[] }>(response.body);
    expect(Object.keys(body)).toEqual(['languages']);
    expect(body.languages.length).toBeGreaterThan(0);
    expect(new Set(body.languages).size).toBe(body.languages.length);
  });
  it.each([ExamState.UNINITIALIZED, ExamState.FINISHED])('rejects phase %s', async phase => {
    await seedExamPhase(phase);
    expect((await client.post('/user/exam/languages')).status).toBe(409);
  });
  it('rejects missing registration and corrupted encryption', async () => {
    expect((await client.withTamperedTag().post('/user/exam/languages')).status).toBe(400);
    await DeviceKeyMap.destroy({ where: { deviceUuid: client.uuid } });
    expect((await client.post('/user/exam/languages')).status).toBe(401);
  });
  it('rejects stale and replayed requests', async () => {
    expect((await client.withSkewedTimestamp(-30).post('/user/exam/languages')).status).toBe(401);
    expect((await client.useNonce('languages-once').post('/user/exam/languages')).status).toBe(200);
    expect((await client.useNonce('languages-once').post('/user/exam/languages')).status).toBe(401);
  });
  it('does not treat missing config as no languages', async () => {
    await SystemSettingsService.upsertSetting('exam_config', null);
    expect((await client.post('/user/exam/languages')).status).toBe(409);
  });
  it.each([ExamState.SETUP_FINISHED, ExamState.IN_PROGRESS])('allows registered devices in %s without login', async phase => {
    await seedExamPhase(phase);
    expect((await client.post('/user/exam/languages')).status).toBe(200);
  });
  it('validates plaintext and envelopes even in pure mode', async () => {
    vi.stubEnv('LOAD_TEST_MODE', 'pure');
    try {
      expect((await client.postRaw('/user/exam/languages', { device_uuid: client.uuid })).status).toBe(400);
      expect((await client.post('/user/exam/languages', { nonce: '' })).status).toBe(400);
      expect((await client.post('/user/exam/languages', { timestamp: 'now' })).status).toBe(400);
    } finally { vi.unstubAllEnvs(); }
  });
  it('projects canonical unique languages and excludes every other config field', async () => {
    const config = buildExamConfig();
    const puzzle = config.sections[0].puzzles[0];
    config.sections[0].puzzles = ['Java', 'C', 'Python', 'C', 'Cpp', 'JavaScript'].map((language, index) => ({
      ...puzzle, id: String(index), language: language as typeof puzzle.language,
      title: 'SECRET-TITLE',
    }));
    await SystemSettingsService.upsertSetting('exam_config', config);
    const response = await client.post('/user/exam/languages');
    expect(client.decrypt(response.body)).toEqual({ languages: ['C', 'Cpp', 'Python', 'JavaScript', 'Java'] });
    config.sections[0].puzzles = [];
    await SystemSettingsService.upsertSetting('exam_config', config);
    const empty = await client.post('/user/exam/languages');
    expect(client.decrypt(empty.body)).toEqual({ languages: [] });
  });
  it('rejects invalid stored config instead of silently dropping unknown languages', async () => {
    const config = buildExamConfig();
    await SystemSettingsService.upsertSetting('exam_config', { ...config, sections: [{ ...config.sections[0], puzzles: [{ ...config.sections[0].puzzles[0], language: 'Rust' }] }] });
    expect((await client.post('/user/exam/languages')).status).toBe(500);
  });
  it('serves sixty concurrent requests without requiring student sessions', async () => {
    const responses = await Promise.all(Array.from({ length: 60 }, () => client.post('/user/exam/languages')));
    expect(responses.every(response => response.status === 200)).toBe(true);
    for (const response of responses) expect(client.decrypt(response.body)).toEqual({ languages: ['Python'] });
  });

  it.each(['reset', 'register'])('rejects a %s while reading the language source', async action => {
    const config = buildExamConfig();
    const spy = vi.spyOn(SystemSettingsService, 'getExamConfig').mockImplementationOnce(async () => {
      if (action === 'reset') await seedExamPhase(ExamState.UNINITIALIZED);
      else await client.registerDevice(client.uuid);
      return config;
    });
    try {
      const response = await client.post('/user/exam/languages');
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('exam_languages_unavailable');
    } finally { spy.mockRestore(); }
  });
  it('rejects using another registered UUID with the wrong key', async () => {
    const other = new TestClient(createApp());
    await other.registerDevice('another-language-device');
    expect((await client.withMismatchedDeviceUuid(other.uuid).post('/user/exam/languages')).status).toBe(400);
  });

});
