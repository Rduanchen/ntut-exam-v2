import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';

import { createApp } from '../../../../src/app';
import { adminRequest } from '../../../helpers/admin-request';
import { ExamState } from '../../../../src/services/exam-state.service';
import { SystemSettingsService } from '../../../../src/services/system-settings.service';
import { MessageSocketService } from '../../../../src/sockets/message-socket.service';
import { satisfyInitializePreconditions } from '../../../helpers/exam-phase';
import { User } from '../../../../src/models/user.model';

describe('AdminExamStateController (integration)', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = createApp();
    vi.restoreAllMocks();
    vi.spyOn(MessageSocketService, 'sendStatusUpdateNotification').mockImplementation(() => {});
    await satisfyInitializePreconditions();
  });

  describe('GET /admin/exam-state', () => {
    it('reports UNINITIALIZED before any transition', async () => {
      const res = await adminRequest(app).get('/admin/exam-state');

      expect(res.status).toBe(200);
      expect(res.body.state).toBe(ExamState.UNINITIALIZED);
    });

    it('returns 401 without an admin token', async () => {
      const res = await request(app).get('/admin/exam-state');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /admin/exam-state', () => {
    it('advances one phase', async () => {
      const res = await adminRequest(app)
        .post('/admin/exam-state')
        .send({ state: ExamState.INITIALIZED });

      expect(res.status).toBe(200);

      const after = await adminRequest(app).get('/admin/exam-state');
      expect(after.body.state).toBe(ExamState.INITIALIZED);
    });

    it('refuses to skip a phase', async () => {
      const res = await adminRequest(app)
        .post('/admin/exam-state')
        .send({ state: ExamState.IN_PROGRESS });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('invalid_transition');

      const after = await adminRequest(app).get('/admin/exam-state');
      expect(after.body.state).toBe(ExamState.UNINITIALIZED);
    });

    it('refuses to move backwards', async () => {
      await adminRequest(app).post('/admin/exam-state').send({ state: ExamState.INITIALIZED });
      await adminRequest(app).post('/admin/exam-state').send({ state: ExamState.SETUP_FINISHED });

      const res = await adminRequest(app)
        .post('/admin/exam-state')
        .send({ state: ExamState.INITIALIZED });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('invalid_transition');
    });

    it('opens registration at INITIALIZED and closes it at SETUP_FINISHED', async () => {
      await adminRequest(app).post('/admin/exam-state').send({ state: ExamState.INITIALIZED });
      expect(await SystemSettingsService.getAllowDeviceRegistration()).toBe(true);

      await adminRequest(app).post('/admin/exam-state').send({ state: ExamState.SETUP_FINISHED });
      expect(await SystemSettingsService.getAllowDeviceRegistration()).toBe(false);
    });

    it('reports the one phase an operator may move to', async () => {
      const start = await adminRequest(app).get('/admin/exam-state');
      expect(start.body.allowedNext).toEqual([ExamState.INITIALIZED]);

      for (const state of [
        ExamState.INITIALIZED,
        ExamState.SETUP_FINISHED,
        ExamState.IN_PROGRESS,
        ExamState.FINISHED,
      ]) {
        await adminRequest(app).post('/admin/exam-state').send({ state });
      }

      const end = await adminRequest(app).get('/admin/exam-state');
      expect(end.body.state).toBe(ExamState.FINISHED);
      expect(end.body.allowedNext).toEqual([]);
    });

    it('names what is missing rather than just refusing', async () => {
      /* Without this, INITIALIZED could be reached by an operator who skipped
       * initialisation, leaving a phase that claims machines may register
       * against a roster that does not exist. */
      await User.destroy({ where: {} });

      const res = await adminRequest(app)
        .post('/admin/exam-state')
        .send({ state: ExamState.INITIALIZED });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('preconditions_not_met');
      expect(res.body.missing).toContain('students');
    });

    it('returns 400 for a state outside the enum', async () => {
      const res = await adminRequest(app).post('/admin/exam-state').send({ state: 'NONSENSE' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Bad Request');
    });

    it('returns 400 when state is missing', async () => {
      const res = await adminRequest(app).post('/admin/exam-state').send({});

      expect(res.status).toBe(400);
    });
  });
});
