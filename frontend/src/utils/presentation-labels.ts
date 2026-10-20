import type { DeployTestOutcome, DeployTestPhase, DeployTestState } from '../types/deploy-test';
import type { RehearsalStageStatus } from '../types/rehearsal';

const deployStates: Record<DeployTestState, string> = {
  queued: '排隊中', running: '執行中', completed: '已完成',
  failed: '失敗', interrupted: '已中斷'
};
const outcomes: Record<DeployTestOutcome, string> = {
  passed: '通過', warning: '需注意', failed: '失敗', interrupted: '已中斷'
};
const phases: Record<DeployTestPhase, string> = {
  smoke: '基本檢查', verdict: '評測結果', concurrency: '並行測試'
};
const stageStatuses: Record<RehearsalStageStatus, string> = {
  pending: '未開始', running: '進行中', passed: '通過',
  failed: '失敗', skipped: '未執行'
};
const verdicts: Record<string, string> = {
  AC: '答案正確', WA: '答案錯誤', TLE: '執行逾時',
  MLE: '記憶體超限', CE: '編譯錯誤',
  CTLE: '編譯逾時（系統錯誤）', SE: '系統錯誤'
};

const knownOrRaw = (labels: Record<string, string>, raw: string): string =>
  labels[raw] ?? `未識別狀態（${raw}）`;

export const deployStateLabel = (raw: string): string => knownOrRaw(deployStates, raw);
export const deployOutcomeLabel = (raw: string): string => knownOrRaw(outcomes, raw);
export const probeStatusLabel = (raw: string): string =>
  raw === 'blocked' ? '因條件未滿足而略過' : deployOutcomeLabel(raw);
export const deployPhaseLabel = (raw: string): string => knownOrRaw(phases, raw);
export const stageStatusLabel = (raw: string): string => knownOrRaw(stageStatuses, raw);
export const interruptionReasonLabel = (raw: string): string => {
  if (raw === 'deadline_exceeded') return '超過截止時間';
  if (raw === 'process_restart') return '服務重新啟動';
  return `未識別中斷原因（${raw}）`;
};
export const verdictLabel = (raw: string): string => verdicts[raw] ?? `未識別判定（${raw}）`;

export const attributionLabel = (raw: string): string => {
  if (raw === 'submission') return '學生作答錯誤';
  if (raw === 'system') return '系統錯誤';
  return `未識別歸因（${raw}）`;
};

export const deviceStatusLabel = (status: string, isOnline: boolean): string => {
  if (!isOnline) return '離線';
  if (status === 'ONLINE') return '已登入';
  if (status === 'AWAITING_LOGIN') return '等待登入';
  if (status === 'UNBOUND') return '未綁定';
  return `未識別狀態（${status}）`;
};
