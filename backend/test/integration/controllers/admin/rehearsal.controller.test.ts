import { beforeEach, describe, expect, it, vi } from 'vitest';
import type express from 'express';

import { createApp } from '../../../../src/app';
import { adminRequest } from '../../../helpers/admin-request';
import { supertestTransport } from '../../../helpers/supertest-transport';
import { RehearsalService } from '../../../../src/services/rehearsal.service';
import { RehearsalRepository } from '../../../../src/services/rehearsal-repository';
import { JudgingWorkCoordinator } from '../../../../src/services/judging-work-coordinator';
import { JudgerService } from '../../../../src/services/judger.service';
import { SystemSettingsService } from '../../../../src/services/system-settings.service';
import { SocketService } from '../../../../src/sockets/socket.service';
import messageSocketService from '../../../../src/sockets/message-socket.service';
import { User } from '../../../../src/models/user.model';
import { ScoreBoard } from '../../../../src/models/score-board.model';
import { DEFAULT_EXAM_CONFIG } from '../../../../src/constants/default-config.constant';
import { buildExamConfig } from '../../../fixtures/exam-config.fixture';
import { rehearsalRun } from '../../../fixtures/rehearsal.fixture';
import {
  REHEARSAL_PUZZLE_AC,
  REHEARSAL_PUZZLE_SCORE,
  REHEARSAL_PUZZLE_WA,
  REHEARSAL_STUDENT_ID,
} from '../../../../src/config/rehearsal-paper.config';

describe('AdminRehearsalController (integration)', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = createApp();
    vi.restoreAllMocks();
    vi.spyOn(SocketService, 'triggerScoreUpdateEvent').mockImplementation(() => {});
    vi.spyOn(SocketService, 'triggerDataUpdateEvent').mockImplementation(() => {});
    vi.spyOn(messageSocketService, 'sendStatusUpdateNotification').mockImplementation(() => {});
    vi.spyOn(messageSocketService, 'sendExamReset').mockImplementation(() => {});
    await SystemSettingsService.saveExamConfig(DEFAULT_EXAM_CONFIG);
    await User.destroy({ where: {} });
  });

  describe('authorisation', () => {
    it('refuses every endpoint without an admin token', async () => {
      const anon = adminRequest(app, 'wrong-token');
      for (const response of [
        await anon.get('/admin/rehearsal/profile'),
        await anon.post('/admin/rehearsal').send({ acknowledgeWipe: true }),
        await anon.get('/admin/rehearsal/latest'),
        await anon.get('/admin/rehearsal/some-id'),
      ]) {
        expect(response.status).toBe(401);
      }
      expect(await RehearsalRepository.read()).toBeNull();
    });
  });

  describe('POST /admin/rehearsal', () => {
    it('demands an explicit acknowledgement that the machine will be wiped', async () => {
      const res = await adminRequest(app).post('/admin/rehearsal').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('acknowledge_required');
      expect(await RehearsalRepository.read()).toBeNull();
    });

    it('refuses on a prepared machine and changes nothing', async () => {
      const paper = buildExamConfig();
      await SystemSettingsService.saveExamConfig(paper);
      await User.create({ testId: '109590001', name: 'Alice', ipAddress: null });

      const res = await adminRequest(app).post('/admin/rehearsal').send({ acknowledgeWipe: true });

      expect(res.status).toBe(409);
      expect(res.body.reason).toBe('exam_data_present');
      /* The whole point of US5: a refused rehearsal must leave the operator's
       * paper and roster exactly where they were. */
      expect((await SystemSettingsService.getExamConfig()).testTitle).toBe(paper.testTitle);
      expect(await User.count()).toBe(1);
      expect(await RehearsalRepository.read()).toBeNull();
    });

    it('refuses while the deploy test holds the execution backend', async () => {
      const deploy = JudgingWorkCoordinator.acquireDeploy();
      const res = await adminRequest(app).post('/admin/rehearsal').send({ acknowledgeWipe: true });
      expect(res.status).toBe(409);
      expect(res.body.reason).toBe('deploy_test_active');
      deploy.lease?.release();
    });

    it('refuses to start a deploy test while a rehearsal is running', async () => {
      const rehearsal = JudgingWorkCoordinator.acquireRehearsal();
      const profile = await adminRequest(app).get('/admin/judger/deploy-tests/profile');
      expect(profile.body.canStart).toBe(false);
      expect(profile.body.blockedReason).toBe('rehearsal_active');
      rehearsal.lease?.release();
    });

    it('hands back the running rehearsal instead of starting a second', async () => {
      await RehearsalRepository.replace(rehearsalRun({
        state: 'running', overallOutcome: undefined, finishedAt: undefined, cleanupCompleted: false,
      }));
      const res = await adminRequest(app).post('/admin/rehearsal').send({ acknowledgeWipe: true });
      expect(res.status).toBe(200);
      expect(res.body.alreadyRunning).toBe(true);
    });
  });

  describe('GET /admin/rehearsal/:runId', () => {
    it('reports 404 for a rehearsal it does not hold', async () => {
      const res = await adminRequest(app).get('/admin/rehearsal/11111111-2222-4333-8444-999999999999');
      expect(res.status).toBe(404);
    });

    it('reports a null run before any rehearsal has happened', async () => {
      const res = await adminRequest(app).get('/admin/rehearsal/latest');
      expect(res.status).toBe(200);
      expect(res.body.run).toBeNull();
    });
  });

  describe('a full rehearsal against the real application', () => {
    /**
     * Judging is the one thing that cannot be real here — it would need a
     * Piston container. Everything else is: the phase matrix, the AES-GCM
     * handshake, replay protection, the admin token, the 202-and-poll handover
     * and the global reset all run for real.
     */
    const stubJudging = () => {
      vi.spyOn(JudgerService, 'judgeStudentSubmissions').mockImplementation(async (testId: string) => {
        await ScoreBoard.update(
          {
            score: REHEARSAL_PUZZLE_SCORE,
            puzzleResults: {
              [REHEARSAL_PUZZLE_AC]: { subtasks: [{ visible: [{ status: 'AC' }, { status: 'AC' }], hidden: [] }], specialRuleResults: [] },
              [REHEARSAL_PUZZLE_WA]: { subtasks: [{ visible: [{ status: 'WA' }, { status: 'WA' }], hidden: [] }], specialRuleResults: [] },
            },
          },
          { where: { testId } },
        );
        return { results: {}, graded: 2, systemFailures: 0 } as never;
      });
    };

    const runRehearsal = async () => {
      RehearsalService.configureForTests({
        transport: supertestTransport(app),
        sleep: async () => undefined,
      });
      const accepted = await adminRequest(app).post('/admin/rehearsal').send({ acknowledgeWipe: true });
      expect(accepted.status).toBe(202);
      await RehearsalService.settle();
      return (await RehearsalRepository.read())!;
    };

    it('walks the whole exam and erases itself', async () => {
      stubJudging();
      const run = await runRehearsal();

      expect(run.state).toBe('completed');
      expect(run.overallOutcome).toBe('passed');
      expect(run.stages.map((stage) => stage.status))
        .toEqual(['passed', 'passed', 'passed', 'passed', 'passed', 'passed']);
    });

    it('is refused the exam key before the exam starts, through the real phase matrix', async () => {
      stubJudging();
      const run = await runRehearsal();

      const check = run.stages.find((stage) => stage.id === 'enrol')!
        .checks.find((c) => c.id === 'exam_key_refused_before_start');
      expect(check?.status).toBe('passed');
      expect(check?.observed).toContain('phase_not_allowed');
    });

    it('leaves nothing behind', async () => {
      stubJudging();
      await runRehearsal();

      expect(await User.count()).toBe(0);
      expect(await ScoreBoard.count()).toBe(0);
      expect(await SystemSettingsService.getSetting('exam_key')).toBeNull();

      const status = await adminRequest(app).get('/admin/init/init-status');
      expect(status.body.initializedUserCount).toBe(0);
    });

    it('keeps the report readable after the wipe', async () => {
      stubJudging();
      const run = await runRehearsal();

      /* The report survives because it lives in an ordinary SystemSettings key
       * and `wipeAllData` purges only the three paper keys. If that ever
       * changes, this test is the alarm. */
      const latest = await adminRequest(app).get('/admin/rehearsal/latest');
      expect(latest.status).toBe(200);
      expect(latest.body.run.id).toBe(run.id);
      expect(latest.body.run.stages).toHaveLength(6);

      const byId = await adminRequest(app).get(`/admin/rehearsal/${run.id}`);
      expect(byId.status).toBe(200);
    });

    it('lets a real exam be prepared immediately afterwards', async () => {
      stubJudging();
      await runRehearsal();

      const paper = buildExamConfig();
      const upload = await adminRequest(app).post('/admin/config').send(paper);
      expect(upload.status).toBe(200);

      const init = await adminRequest(app).post('/admin/init');
      expect(init.status).toBe(200);

      const users = await User.findAll();
      expect(users.map((user) => user.testId)).not.toContain(REHEARSAL_STUDENT_ID);
      expect(users).toHaveLength(paper.accessibleUsers.length);
    });

    it('puts back the judging settings it overwrote', async () => {
      /* The concurrency ceiling is a measurement of this machine, and it lives
       * inside exam_config — which the rehearsal replaces and the global reset
       * does not restore. Losing it would silently undo somebody's work. */
      stubJudging();
      await SystemSettingsService.saveExamConfig({
        ...DEFAULT_EXAM_CONFIG,
        judgerSettings: { ...DEFAULT_EXAM_CONFIG.judgerSettings, maxConcurrentJobs: 17 },
      });

      await runRehearsal();

      const restored = await SystemSettingsService.getExamConfig();
      expect(restored.judgerSettings.maxConcurrentJobs).toBe(17);
      expect(restored.accessibleUsers).toHaveLength(0);
    });

    it('can be run twice in a row', async () => {
      /* Would fail if the rehearsal paper were left in exam_config: the second
       * attempt refuses itself as `exam_data_present`. */
      stubJudging();
      const first = await runRehearsal();
      expect(first.overallOutcome).toBe('passed');

      const profile = await adminRequest(app).get('/admin/rehearsal/profile');
      expect(profile.body.canStart).toBe(true);

      const second = await runRehearsal();
      expect(second.overallOutcome).toBe('passed');
      expect(second.id).not.toBe(first.id);
    });

    it('fails the grading stage when the judge blames itself', async () => {
      vi.spyOn(JudgerService, 'judgeStudentSubmissions').mockResolvedValue({
        results: {}, graded: 1, systemFailures: 1,
      } as never);

      const run = await runRehearsal();

      const grade = run.stages.find((stage) => stage.id === 'grade')!;
      expect(grade.status).toBe('failed');
      expect(grade.checks.find((c) => c.id === 'no_system_attribution')?.attribution).toBe('system');
      expect(run.overallOutcome).toBe('failed');
      /* Still erased: a failed rehearsal is not an excuse to leave residue. */
      expect(await User.count()).toBe(0);
    });
  });
});
