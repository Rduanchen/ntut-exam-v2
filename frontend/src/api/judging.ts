import axios from 'axios';
import { BACKEND_URL } from './backend-url';


export type JudgingJobState = 'waiting' | 'running' | 'finished' | 'failed';

export interface JudgingHandle {
  jobId: string;
  testId: string;
  state: JudgingJobState;
}

export interface JudgingOutcome {
  graded: number;
  /** Failures the machine caused. Reported separately from students' failures. */
  systemFailures: number;
}

export interface JudgingJob extends JudgingHandle {
  outcome?: JudgingOutcome;
  error?: string;
}

const TERMINAL: JudgingJobState[] = ['finished', 'failed'];

/**
 * Start judging one student.
 *
 * Returns as soon as the request is accepted. The response is a handle, not
 * results: judging runs in the background behind a global concurrency ceiling,
 * so a synchronous response would mean holding the connection open for as long
 * as the queue is deep.
 */
export async function startJudging(testId: string): Promise<JudgingHandle> {
  const res = await axios.post(`${BACKEND_URL}/admin/judger/judge/${testId}`);
  return res.data;
}

/** Re-judge a student. Same contract as starting. */
export async function startRejudge(testId?: string): Promise<JudgingHandle> {
  const res = await axios.post(`${BACKEND_URL}/admin/judger/rejudge`, { testId });
  return res.data;
}

export async function getJudgingJob(jobId: string): Promise<JudgingJob> {
  const res = await axios.get(`${BACKEND_URL}/admin/judger/jobs/${jobId}`);
  return res.data;
}

/**
 * Poll a job until it reaches a terminal state.
 *
 * The live-update channel already announces completion, and that is the normal
 * path. This exists so a dropped notification does not look like lost work —
 * the outcome stays retrievable by asking.
 */
export async function waitForJudging(
  jobId: string,
  { intervalMs = 1000, timeoutMs = 10 * 60 * 1000 } = {},
): Promise<JudgingJob> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const job = await getJudgingJob(jobId);
    if (TERMINAL.includes(job.state)) return job;
    if (Date.now() > deadline) {
      throw new Error(`Judging job ${jobId} did not finish within the expected time`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
