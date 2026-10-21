import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';

import { createApp } from '../../../../src/app';
import { adminRequest } from '../../../helpers/admin-request';
import { buildExamConfig, cloneExamConfig } from '../../../fixtures/exam-config.fixture';
import { SystemSettings } from '../../../../src/models/system-settings.model';
import { User } from '../../../../src/models/user.model';
import { ScoreBoard } from '../../../../src/models/score-board.model';
import { MessageSocketService } from '../../../../src/sockets/message-socket.service';
import { SystemSettingsService } from '../../../../src/services/system-settings.service';
import { ExamConfigCryptoService } from '../../../../src/services/exam-config-crypto.service';

/**
 * Covers both `admin-config.route.ts` (3 endpoints) and `admin-init.route.ts`
 * (3 endpoints) — the init routes dispatch to this same controller.
 */
describe('ExamConfigController (integration)', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = createApp();
    vi.restoreAllMocks();
    vi.spyOn(MessageSocketService, 'sendStatusUpdateNotification').mockImplementation(() => {});
    await SystemSettings.destroy({ where: {} });
  });

  describe('POST /admin/config', () => {
    it('saves a valid configuration', async () => {
      const res = await adminRequest(app).post('/admin/config').send(buildExamConfig());

      expect(res.status).toBe(200);
      expect(res.body.testTitle).toBe('NTUT Midterm Exam');
    });

    it('returns 400 for a configuration missing startPassword', async () => {
      const invalid = cloneExamConfig(buildExamConfig());
      delete (invalid as any).environmentVariables;

      const res = await adminRequest(app).post('/admin/config').send(invalid);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('environmentVariables');
    });

    it('returns 401 without an admin token', async () => {
      const res = await request(app).post('/admin/config').send(buildExamConfig());

      expect(res.status).toBe(401);
    });
  });

  describe('GET /admin/config', () => {
    it('returns 404 when no configuration has been saved', async () => {
      const res = await adminRequest(app).get('/admin/config');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('CONFIG_NOT_INITIALIZED');
    });

    it('returns the saved configuration', async () => {
      await adminRequest(app).post('/admin/config').send(buildExamConfig());

      const res = await adminRequest(app).get('/admin/config');

      expect(res.status).toBe(200);
      expect(res.body.sections[0].puzzles[0].id).toBe('Q1');
    });
  });

  describe('PUT /admin/config', () => {
    it('updates a configuration before initialization', async () => {
      await adminRequest(app).post('/admin/config').send(buildExamConfig());

      const updated = cloneExamConfig(buildExamConfig());
      updated.testTitle = 'Renamed Exam';

      const res = await adminRequest(app).put('/admin/config').send(updated);

      expect(res.status).toBe(200);
      expect(res.body.testTitle).toBe('Renamed Exam');
    });

    it('rejects a structural change once the database is initialized', async () => {
      await adminRequest(app).post('/admin/config').send(buildExamConfig());
      await adminRequest(app).post('/admin/init');

      const updated = cloneExamConfig(buildExamConfig());
      updated.sections[0].puzzles[0].subtasks[0].visible.push({ input: '9 9', output: '18' });

      const res = await adminRequest(app).put('/admin/config').send(updated);

      expect(res.status).toBe(400);
    });

    it('publishes an updated paper with the original exam key after initialization', async () => {
      await adminRequest(app).post('/admin/config').send(buildExamConfig());
      await adminRequest(app).post('/admin/init');
      const examKey = await SystemSettingsService.getSetting<string>('exam_key');
      const originalBundle = await adminRequest(app).get('/admin/config/offline-bundle');

      const updated = cloneExamConfig(buildExamConfig());
      updated.sections[0].puzzles[0].subtasks[0].hidden[0].output = 'new answer';
      updated.environmentVariables.EXTRA_FLAG = 'new value';
      const res = await adminRequest(app).put('/admin/config').send(updated);

      expect(res.status).toBe(200);
      expect(res.body.environmentVariables.EXTRA_FLAG).toBe('new value');
      expect(await SystemSettingsService.getSetting('exam_key')).toBe(examKey);
      const bundle = await adminRequest(app).get('/admin/config/offline-bundle');
      expect(bundle.body.meta.wrappedExamKey).toEqual(originalBundle.body.meta.wrappedExamKey);
      const secret = ExamConfigCryptoService.decryptSecret(bundle.body.cipher, examKey!);
      expect(secret.puzzles[0].subtasks[0].hidden[0].output).toBe('new answer');
    });
  });

  describe('GET /admin/init/init-status', () => {
    it('reports an uninitialized system', async () => {
      const res = await adminRequest(app).get('/admin/init/init-status');

      expect(res.status).toBe(200);
      expect(res.body.hasConfig).toBe(false);
      expect(res.body.isInitialized).toBe(false);
    });

    it('reports hasConfig once a configuration is saved', async () => {
      await adminRequest(app).post('/admin/config').send(buildExamConfig());

      const res = await adminRequest(app).get('/admin/init/init-status');

      expect(res.body.hasConfig).toBe(true);
    });
  });

  describe('POST /admin/init', () => {
    it('creates users and scoreboards from the configuration', async () => {
      await adminRequest(app).post('/admin/config').send(buildExamConfig());

      const res = await adminRequest(app).post('/admin/init');

      expect(res.status).toBe(200);
      expect(await User.count()).toBe(2);
      expect(await ScoreBoard.count()).toBe(2);
    });

    it('returns 409 when the database is already initialized', async () => {
      await adminRequest(app).post('/admin/config').send(buildExamConfig());
      await adminRequest(app).post('/admin/init');

      const res = await adminRequest(app).post('/admin/init');

      expect(res.status).toBe(409);
    });
  });

  describe('POST /admin/init/reset', () => {
    it('requires the RESET confirmation string', async () => {
      const res = await adminRequest(app).post('/admin/init/reset').send({ confirm: 'nope' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('RESET');
    });

    it('wipes all data when confirmed', async () => {
      await adminRequest(app).post('/admin/config').send(buildExamConfig());
      await adminRequest(app).post('/admin/init');

      const res = await adminRequest(app).post('/admin/init/reset').send({ confirm: 'RESET' });

      expect(res.status).toBe(200);
      expect(await User.count()).toBe(0);
      expect(await ScoreBoard.count()).toBe(0);
    });
  });
});
