import { REHEARSAL_STAGE_IDS, type RehearsalRun, type RehearsalStage, type RehearsalStageId } from '../../src/types/rehearsal.type';

/**
 * Single source of truth for a rehearsal run in tests.
 *
 * Typed as the production `RehearsalRun`, so a schema change breaks
 * compilation here rather than leaving the fixture quietly wrong.
 */
export const rehearsalStage = (id: RehearsalStageId, overrides: Partial<RehearsalStage> = {}): RehearsalStage => ({
  id,
  status: 'passed',
  timeoutMs: 15_000,
  checks: [],
  ...overrides,
});

export const rehearsalRun = (overrides: Partial<RehearsalRun> = {}): RehearsalRun => ({
  id: '11111111-2222-4333-8444-555555555555',
  state: 'completed',
  overallOutcome: 'passed',
  stages: REHEARSAL_STAGE_IDS.map((id) => rehearsalStage(id)),
  ownsSystemState: true,
  cleanupCompleted: true,
  startedAt: 1,
  finishedAt: 10,
  deadlineMs: 300_000,
  errors: [],
  ...overrides,
});
