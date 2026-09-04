import type { EffectiveSetting } from './judge-settings';

export type DeployTestPhase = 'smoke' | 'verdict' | 'concurrency';
export type DeployTestLanguage = 'c' | 'cpp' | 'python';
export type DeployTestState = 'queued' | 'running' | 'completed' | 'failed' | 'interrupted';
export type DeployTestOutcome = 'passed' | 'warning' | 'failed' | 'interrupted';

export interface DeploymentTestProfile {
  phases: DeployTestPhase[];
  languages: DeployTestLanguage[];
  concurrencyLevels: number[];
  jobCount: number;
  deadlineMs: number;
}

export interface ProfileDescriptor {
  defaults: DeploymentTestProfile;
  bounds: { maxLevels: number; minConcurrency: number; maxConcurrency: number; minJobs: number; maxJobs: number; minDeadlineMs: number; maxDeadlineMs: number };
  activeCeiling: number;
  canStart: boolean;
  blockedReason?: string;
}

export interface DeployTestAttempt {
  attempt: number; status: string; attribution: string; stage: string;
  enqueuedAt: number; slotAcquiredAt: number; finishedAt: number;
  queueMs: number; executionMs: number; totalMs: number; diagnostic: string;
}

export interface ProbeResult {
  probeId: string; phase: 'smoke' | 'verdict'; semanticLanguage: DeployTestLanguage;
  scenario: string; expectedStatus: string; expectedAttribution: string;
  observedStatus?: string; observedAttribution?: string;
  runtime?: { language: string; version: string };
  status: 'passed' | 'failed' | 'blocked'; attempts: DeployTestAttempt[]; diagnostic: string;
}

export interface LatencyDistribution { p50: number; p95: number; p99: number; max: number }

export interface ConcurrencyResult {
  submittedConcurrency: number; activeCeiling: number; observedPeakExecutionConcurrency: number;
  requested: number; completed: number; expectedFailures: number; infrastructureFailures: number;
  missing: number; interrupted: number; throughputPerSecond: number;
  queueLatencyMs: LatencyDistribution; executionLatencyMs: LatencyDistribution; totalLatencyMs: LatencyDistribution;
  infrastructureFailureRate: number; warnings: string[]; sampleErrors: string[];
}

export interface DeploymentTestRun {
  id: string; state: DeployTestState; overallOutcome?: DeployTestOutcome;
  profile: DeploymentTestProfile;
  settings: Record<string, EffectiveSetting | number>;
  activeCeiling: number;
  runtimes: Array<{ semanticLanguage: DeployTestLanguage; available: boolean; language?: string; version?: string; aliases: string[]; checkedAt: number }>;
  progress: { phase: string; completed: number; total: number; updatedAt: number };
  probes: ProbeResult[]; concurrencyResults: ConcurrencyResult[]; errors: string[];
  startedAt: number; finishedAt?: number; interruptionReason?: string;
}

export interface RunEnvelope { run: DeploymentTestRun | null; draining: boolean; alreadyRunning?: boolean }

export const isTerminalRun = (run: DeploymentTestRun): boolean =>
  run.state === 'completed' || run.state === 'failed' || run.state === 'interrupted';
