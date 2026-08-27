import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type express from 'express';

import { createApp } from '../../../../src/app';
import { adminRequest } from '../../../helpers/admin-request';
import { buildUser } from '../../../fixtures/identity.fixture';
import { buildExamConfig } from '../../../fixtures/exam-config.fixture';
import { User } from '../../../../src/models/user.model';
import { SystemSettings } from '../../../../src/models/system-settings.model';
import { JudgerService } from '../../../../src/services/judger.service';
import { SocketService } from '../../../../src/sockets/socket.service';
import { JudgeQueueService } from '../../../../src/services/judge-queue.service';

describe('AdminJudgerController (integration)', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = createApp();
    vi.restoreAllMocks();
    vi.spyOn(SocketService, 'triggerScoreUpdateEvent').mockImplementation(() => {});
    await SystemSettings.upsert({ name: 'exam_config', value: JSON.stringify(buildExamConfig()) });
    await User.create({ ...buildUser({ testId: 's-1', name: 'Alice' }) });
    JudgeQueueService.reset();
  });

  afterEach(() => JudgeQueueService.settle());

  describe('POST /admin/judger/judge/:testId', () => {
    // Wait for real quiescence, not a guessed number of ticks.
    const settle = () => JudgeQueueService.settle();

    it('accepts the request and returns a handle without waiting for the run', async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      vi.spyOn(JudgerService, 'judgeStudentSubmissions').mockImplementation(async () => {
        await gate;
        return { results: {}, graded: 2, systemFailures: 1 } as never;
      });

      const res = await adminRequest(app).post('/admin/judger/judge/s-1');

      // Responded while judging is still blocked -- this is the assertion that
      // would fail if the endpoint were still synchronous.
      expect(res.status).toBe(202);
      expect(res.body.jobId).toBeTruthy();
      expect(res.body).not.toHaveProperty('results');

      release();
      await settle();
    });

    it('reports the outcome, counting system failures separately', async () => {
      vi.spyOn(JudgerService, 'judgeStudentSubmissions').mockResolvedValue({
        results: {}, graded: 4, systemFailures: 2,
      } as never);

      const accepted = await adminRequest(app).post('/admin/judger/judge/s-1');
      await settle();

      const job = await adminRequest(app).get(`/admin/judger/jobs/${accepted.body.jobId}`);

      expect(job.status).toBe(200);
      expect(job.body.state).toBe('finished');
      expect(job.body.outcome).toEqual({ graded: 4, systemFailures: 2 });
    });

    it('notifies the dashboard only once the background run completes', async () => {
      const notify = vi.spyOn(SocketService, 'triggerScoreUpdateEvent');
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      vi.spyOn(JudgerService, 'judgeStudentSubmissions').mockImplementation(async () => {
        await gate;
        return { results: {}, graded: 1, systemFailures: 0 } as never;
      });

      const res = await adminRequest(app).post('/admin/judger/judge/s-1');

      // Responded, and the run has not finished, so nothing has been announced.
      expect(res.status).toBe(202);
      expect(notify).not.toHaveBeenCalled();

      release();
      await settle();
      expect(notify).toHaveBeenCalledWith('s-1');
    });

    it('returns the existing handle when the student is already being judged', async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const spy = vi
        .spyOn(JudgerService, 'judgeStudentSubmissions')
        .mockImplementation(async () => {
          await gate;
          return { results: {}, graded: 0, systemFailures: 0 } as never;
        });

      const first = await adminRequest(app).post('/admin/judger/judge/s-1');
      const second = await adminRequest(app).post('/admin/judger/judge/s-1');

      expect(second.body.jobId).toBe(first.body.jobId);
      expect(spy).toHaveBeenCalledTimes(1);

      release();
      await settle();
    });

    it('reports a broken run as failed rather than leaving it open', async () => {
      vi.spyOn(JudgerService, 'judgeStudentSubmissions').mockRejectedValue(
        new Error('config missing'),
      );

      const accepted = await adminRequest(app).post('/admin/judger/judge/s-1');
      await settle();

      const job = await adminRequest(app).get(`/admin/judger/jobs/${accepted.body.jobId}`);
      expect(job.body.state).toBe('failed');
      expect(job.body.error).toContain('config missing');
    });

    it('rejects a request with no student', async () => {
      const res = await adminRequest(app).post('/admin/judger/judge/');
      expect(res.status).toBe(404); // no route without the parameter
    });
  });

  describe('POST /admin/judger/rejudge', () => {
    // Wait for real quiescence, not a guessed number of ticks.
    const settle = () => JudgeQueueService.settle();

    it('exists at all', async () => {
      // The TA-facing action has been posting here since before the route was
      // mounted; the 404 was swallowed, so the button silently did nothing.
      vi.spyOn(JudgerService, 'judgeStudentSubmissions').mockResolvedValue({
        results: {}, graded: 1, systemFailures: 0,
      } as never);

      const res = await adminRequest(app).post('/admin/judger/rejudge').send({ testId: 's-1' });

      expect(res.status).toBe(202);
      expect(res.body.jobId).toBeTruthy();
      await settle();
    });

    it('requires a student id', async () => {
      const res = await adminRequest(app).post('/admin/judger/rejudge').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('GET /admin/judger/jobs/:jobId', () => {
    it('reports 404 for a handle it does not know', async () => {
      // Job records do not survive a restart; the submissions carry the outcome.
      const res = await adminRequest(app).get('/admin/judger/jobs/nope');
      expect(res.status).toBe(404);
    });
  });
});
