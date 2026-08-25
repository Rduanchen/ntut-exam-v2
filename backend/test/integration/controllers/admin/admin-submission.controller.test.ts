import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type express from 'express';

import { createApp } from '../../../../src/app';
import { adminRequest } from '../../../helpers/admin-request';
import { buildUser } from '../../../fixtures/identity.fixture';
import { buildExamConfig } from '../../../fixtures/exam-config.fixture';
import { User } from '../../../../src/models/user.model';
import { SystemSettings } from '../../../../src/models/system-settings.model';
import { CodeStorageService } from '../../../../src/services/code-storage.service';

describe('AdminSubmissionController (integration)', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = createApp();
    await SystemSettings.upsert({ name: 'exam_config', value: JSON.stringify(buildExamConfig()) });
    await User.create({ ...buildUser({ testId: 's-1', name: 'Alice' }) });
  });

  const seedCode = () =>
    CodeStorageService.upsertSubmission('s-1', {
      questionId: 'Q1',
      language: 'Python',
      codeContent: 'print(1)',
    } as any);

  describe('GET /admin/submissions/students', () => {
    it('lists students who have submitted', async () => {
      await seedCode();

      const res = await adminRequest(app).get('/admin/submissions/students');

      expect(res.status).toBe(200);
      expect(res.body).toContain('s-1');
    });

    it('returns 401 without an admin token', async () => {
      const res = await request(app).get('/admin/submissions/students');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /admin/submissions/:testId/code', () => {
    it('returns the stored submissions', async () => {
      await seedCode();

      const res = await adminRequest(app).get('/admin/submissions/s-1/code');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].codeContent).toBe('print(1)');
    });

    it('returns an empty list for a student who has not submitted', async () => {
      const res = await adminRequest(app).get('/admin/submissions/nobody/code');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });
  });

  describe('GET /admin/submissions/:testId/list', () => {
    it('returns the submitted question ids', async () => {
      await seedCode();

      const res = await adminRequest(app).get('/admin/submissions/s-1/list');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(['Q1']);
    });
  });

  describe('GET /admin/submissions/:testId/export', () => {
    it('streams a zip archive with the right headers', async () => {
      await seedCode();

      const res = await adminRequest(app).get('/admin/submissions/s-1/export');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('zip');
      expect(res.headers['content-disposition']).toContain('s-1_codes.zip');
    });
  });

  describe('POST /admin/submissions/:testId/code', () => {
    it('uploads code on the student\'s behalf', async () => {
      const res = await adminRequest(app)
        .post('/admin/submissions/s-1/code')
        .send({ questionId: 'Q1', language: 'Python', codeContent: 'print(42)' });

      expect(res.status).toBe(200);
      expect(await CodeStorageService.getLatestCodeAsString('s-1', 'Q1')).toBe('print(42)');
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await adminRequest(app).post('/admin/submissions/s-1/code').send({ questionId: 'Q1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing required fields');
    });

    it('rejects a questionId that is not in the exam config', async () => {
      const res = await adminRequest(app)
        .post('/admin/submissions/s-1/code')
        .send({ questionId: 'Q404', language: 'Python', codeContent: 'print(1)' });

      // Defence in depth: an admin upload must not invent a question.
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid questionId');
    });
  });

  describe('DELETE /admin/submissions/:testId/code', () => {
    it('deletes a single question when questionId is supplied', async () => {
      await seedCode();

      const res = await adminRequest(app).delete('/admin/submissions/s-1/code?questionId=Q1');

      expect(res.status).toBe(200);
      expect(await CodeStorageService.getSubmittedQuestionIds('s-1')).toHaveLength(0);
    });

    it('deletes every submission when no questionId is supplied', async () => {
      await seedCode();

      const res = await adminRequest(app).delete('/admin/submissions/s-1/code');

      expect(res.status).toBe(200);
      expect(await CodeStorageService.getSubmittedQuestionIds('s-1')).toHaveLength(0);
    });
  });
});
