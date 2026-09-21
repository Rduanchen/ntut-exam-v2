/**
 * The post-deployment rehearsal: a minimal exam, run end to end, then erased.
 *
 * Deliberately shaped like `deploy-test.type.ts`, because the two solve the
 * same operational problem from opposite ends. The deploy test asks "can this
 * machine run a program"; the rehearsal asks "can this system run an exam".
 */

export const REHEARSAL_STAGE_IDS = ["paper", "enrol", "admit", "submit", "grade", "cleanup"] as const;
export const REHEARSAL_STATES = ["queued", "running", "completed", "failed", "interrupted"] as const;
export const REHEARSAL_STAGE_STATUSES = ["pending", "running", "passed", "failed", "skipped"] as const;
export const REHEARSAL_CHECK_STATUSES = ["passed", "failed", "skipped"] as const;

export type RehearsalStageId = (typeof REHEARSAL_STAGE_IDS)[number];
export type RehearsalState = (typeof REHEARSAL_STATES)[number];
export type RehearsalStageStatus = (typeof REHEARSAL_STAGE_STATUSES)[number];
export type RehearsalCheckStatus = (typeof REHEARSAL_CHECK_STATUSES)[number];
export type RehearsalOutcome = "passed" | "failed" | "interrupted";
export type RehearsalInterruptionReason = "deadline_exceeded" | "process_restart";

/**
 * Why a rehearsal may not start.
 *
 * `cleanup_pending` is the one that outlives a run: a rehearsal that could not
 * erase itself leaves the machine dirty, and the next rehearsal must not paper
 * over that by starting a fresh one on top.
 */
export type RehearsalBlockReason =
  | "exam_initialized"
  | "exam_data_present"
  | "rehearsal_active"
  | "deploy_test_active"
  | "deploy_test_draining"
  | "student_judging_active"
  | "cleanup_pending";

export interface RehearsalCheck {
  id: string;
  status: RehearsalCheckStatus;
  /** Human-readable expectation, e.g. `"409 phase_not_allowed"`. */
  expected: string;
  /** What actually happened. Truncated before it gets here. */
  observed?: string;
  /**
   * Present only on judging checks. A `system` attribution always fails the
   * check: a verdict the system caused proves nothing about the student's code,
   * and presenting it as a successful verification is the exact mistake that
   * cost this project two months in 2026-08.
   */
  attribution?: "submission" | "system";
}

export interface RehearsalStage {
  id: RehearsalStageId;
  status: RehearsalStageStatus;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  timeoutMs: number;
  checks: RehearsalCheck[];
  failureReason?: string;
}

export interface RehearsalRun {
  id: string;
  state: RehearsalState;
  overallOutcome?: RehearsalOutcome;
  stages: RehearsalStage[];
  currentStage?: RehearsalStageId;
  /**
   * Whether this run is responsible for whatever exam data currently exists.
   *
   * Written `true` BEFORE the first mutating request, which is what lets
   * startup recovery wipe with confidence: a non-terminal run with this flag
   * means every row in the exam tables was put there by the rehearsal.
   */
  ownsSystemState: boolean;
  cleanupCompleted: boolean;
  cleanupError?: string;
  interruptionReason?: RehearsalInterruptionReason;
  startedAt: number;
  finishedAt?: number;
  deadlineMs: number;
  errors: string[];
}

export interface RehearsalStageDescriptor {
  id: RehearsalStageId;
  title: string;
  timeoutMs: number;
}

export interface RehearsalDescriptor {
  canStart: boolean;
  blockedReason?: RehearsalBlockReason;
  deadlineMs: number;
  stages: RehearsalStageDescriptor[];
  pendingCleanup: boolean;
}

export interface RehearsalEnvelope {
  run: RehearsalRun | null;
  alreadyRunning?: boolean;
}

const TERMINAL: ReadonlySet<RehearsalState> = new Set<RehearsalState>(["completed", "failed", "interrupted"]);

export function isTerminalRehearsalState(state: RehearsalState): boolean {
  return TERMINAL.has(state);
}
