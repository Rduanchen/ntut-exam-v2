import type { RehearsalStageDescriptor } from "../types/rehearsal.type";

/**
 * How long each stage may take, and how long the whole rehearsal may take.
 *
 * `grade` is an order of magnitude larger than the rest because it is the only
 * stage that waits on compilation and execution. The value that caused this
 * project's worst incident was a compile allowance nobody had chosen; these are
 * chosen, and they are here rather than inside the service so that the answer to
 * "why 180 seconds" has somewhere to live.
 */
export const REHEARSAL_STAGES: readonly RehearsalStageDescriptor[] = [
  { id: "paper", title: "考卷載入與初始化", timeoutMs: 15_000 },
  { id: "enrol", title: "模擬裝置入場", timeoutMs: 20_000 },
  { id: "admit", title: "模擬學生登入", timeoutMs: 15_000 },
  { id: "submit", title: "模擬學生提交", timeoutMs: 20_000 },
  /* Queueing plus a system-failure retry plus a cold compile. Generous on
   * purpose: a rehearsal that times out on a healthy-but-busy machine teaches
   * the operator to distrust it. */
  { id: "grade", title: "助教手動評測", timeoutMs: 180_000 },
  { id: "cleanup", title: "清除", timeoutMs: 30_000 },
] as const;

/** Whole-rehearsal ceiling. SC-001 asks for a verdict inside five minutes. */
export const REHEARSAL_DEADLINE_MS = 300_000;

/** How often the grading stage asks whether the judging job has finished. */
export const REHEARSAL_JUDGE_POLL_INTERVAL_MS = 1_000;
