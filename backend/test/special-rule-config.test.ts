import { describe, expect, it } from "vitest";
import { examConfigSchema } from "../src/schemas/config.schema";

function configWithRules(specialRules: unknown[]) {
  return {
    testTitle: "AST rules",
    description: "Special rule config test",
    judgerSettings: { timeLimit: 1000, memoryLimit: 64 },
    environmentVariables: { startPassword: "start" },
    accessibleUsers: [],
    sections: [{
      id: "section-1",
      title: "Section 1",
      maxScore: 100,
      puzzles: [{
        id: "puzzle-1",
        title: "Puzzle 1",
        score: 100,
        language: "Python",
        subtasks: [],
        specialRules,
      }],
    }],
  };
}

describe("special rule config schema", () => {
  it("defaults the puzzle multiplier and drops legacy per-rule multipliers", () => {
    const parsed = examConfigSchema.parse(configWithRules([{
      id: "use-print",
      type: "use",
      constraint: "MUST_HAVE",
      message: "Use print",
      multiplier: 0.2,
      params: { target: "print" },
    }]));

    const puzzle = parsed.sections[0].puzzles[0];
    expect(puzzle.multiplier).toBe(0.5);
    expect(puzzle.specialRules?.[0]).not.toHaveProperty("multiplier");
  });

  it("accepts an explicitly configured puzzle multiplier", () => {
    const config = configWithRules([]);
    const parsed = examConfigSchema.parse({
      ...config,
      sections: [{
        ...config.sections[0],
        puzzles: [{ ...config.sections[0].puzzles[0], multiplier: 0.25 }],
      }],
    });

    expect(parsed.sections[0].puzzles[0].multiplier).toBe(0.25);
  });

  it("accepts Python feature rules and recursively validates composite children", () => {
    const parsed = examConfigSchema.parse(configWithRules([
      {
        id: "loop",
        type: "pythonFeature",
        constraint: "MUST_HAVE",
        message: "Use a loop",
        params: { features: ["FOR", "NESTED_LOOP"] },
      },
      {
        id: "combined",
        type: "composite",
        constraint: "MUST_HAVE",
        message: "Use a loop or print",
        params: {
          op: "OR",
          rules: [{
            id: "print",
            type: "use",
            constraint: "MUST_HAVE",
            message: "Use print",
            params: { target: "print" },
          }],
        },
      },
    ]));

    expect(parsed.sections[0].puzzles[0].specialRules).toHaveLength(2);
  });

  it("rejects unsupported Python features and a composite without AND/OR", () => {
    const badPython = configWithRules([{
      id: "unsupported",
      type: "pythonFeature",
      constraint: "MUST_HAVE",
      message: "Unsupported feature",
      params: { features: ["NOT_A_FEATURE"] },
    }]);
    const badComposite = configWithRules([{
      id: "missing-op",
      type: "composite",
      constraint: "MUST_HAVE",
      message: "Missing operator",
      params: { rules: [] },
    }]);

    expect(examConfigSchema.safeParse(badPython).success).toBe(false);
    expect(examConfigSchema.safeParse(badComposite).success).toBe(false);
  });
});
