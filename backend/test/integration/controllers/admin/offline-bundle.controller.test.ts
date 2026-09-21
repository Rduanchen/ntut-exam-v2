import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';

import { createApp } from '../../../../src/app';
import { adminRequest } from '../../../helpers/admin-request';
import { satisfyInitializePreconditions } from '../../../helpers/exam-phase';
import { ExamConfigCryptoService } from '../../../../src/services/exam-config-crypto.service';
import { SystemSettingsService } from '../../../../src/services/system-settings.service';
import { SystemSettings } from '../../../../src/models/system-settings.model';
import { buildExamConfig } from '../../../fixtures/exam-config.fixture';

describe('GET /admin/config/offline-bundle (integration)', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = createApp();
    vi.restoreAllMocks();
    await SystemSettings.upsert({
      name: 'exam_config',
      value: JSON.stringify(buildExamConfig()),
    });
    await satisfyInitializePreconditions();
  });

  it('requires an admin token', async () => {
    const res = await request(app).get('/admin/config/offline-bundle');

    expect(res.status).toBe(401);
  });

  it('returns the same two halves the delivery endpoint sends', async () => {
    /* One shape, so a machine loading from a stick runs the same parsing path
     * as one that downloaded it. Two paths would be two chances to diverge. */
    const res = await adminRequest(app).get('/admin/config/offline-bundle');

    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual(await SystemSettingsService.getSetting('exam_config_meta'));
    expect(res.body.cipher).toEqual(await SystemSettingsService.getSetting('exam_config_cipher'));
  });

  it('carries neither the key nor the password', async () => {
    /* A lost memory stick must not be a leaked exam — which the plaintext
     * config this replaces could not promise. */
    const examKey = await SystemSettingsService.getSetting<string>('exam_key');
    const password = buildExamConfig().environmentVariables.startPassword;

    const res = await adminRequest(app).get('/admin/config/offline-bundle');
    const serialised = JSON.stringify(res.body);

    expect(serialised).not.toContain(examKey);
    expect(serialised).not.toContain(password);
    expect(serialised).not.toContain('startPassword');
  });

  it('carries no questions or test cases', async () => {
    const res = await adminRequest(app).get('/admin/config/offline-bundle');

    for (const needle of ['Two Sum', 'subtasks', '"input"', '"output"']) {
      expect(JSON.stringify(res.body.meta)).not.toContain(needle);
    }
  });

  it('opens with the invigilator password and nothing else', async () => {
    const res = await adminRequest(app).get('/admin/config/offline-bundle');

    const key = ExamConfigCryptoService.unwrapExamKey(
      res.body.meta.wrappedExamKey,
      buildExamConfig().environmentVariables.startPassword,
    );
    const secret = ExamConfigCryptoService.decryptSecret(res.body.cipher, key);

    expect(secret.puzzles[0].title).toBe('Two Sum');
    expect(() =>
      ExamConfigCryptoService.unwrapExamKey(res.body.meta.wrappedExamKey, 'guess'),
    ).toThrow();
  });

  it('refuses before the paper has been prepared', async () => {
    await SystemSettingsService.purgeSetting('exam_config_meta');
    await SystemSettingsService.purgeSetting('exam_config_cipher');

    const res = await adminRequest(app).get('/admin/config/offline-bundle');

    expect(res.status).toBe(409);
  });
});
