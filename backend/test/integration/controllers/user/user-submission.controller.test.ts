import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';

import { createApp } from '../../../../src/app';
import { TestClient } from '../../../helpers/test-client';
import { buildExamConfig } from '../../../fixtures/exam-config.fixture';
import { User } from '../../../../src/models/user.model';
import { SystemSettings } from '../../../../src/models/system-settings.model';
import { CodeStorageService } from '../../../../src/services/code-storage.service';
import { SocketService } from '../../../../src/sockets/socket.service';
import { ExamState } from '../../../../src/services/exam-state.service';
import { seedExamPhase } from '../../../helpers/exam-phase';

describe('UserSubmissionController (integration)', () => {
  let app: express.Express;
  let client: TestClient;
  const studentId = '112590020';

  beforeEach(async () => {
    /* Student endpoints are phase-gated. Seed a running exam so these
     * tests exercise the endpoint rather than the gate; the gate has its
     * own tests in test/unit/middlewares/exam-phase.middleware.test.ts. */
    await seedExamPhase(ExamState.IN_PROGRESS);
    app = createApp();
    vi.restoreAllMocks();
    vi.spyOn(SocketService, 'triggerScoreUpdateEvent').mockImplementation(() => {});
    vi.spyOn(SocketService, 'triggerDataUpdateEvent').mockImplementation(() => {});

    await SystemSettings.upsert({ name: 'exam_config', value: JSON.stringify(buildExamConfig()) });
    await User.create({ testId: studentId, name: 'Submitter', ipAddress: null });

    client = new TestClient(app);
    await client.registerDevice('device-sub-1');
    await client.login(studentId);
  });

  describe('POST /user/submissions/code', () => {
    it('stores the submitted code', async () => {
      const res = await client.post('/user/submissions/code', {
        questionId: 'Q1',
        language: 'Python',
        codeContent: 'print(1 + 2)',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(await CodeStorageService.getLatestCodeAsString(studentId, 'Q1')).toBe('print(1 + 2)');
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await client.post('/user/submissions/code', { questionId: 'Q1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing required fields');
    });

    it('rejects a questionId that is not in the exam config', async () => {
      const res = await client.post('/user/submissions/code', {
        questionId: 'Q404',
        language: 'Python',
        codeContent: 'print(1)',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid questionId');
    });

    it('returns 400 for an unencrypted request', async () => {
      const res = await request(app)
        .post('/user/submissions/code')
        .send({ questionId: 'Q1', language: 'Python', codeContent: 'x' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing required cryptographic fields');
    });
  });

  describe('POST /user/submissions/score', () => {
    it('returns 400 when score is missing', async () => {
      const res = await client.post('/user/submissions/score', {});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing score');
    });

    it('accepts a submitted score', async () => {
      const res = await client.post('/user/submissions/score', {
        score: 80,
        puzzleResults: {},
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /user/submissions/codes', () => {
    it('rejects an unencrypted GET, since the route requires a session envelope', async () => {
      // The crypto middleware reads the envelope from the body, so a bare GET
      // cannot satisfy it — worth pinning, because it means this endpoint is
      // unreachable from a plain browser request.
      const res = await request(app).get('/user/submissions/codes');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing required cryptographic fields');
    });
  });
});
