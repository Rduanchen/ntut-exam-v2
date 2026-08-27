import { randomUUID } from "node:crypto";
import logger from "../utils/logger.util";

export type JudgingJobState = "waiting" | "running" | "finished" | "failed";

export interface JudgingOutcome {
  /** Submissions judged with a verdict the student owns. */
  graded: number;
  /** Submissions the system could not evaluate. Reported separately, always. */
  systemFailures: number;
}

export interface JudgingJob {
  id: string;
  testId: string;
  state: JudgingJobState;
  startedAt: number;
  finishedAt?: number;
  outcome?: JudgingOutcome;
  /** Present only when the run itself broke, distinct from a run that recorded failures. */
  error?: string;
}

/**
 * Tracks background judging runs.
 *
 * Deliberately in memory. The submissions are the durable record — a lost job
 * entry costs a status query, not a result — and startup recovery returns
 * anything stranded mid-judge to a re-judgeable state. Persisting partial
 * progress would buy resumability the system does not need, since re-judging
 * is idempotent.
 */
export class JudgeQueueService {
  private static jobs = new Map<string, JudgingJob>();
  /** testId -> job id, for jobs that have not reached a terminal state. */
  private static live = new Map<string, string>();

  /** Visible for tests; a process restart does this implicitly. */
  static reset(): void {
    JudgeQueueService.jobs.clear();
    JudgeQueueService.live.clear();
  }

  static get(jobId: string): JudgingJob | undefined {
    return JudgeQueueService.jobs.get(jobId);
  }

  static findLiveFor(testId: string): JudgingJob | undefined {
    const id = JudgeQueueService.live.get(testId);
    return id ? JudgeQueueService.jobs.get(id) : undefined;
  }

  /**
   * Start a run, or hand back the one already going.
   *
   * Returning the existing handle is idempotent and is what a TA
   * double-clicking actually wants. Rejecting would surface an error for a
   * harmless action; starting a second run would interleave writes to the same
   * submissions and the same scoreboard row, and would spend the capacity this
   * feature exists to protect.
   */
  static start(
    testId: string,
    run: () => Promise<JudgingOutcome>,
  ): { job: JudgingJob; alreadyRunning: boolean } {
    const existing = JudgeQueueService.findLiveFor(testId);
    if (existing) {
      return { job: existing, alreadyRunning: true };
    }

    const job: JudgingJob = {
      id: randomUUID(),
      testId,
      state: "waiting",
      startedAt: Date.now(),
    };
    JudgeQueueService.jobs.set(job.id, job);
    JudgeQueueService.live.set(testId, job.id);

    /* Deliberately not awaited: the caller returns immediately. Errors are
     * captured onto the job so a broken run reports `failed` rather than
     * appearing to run forever. */
    void JudgeQueueService.execute(job, run);

    return { job, alreadyRunning: false };
  }

  private static async execute(
    job: JudgingJob,
    run: () => Promise<JudgingOutcome>,
  ): Promise<void> {
    job.state = "running";
    try {
      job.outcome = await run();
      job.state = "finished";
    } catch (error: any) {
      job.state = "failed";
      job.error = error?.message ?? String(error);
      logger.error(`[JudgeQueue] Job ${job.id} for ${job.testId} failed: ${job.error}`);
    } finally {
      job.finishedAt = Date.now();
      JudgeQueueService.live.delete(job.testId);
    }
  }
}
