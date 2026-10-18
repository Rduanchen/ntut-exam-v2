import { describe, it, expect, beforeEach, vi } from 'vitest';
import type express from 'express';

import { createApp } from '../../../../src/app';
import { TestClient } from '../../../helpers/test-client';
import { seedExamPhase, satisfyInitializePreconditions } from '../../../helpers/exam-phase';
import { ExamState } from '../../../../src/services/exam-state.service';
import { ExamConfigCryptoService } from '../../../../src/services/exam-config-crypto.service';
import { SystemSettingsService } from '../../../../src/services/system-settings.service';
import { User } from '../../../../src/models/user.model';
import { SystemSettings } from '../../../../src/models/system-settings.model';
import { buildExamConfig } from '../../../fixtures/exam-config.fixture';
import { MessageSocketService } from '../../../../src/sockets/message-socket.service';

const STUDENT = '112590009';

describe('POST /user/exam/key (integration)', () => {
  let app: express.Express;
  let client: TestClient;

  const signIn = async () => {
    client = new TestClient(app);
    await client.registerDevice('device-key-1');
    await client.login(STUDENT);
  };

  beforeEach(async () => {
    app = createApp();
    vi.restoreAllMocks();
    /* A paper with actual questions. The default config the global setup
     * inserts has no sections, so a key that opened it would prove nothing. */
    await SystemSettings.upsert({
      name: 'exam_config',
      value: JSON.stringify(buildExamConfig()),
    });
    await satisfyInitializePreconditions();
    await User.create({ testId: STUDENT, name: 'Key Holder', ipAddress: null });
    await seedExamPhase(ExamState.IN_PROGRESS);
    await signIn();
  });

  it('releases the key once the exam has started', async () => {
    const res = await client.post('/user/exam/key');

    expect(res.status).toBe(200);
    const { examKey } = client.decrypt(res.body);
    expect(examKey).toBe(await SystemSettingsService.getSetting<string>('exam_key'));
  });

  it('the released key opens the paper that was delivered', async () => {
    const paper = await client.post('/user/exam/config');
    const { cipher } = client.decrypt(paper.body);

    const keyRes = await client.post('/user/exam/key');
    const { examKey } = client.decrypt(keyRes.body);

    const secret = ExamConfigCryptoService.decryptSecret(cipher, examKey);
    expect(secret.puzzles.length).toBeGreaterThan(0);
    expect(secret.puzzles[0].subtasks.length).toBeGreaterThan(0);
  });

  it('sends less than one percent of a full paper when releasing the key', async () => {
    const config = buildExamConfig();
    const puzzle = config.sections[0].puzzles[0];
    config.sections[0].puzzles = Array.from({ length: 60 }, (_, index) => ({
      ...puzzle,
      id: `Q${index + 1}`,
      title: `Question ${index + 1}`,
    }));
    const prepared = ExamConfigCryptoService.prepare(config);
    await SystemSettingsService.upsertSetting('exam_config', config);
    await SystemSettingsService.upsertSetting('exam_key', prepared.examKey);
    await SystemSettingsService.upsertSetting('exam_config_meta', prepared.meta);
    await SystemSettingsService.upsertSetting('exam_config_cipher', prepared.cipher);

    const paper = await client.post('/user/exam/config');
    const key = await client.post('/user/exam/key');
    expect(paper.status).toBe(200);
    expect(key.status).toBe(200);
    const paperBytes = Buffer.byteLength(JSON.stringify(paper.body));
    const keyBytes = Buffer.byteLength(JSON.stringify(key.body));
    expect(keyBytes / paperBytes).toBeLessThan(0.01);
  });

  it('is refused before the exam starts', async () => {
    /* The whole reason the key exists separately. A logged-in student sitting
     * in a room where the exam has not begun must not be able to read it. */
    await seedExamPhase(ExamState.SETUP_FINISHED);

    const res = await client.post('/user/exam/key');

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'phase_not_allowed', phase: 'SETUP_FINISHED' });
  });

  it.each([ExamState.UNINITIALIZED, ExamState.INITIALIZED, ExamState.FINISHED])(
    'is refused in %s',
    async (phase) => {
      await seedExamPhase(phase);

      const res = await client.post('/user/exam/key');

      expect(res.status).toBe(409);
    },
  );

  it('does not reveal whether a key exists when refused', async () => {
    await seedExamPhase(ExamState.SETUP_FINISHED);

    const withKey = await client.post('/user/exam/key');

    await SystemSettingsService.purgeSetting('exam_key');
    const withoutKey = await client.post('/user/exam/key');

    expect(withKey.status).toBe(withoutKey.status);
    expect(withKey.body).toEqual(withoutKey.body);
  });

  it('can be retried after a dropped connection', async () => {
    const first = await client.post('/user/exam/key');
    const second = await client.post('/user/exam/key');

    expect(client.decrypt(first.body)).toEqual(client.decrypt(second.body));
  });

  it('is refused without a session token', async () => {
    const stranger = new TestClient(app);
    await stranger.registerDevice('device-key-nosession');

    const res = await stranger.post('/user/exam/key');

    expect(res.status).toBe(400);
  });
});

describe('the start-of-exam broadcast', () => {
  it('carries no key and nothing a key could be derived from', async () => {
    /* A broadcast reaches every listener without establishing who any of them
     * are. Anything on it is public to anyone who can open a socket. */
    const emitted: unknown[] = [];
    vi.spyOn(MessageSocketService, 'sendStatusUpdateNotification').mockImplementation(
      (id, state) => {
        emitted.push({ id, state });
      },
    );

    await satisfyInitializePreconditions();
    const examKey = await SystemSettingsService.getSetting<string>('exam_key');

    MessageSocketService.sendStatusUpdateNotification(1, ExamState.IN_PROGRESS);

    const serialised = JSON.stringify(emitted);
    expect(serialised).toContain(ExamState.IN_PROGRESS);
    expect(serialised).not.toContain(examKey);
    expect(serialised).not.toContain('examKey');
    expect(serialised).not.toContain('wrappedExamKey');
  });
});
