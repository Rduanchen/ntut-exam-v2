import type { RuleEvalResult } from "special-rule-engine";

/** Apply a puzzle's one-time penalty when any special rule fails. */
export function getPuzzleRuleMultiplier(
  results: Pick<RuleEvalResult, "passed">[],
  puzzleMultiplier: number,
): number {
  return results.some((result) => !result.passed) ? puzzleMultiplier : 1;
}
