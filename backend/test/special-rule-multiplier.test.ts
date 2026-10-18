import { describe, expect, it } from "vitest";
import { getPuzzleRuleMultiplier } from "../src/services/special-rules/multiplier";

describe("getPuzzleRuleMultiplier", () => {
  it("does not apply the puzzle multiplier when all rules pass", () => {
    expect(getPuzzleRuleMultiplier([{ passed: true }, { passed: true }], 0.5)).toBe(1);
  });

  it("applies the puzzle multiplier once when one or more rules fail", () => {
    expect(getPuzzleRuleMultiplier([{ passed: false }, { passed: false }], 0.5)).toBe(0.5);
  });

  it("does not apply the multiplier when there are no rules", () => {
    expect(getPuzzleRuleMultiplier([], 0.5)).toBe(1);
  });
});
