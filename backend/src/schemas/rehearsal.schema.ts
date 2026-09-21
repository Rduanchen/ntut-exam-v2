import { z } from "zod";
import {
  REHEARSAL_CHECK_STATUSES,
  REHEARSAL_STAGE_IDS,
  REHEARSAL_STAGE_STATUSES,
  REHEARSAL_STATES,
} from "../types/rehearsal.type";
import type { RehearsalRun } from "../types/rehearsal.type";
import { DEPLOY_TEST_DIAGNOSTIC_LIMIT } from "../config/deploy-test.config";

/** Shared with the deploy test so one truncation limit governs both reports. */
const diagnostic = z.string().max(DEPLOY_TEST_DIAGNOSTIC_LIMIT);

/**
 * What the operator must send to start a rehearsal.
 *
 * `acknowledgeWipe` is required to be literally `true` rather than merely
 * present. The rehearsal ends by erasing the machine; a caller that has not
 * said so in as many words has not been told, and a confirmation dialog in the
 * UI is not a boundary — the endpoint is reachable without it.
 */
export const rehearsalStartInputSchema = z.object({
  acknowledgeWipe: z.literal(true),
}).strict();

export const rehearsalCheckSchema = z.object({
  id: z.string().min(1),
  status: z.enum(REHEARSAL_CHECK_STATUSES),
  expected: z.string().min(1),
  observed: diagnostic.optional(),
  attribution: z.enum(["submission", "system"]).optional(),
}).strict();

export const rehearsalStageSchema = z.object({
  id: z.enum(REHEARSAL_STAGE_IDS),
  status: z.enum(REHEARSAL_STAGE_STATUSES),
  startedAt: z.number().optional(),
  finishedAt: z.number().optional(),
  durationMs: z.number().nonnegative().optional(),
  timeoutMs: z.number().int().positive(),
  checks: z.array(rehearsalCheckSchema),
  failureReason: diagnostic.optional(),
}).strict();

export const rehearsalRunSchema: z.ZodType<RehearsalRun> = z.object({
  id: z.string().uuid(),
  state: z.enum(REHEARSAL_STATES),
  overallOutcome: z.enum(["passed", "failed", "interrupted"]).optional(),
  /* Exactly the six stages, in order, each once. The report is read back from
   * storage and rendered by position, so a run missing a stage would render as
   * a rehearsal that silently skipped one. */
  stages: z.array(rehearsalStageSchema)
    .length(REHEARSAL_STAGE_IDS.length)
    .refine(
      (stages) => REHEARSAL_STAGE_IDS.every((id, index) => stages[index]?.id === id),
      "stages must be the six rehearsal stages, in order, without duplicates",
    ),
  currentStage: z.enum(REHEARSAL_STAGE_IDS).optional(),
  ownsSystemState: z.boolean(),
  cleanupCompleted: z.boolean(),
  cleanupError: diagnostic.optional(),
  interruptionReason: z.enum(["deadline_exceeded", "process_restart"]).optional(),
  startedAt: z.number(),
  finishedAt: z.number().optional(),
  deadlineMs: z.number().int().positive(),
  errors: z.array(diagnostic),
}).strict().refine(
  /* A terminal run without a verdict or an end time is a report that cannot be
   * read: the page would show it as still running, forever. */
  (run) => {
    const terminal = run.state === "completed" || run.state === "failed" || run.state === "interrupted";
    return !terminal || (run.overallOutcome !== undefined && run.finishedAt !== undefined);
  },
  "a terminal run must carry both overallOutcome and finishedAt",
);

export type RehearsalStartInput = z.infer<typeof rehearsalStartInputSchema>;
