import type { RehearsalDescriptor, RehearsalRun, RehearsalStage, RehearsalStageId } from '../../src/types/rehearsal';
import { REHEARSAL_STAGE_IDS } from '../../src/types/rehearsal';

export const stage = (id: RehearsalStageId, over: Partial<RehearsalStage> = {}): RehearsalStage => ({
  id, status: 'passed', timeoutMs: 15_000, durationMs: 1_200, checks: [], ...over,
});

export const run = (over: Partial<RehearsalRun> = {}): RehearsalRun => ({
  id: 'run-1',
  state: 'completed',
  overallOutcome: 'passed',
  stages: REHEARSAL_STAGE_IDS.map((id) => stage(id)),
  ownsSystemState: true,
  cleanupCompleted: true,
  startedAt: 1_700_000_000_000,
  finishedAt: 1_700_000_060_000,
  deadlineMs: 300_000,
  errors: [],
  ...over,
});

export const descriptor = (over: Partial<RehearsalDescriptor> = {}): RehearsalDescriptor => ({
  canStart: true,
  deadlineMs: 300_000,
  stages: REHEARSAL_STAGE_IDS.map((id) => ({ id, title: id, timeoutMs: 15_000 })),
  pendingCleanup: false,
  ...over,
});
