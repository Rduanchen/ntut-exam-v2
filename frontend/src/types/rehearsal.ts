/**
 * Mirrors `backend/src/types/rehearsal.type.ts`.
 *
 * Hand-kept, like the other type modules here — the two repositories share no
 * build. A drift between them shows up as a field the page silently renders as
 * blank, so anything added on the backend belongs here in the same change.
 */

export const REHEARSAL_STAGE_IDS = ['paper', 'enrol', 'admit', 'submit', 'grade', 'cleanup'] as const;
export type RehearsalStageId = (typeof REHEARSAL_STAGE_IDS)[number];

export type RehearsalState = 'queued' | 'running' | 'completed' | 'failed' | 'interrupted';
export type RehearsalStageStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
export type RehearsalCheckStatus = 'passed' | 'failed' | 'skipped';
export type RehearsalOutcome = 'passed' | 'failed' | 'interrupted';

export type RehearsalBlockReason =
  | 'exam_initialized'
  | 'exam_data_present'
  | 'rehearsal_active'
  | 'deploy_test_active'
  | 'deploy_test_draining'
  | 'student_judging_active'
  | 'cleanup_pending';

export interface RehearsalCheck {
  id: string;
  status: RehearsalCheckStatus;
  expected: string;
  observed?: string;
  attribution?: 'submission' | 'system';
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
  ownsSystemState: boolean;
  cleanupCompleted: boolean;
  cleanupError?: string;
  interruptionReason?: 'deadline_exceeded' | 'process_restart';
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

const TERMINAL: readonly RehearsalState[] = ['completed', 'failed', 'interrupted'];
export const isTerminalRehearsal = (run: RehearsalRun): boolean => TERMINAL.includes(run.state);

/** Why the operator cannot start, in words they can act on. */
export const BLOCK_REASON_TEXT: Record<RehearsalBlockReason, string> = {
  exam_initialized: '考試已經初始化。演練只能在尚未初始化的系統上執行 —— 它結束時會清空系統。',
  exam_data_present: '系統已持有正式考卷或學生資料。演練會清空系統，因此在這個狀態下不允許啟動。',
  rehearsal_active: '已經有一個演練正在執行。',
  deploy_test_active: '評測部署測試正在執行，兩者共用評測引擎。',
  deploy_test_draining: '評測部署測試正在收尾，請稍候。',
  student_judging_active: '有評測工作正在執行。',
  cleanup_pending: '上一次演練沒有清乾淨，系統仍有殘留。請先手動處理，再上傳正式考卷。',
};

/** Stage titles, for a report rendered after the descriptor is long gone. */
export const STAGE_TITLES: Record<RehearsalStageId, string> = {
  paper: '考卷載入與初始化',
  enrol: '模擬裝置入場',
  admit: '模擬學生登入',
  submit: '模擬學生提交',
  grade: '助教手動評測',
  cleanup: '清除',
};

/**
 * Checks whose passing condition is a refusal.
 *
 * Rendered with their meaning spelled out, because "passed: the server said
 * no" reads as a contradiction otherwise — and this particular one is the most
 * important result in the report.
 */
export const INVERTED_CHECKS: Record<string, string> = {
  exam_key_refused_before_start: '開考前索取考卷金鑰必須被拒絕 —— 通過代表測資保護生效',
};
