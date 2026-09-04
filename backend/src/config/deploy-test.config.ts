import { getExecutionCeiling } from "../services/judge-limiter";
import type { DeploymentTestProfile } from "../types/deploy-test.type";

export const DEPLOY_TEST_BOUNDS = Object.freeze({
  maxLevels: 8,
  minConcurrency: 1,
  maxConcurrency: 64,
  minJobs: 1,
  maxJobs: 500,
  minDeadlineMs: 60_000,
  maxDeadlineMs: 1_800_000,
});

export function defaultConcurrencyLevels(ceiling = getExecutionCeiling()): number[] {
  return [...new Set([1, ceiling, Math.min(ceiling * 2, DEPLOY_TEST_BOUNDS.maxConcurrency)])]
    .sort((a, b) => a - b);
}

export function defaultDeployTestProfile(ceiling = getExecutionCeiling()): DeploymentTestProfile {
  return {
    phases: ["smoke", "verdict", "concurrency"],
    languages: ["c", "cpp", "python"],
    concurrencyLevels: defaultConcurrencyLevels(ceiling),
    jobCount: 100,
    deadlineMs: 900_000,
  };
}

export const DEPLOY_TEST_DIAGNOSTIC_LIMIT = 5_000;
export const DEPLOY_TEST_ERROR_SAMPLE_LIMIT = 10;
