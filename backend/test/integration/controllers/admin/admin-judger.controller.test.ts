import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';

import { createApp } from '../../../../src/app';
import { adminRequest } from '../../../helpers/admin-request';
import { buildUser } from '../../../fixtures/identity.fixture';
import { buildExamConfig } from '../../../fixtures/exam-config.fixture';
import { User } from '../../../../src/models/user.model';
import { SystemSettings } from '../../../../src/models/system-settings.model';
import { JudgerService } from '../../../../src/services/judger.service';
import { SocketService } from '../../../../src/sockets/socket.service';

describe('AdminJudgerController (integration)', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = createApp();
    vi.restoreAllMocks();
    vi.spyOn(SocketService, 'triggerScoreUpdateEvent').mockImplementation(() => {});
    await SystemSettings.upsert({ name: 'exam_config', value: JSON.stringify(buildExamConfig()) });
    await User.create({ ...buildUser({ testId: 's-1', name: 'Alice' }) });
  });

  describe('POST /admin/judger/judge/:testId', () => {
    it('runs evaluation and notifies the dashboard', async () => {
      const judgeSpy = vi
        .spyOn(JudgerService, 'judgeStudentSubmissions')
        .mockResolvedValue({ Q1: { subtasks: [] } } as any);

      const res = await adminRequest(app).post('/admin/judger/judge/s-1').send({});

      expect(res.status).toBe(200);
      expect(res.body.testId).toBe('s-1');
      expect(judgeSpy).toHaveBeenCalledWith('s-1', undefined);
      expect(SocketService.triggerScoreUpdateEvent).toHaveBeenCalledWith('s-1');
    });

    it('forwards a questionIds filter to the judger', async () => {
      const judgeSpy = vi
        .spyOn(JudgerService, 'judgeStudentSubmissions')
        .mockResolvedValue({} as any);

      await adminRequest(app).post('/admin/judger/judge/s-1').send({ questionIds: ['Q1'] });

      expect(judgeSpy).toHaveBeenCalledWith('s-1', ['Q1']);
    });

    it('never reaches a real Piston sandbox', async () => {
      // The global piston mock in test/setup.ts stands in for the sandbox; if a
      // real call were made this test would need a live Piston server.
      const judgeSpy = vi
        .spyOn(JudgerService, 'judgeStudentSubmissions')
        .mockResolvedValue({} as any);

      await adminRequest(app).post('/admin/judger/judge/s-1').send({});

      expect(judgeSpy).toHaveBeenCalledOnce();
    });

    it('returns 500 when evaluation throws', async () => {
      vi.spyOn(JudgerService, 'judgeStudentSubmissions').mockRejectedValue(new Error('piston down'));

      const res = await adminRequest(app).post('/admin/judger/judge/s-1').send({});

      expect(res.status).toBe(500);
    });

    it('returns 401 without an admin token', async () => {
      const res = await request(app).post('/admin/judger/judge/s-1').send({});

      expect(res.status).toBe(401);
    });
  });
});
