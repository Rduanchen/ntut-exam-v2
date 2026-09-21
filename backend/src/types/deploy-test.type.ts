import type { EffectiveJudgeSettings } from "../config/judge.config";

export const DEPLOY_TEST_PHASES = ["smoke", "verdict", "concurrency"] as const;
export const DEPLOY_TEST_LANGUAGES = ["c", "cpp", "python"] as const;
export const DEPLOY_TEST_STATES = ["queued", "running", "completed", "failed", "interrupted"] as const;

export type DeployTestPhase = (typeof DEPLOY_TEST_PHASES)[number];
export type DeployTestLanguage = (typeof DEPLOY_TEST_LANGUAGES)[number];
export type DeployTestState = (typeof DEPLOY_TEST_STATES)[number];
export type DeployTestOutcome = "passed" | "warning" | "failed" | "interrupted";
export type DeployTestVerdict = "AC" | "WA" | "CE" | "RE" | "TLE" | "MLE" | "OLE" | "CTLE" | "SE" | "UNKNOWN";
export type DeployTestAttribution = "submission" | "system" | "unknown";
export type ProbeStatus = "passed" | "failed" | "blocked";
export type ProgressPhase = "readiness" | DeployTestPhase | "post-check" | "finalizing";

export interface DeploymentTestProfile {
  phases: DeployTestPhase[];
  languages: DeployTestLanguage[];
  concurrencyLevels: number[];
  jobCount: number;
  deadlineMs: number;
}

export interface RuntimeSnapshot {
  semanticLanguage: DeployTestLanguage;
  available: boolean;
  language?: string;
  version?: string;
  aliases: string[];
  checkedAt: number;
}

export interface DeployTestAttempt {
  attempt: number;
  status: DeployTestVerdict;
  attribution: DeployTestAttribution;
  stage: "compile" | "run" | "none";
  enqueuedAt: number;
  slotAcquiredAt: number;
  finishedAt: number;
  queueMs: number;
  executionMs: number;
  totalMs: number;
  diagnostic: string;
}

export interface ProbeResult {
  probeId: string;
  phase: "smoke" | "verdict";
  semanticLanguage: DeployTestLanguage;
  scenario: "ac" | "ce" | "re" | "tle" | "mle" | "ole";
  expectedStatus: DeployTestVerdict;
  expectedAttribution: DeployTestAttribution;
  observedStatus?: DeployTestVerdict;
  observedAttribution?: DeployTestAttribution;
  runtime?: { language: string; version: string };
  status: ProbeStatus;
  attempts: DeployTestAttempt[];
  diagnostic: string;
}

export interface LatencyDistribution {
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export interface ConcurrencyResult {
  submittedConcurrency: number;
  activeCeiling: number;
  observedPeakExecutionConcurrency: number;
  requested: number;
  completed: number;
  expectedFailures: number;
  infrastructureFailures: number;
  missing: number;
  interrupted: number;
  throughputPerSecond: number;
  queueLatencyMs: LatencyDistribution;
  executionLatencyMs: LatencyDistribution;
  totalLatencyMs: LatencyDistribution;
  infrastructureFailureRate: number;
  warnings: string[];
  sampleErrors: string[];
}

export interface DeploymentTestRun {
  id: string;
  state: DeployTestState;
  overallOutcome?: DeployTestOutcome;
  profile: DeploymentTestProfile;
  settings: EffectiveJudgeSettings & {
    runTimeLimit: number;
    runMemoryLimit: number;
  };
  activeCeiling: number;
  runtimes: RuntimeSnapshot[];
  progress: { phase: ProgressPhase; completed: number; total: number; updatedAt: number };
  probes: ProbeResult[];
  concurrencyResults: ConcurrencyResult[];
  errors: string[];
  startedAt: number;
  finishedAt?: number;
  interruptionReason?: "exam_started" | "deadline_exceeded" | "process_restart" | "orchestration_failure";
}

export interface RunEnvelope {
  run: DeploymentTestRun | null;
  draining: boolean;
  alreadyRunning?: boolean;
}

export interface ProfileDescriptor {
  defaults: DeploymentTestProfile;
  bounds: typeof import("../config/deploy-test.config").DEPLOY_TEST_BOUNDS;
  activeCeiling: number;
  canStart: boolean;
  blockedReason?: "exam_in_progress" | "student_judging_active" | "deploy_test_active" | "deploy_test_draining" | "rehearsal_active" | "piston_unreachable";
}

export function isTerminalDeployTestState(state: DeployTestState): boolean {
  return state === "completed" || state === "failed" || state === "interrupted";
}
