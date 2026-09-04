import { z } from "zod";
import { DEPLOY_TEST_BOUNDS } from "../config/deploy-test.config";
import { DEPLOY_TEST_LANGUAGES, DEPLOY_TEST_PHASES, DEPLOY_TEST_STATES } from "../types/deploy-test.type";
import type { DeploymentTestRun } from "../types/deploy-test.type";

const ascendingUnique = (items: number[]) => items.every((value, index) => index === 0 || value > items[index - 1]);

export const deploymentTestProfileSchema = z.object({
  phases: z.array(z.enum(DEPLOY_TEST_PHASES)).min(1).refine((v) => new Set(v).size === v.length, "phases must be unique"),
  languages: z.array(z.enum(DEPLOY_TEST_LANGUAGES)).min(1).refine((v) => new Set(v).size === v.length, "languages must be unique"),
  concurrencyLevels: z.array(z.number().int().min(DEPLOY_TEST_BOUNDS.minConcurrency).max(DEPLOY_TEST_BOUNDS.maxConcurrency))
    .min(1).max(DEPLOY_TEST_BOUNDS.maxLevels).refine(ascendingUnique, "concurrencyLevels must be unique and strictly ascending"),
  jobCount: z.number().int().min(DEPLOY_TEST_BOUNDS.minJobs).max(DEPLOY_TEST_BOUNDS.maxJobs),
  deadlineMs: z.number().int().min(DEPLOY_TEST_BOUNDS.minDeadlineMs).max(DEPLOY_TEST_BOUNDS.maxDeadlineMs),
}).strict();

// Persistence is trusted only after validating the complete stable envelope.
const effectiveSettingSchema = z.object({ value: z.number(), origin: z.enum(["config", "env", "default", "clamped"]) });
const attemptSchema = z.object({ attempt: z.number().int().positive(), status: z.enum(["AC", "WA", "CE", "RE", "TLE", "MLE", "OLE", "CTLE", "SE", "UNKNOWN"]), attribution: z.enum(["submission", "system", "unknown"]), stage: z.enum(["compile", "run", "none"]), enqueuedAt: z.number(), slotAcquiredAt: z.number(), finishedAt: z.number(), queueMs: z.number().nonnegative(), executionMs: z.number().nonnegative(), totalMs: z.number().nonnegative(), diagnostic: z.string().max(5_000) });
const distributionSchema = z.object({ p50: z.number().nonnegative(), p95: z.number().nonnegative(), p99: z.number().nonnegative(), max: z.number().nonnegative() });

export const deploymentTestRunSchema: z.ZodType<DeploymentTestRun> = z.object({
  id: z.string().uuid(),
  state: z.enum(DEPLOY_TEST_STATES),
  overallOutcome: z.enum(["passed", "warning", "failed", "interrupted"]).optional(),
  profile: deploymentTestProfileSchema,
  settings: z.object({ compileTimeout: effectiveSettingSchema, compileMemoryLimit: effectiveSettingSchema, maxConcurrentJobs: effectiveSettingSchema, maxSystemRetries: effectiveSettingSchema, runTimeLimit: z.number(), runMemoryLimit: z.number() }),
  activeCeiling: z.number().int().min(1).max(64),
  runtimes: z.array(z.object({ semanticLanguage: z.enum(DEPLOY_TEST_LANGUAGES), available: z.boolean(), language: z.string().optional(), version: z.string().optional(), aliases: z.array(z.string()), checkedAt: z.number() })),
  progress: z.object({ phase: z.enum(["readiness", "smoke", "verdict", "concurrency", "post-check", "finalizing"]), completed: z.number().int().nonnegative(), total: z.number().int().nonnegative(), updatedAt: z.number() }),
  probes: z.array(z.object({ probeId: z.string(), phase: z.enum(["smoke", "verdict"]), semanticLanguage: z.enum(DEPLOY_TEST_LANGUAGES), scenario: z.enum(["ac", "ce", "re", "tle", "mle", "ole"]), expectedStatus: z.enum(["AC", "WA", "CE", "RE", "TLE", "MLE", "OLE", "CTLE", "SE", "UNKNOWN"]), expectedAttribution: z.enum(["submission", "system", "unknown"]), observedStatus: z.enum(["AC", "WA", "CE", "RE", "TLE", "MLE", "OLE", "CTLE", "SE", "UNKNOWN"]).optional(), observedAttribution: z.enum(["submission", "system", "unknown"]).optional(), runtime: z.object({ language: z.string(), version: z.string() }).optional(), status: z.enum(["passed", "failed", "blocked"]), attempts: z.array(attemptSchema), diagnostic: z.string().max(5_000) })),
  concurrencyResults: z.array(z.object({ submittedConcurrency: z.number().int(), activeCeiling: z.number().int(), observedPeakExecutionConcurrency: z.number().int(), requested: z.number().int(), completed: z.number().int(), expectedFailures: z.number().int(), infrastructureFailures: z.number().int(), missing: z.number().int(), interrupted: z.number().int(), throughputPerSecond: z.number().nonnegative(), queueLatencyMs: distributionSchema, executionLatencyMs: distributionSchema, totalLatencyMs: distributionSchema, infrastructureFailureRate: z.number().nonnegative(), warnings: z.array(z.string()), sampleErrors: z.array(z.string().max(5_000)) })),
  errors: z.array(z.string().max(5_000)),
  startedAt: z.number(),
  finishedAt: z.number().optional(),
  interruptionReason: z.enum(["exam_started", "deadline_exceeded", "process_restart", "orchestration_failure"]).optional(),
}).strict();
