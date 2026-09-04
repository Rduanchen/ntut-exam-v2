import { DEPLOY_TEST_DIAGNOSTIC_LIMIT } from "../config/deploy-test.config";

const SUFFIX = "\n...[Output Truncated]";

export function truncateJudgerOutput(value: unknown, limit = DEPLOY_TEST_DIAGNOSTIC_LIMIT): string {
  if (typeof value !== "string") return "";
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - SUFFIX.length))}${SUFFIX}`;
}
