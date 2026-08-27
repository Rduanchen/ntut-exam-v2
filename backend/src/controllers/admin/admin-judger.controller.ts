import { Request, Response } from 'express';
import { JudgerService } from '../../services/judger.service';
import { JudgeQueueService, type JudgingJob } from '../../services/judge-queue.service';
import { applyJudgeSettings, getExecutionCeiling } from '../../services/judge-limiter';
import { SystemSettingsService } from '../../services/system-settings.service';
import { checkPistonServer } from '../../constants/piston.config';
import { SocketService } from '../../sockets/socket.service';
import logger from '../../utils/logger.util';

/** The shape returned when judging is accepted. Never contains results. */
const handleOf = (job: JudgingJob) => ({
  jobId: job.id,
  testId: job.testId,
  state: job.state,
});

export class AdminJudgerController {
  /**
   * Accept a judging request and return immediately.
   *
   * Previously this awaited the whole run before responding. With a global
   * ceiling in front of the execution backend, that would hold the connection
   * open for as long as the queue is deep — converting a wrong verdict into a
   * request timeout, which is not an improvement. The response is a handle;
   * results arrive over the live-update channel or by querying the handle.
   */
  public static async judgeCode(req: Request, res: Response): Promise<void> {
    await AdminJudgerController.accept(req, res, req.params.testId, req.body?.questionIds);
  }

  /**
   * Re-judge a student.
   *
   * The TA-facing action has been calling this route since before it existed;
   * the 404 was swallowed by the caller's error handling, so the button did
   * nothing at all.
   */
  public static async rejudge(req: Request, res: Response): Promise<void> {
    await AdminJudgerController.accept(req, res, req.body?.testId, req.body?.questionIds);
  }

  private static async accept(
    _req: Request,
    res: Response,
    testId: string | undefined,
    questionIds: string[] | undefined,
  ): Promise<void> {
    if (!testId) {
      res.status(400).json({ error: 'Bad Request: Missing testId' });
      return;
    }

    const { job, alreadyRunning } = JudgeQueueService.start(testId, async () => {
      const summary = await JudgerService.judgeStudentSubmissions(testId, questionIds);
      SocketService.triggerScoreUpdateEvent(testId);
      return { graded: summary.graded, systemFailures: summary.systemFailures };
    });

    res.status(202).json({
      message: alreadyRunning
        ? 'Judging already in progress for this student'
        : 'Judging accepted',
      ...handleOf(job),
    });
  }

  /** Report a job's state, and its outcome once it has one. */
  public static async getJob(req: Request, res: Response): Promise<void> {
    const job = JudgeQueueService.get(req.params.jobId);
    if (!job) {
      // Job records do not survive a restart; the submissions carry the outcome.
      res.status(404).json({ error: 'Not Found: unknown job' });
      return;
    }

    res.status(200).json({
      ...handleOf(job),
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      /* Always present once finished, and zero is reported as zero: an absent
       * count is indistinguishable from an unreported one. */
      outcome: job.outcome,
      error: job.error,
    });
  }

  /** Effective judging settings, each with where its value came from. */
  public static async getSettings(_req: Request, res: Response): Promise<void> {
    try {
      const examConfig = await SystemSettingsService.getExamConfig();
      const effective = applyJudgeSettings(examConfig?.judgerSettings);
      res.status(200).json({ settings: effective, activeCeiling: getExecutionCeiling() });
    } catch (error: any) {
      logger.error(`getSettings error: ${error.message}`);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  /**
   * Update judging settings.
   *
   * They live inside the exam configuration, so a later configuration upload
   * overrides whatever is set here. That is the deployment model — one file
   * fully defines one machine — not an oversight.
   */
  public static async updateSettings(req: Request, res: Response): Promise<void> {
    try {
      const examConfig = await SystemSettingsService.getExamConfig();
      if (!examConfig) {
        res.status(409).json({ error: 'Conflict: no exam configuration to update' });
        return;
      }

      const merged = { ...examConfig.judgerSettings, ...(req.body ?? {}) };
      await SystemSettingsService.saveExamConfig({
        ...examConfig,
        judgerSettings: merged,
      });

      const effective = applyJudgeSettings(merged);
      res.status(200).json({ settings: effective, activeCeiling: getExecutionCeiling() });
    } catch (error: any) {
      logger.error(`updateSettings error: ${error.message}`);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  /** Whether the execution backend is reachable, and what it can actually run. */
  public static async health(_req: Request, res: Response): Promise<void> {
    const report = await checkPistonServer();
    // An unreachable backend is an answer, not an error: the operator asked.
    res.status(200).json({ ...report, checkedAt: Date.now() });
  }
}
