import { describe, expect, it } from "vitest";
import { evaluateSpecialRules } from "../src/services/special-rules/engine";

describe("special rule engine integration", () => {
  it("evaluates Python AST rules through the backend wrapper", async () => {
    const results = await evaluateSpecialRules([{
      id: "require-loop",
      type: "pythonFeature",
      constraint: "MUST_HAVE",
      message: "Use a loop",
      params: { features: ["FOR"] },
    }], {
      language: "Python",
      sourceText: "for item in items:\n    print(item)",
    });

    expect(results).toMatchObject([{ ruleId: "require-loop", passed: true }]);
  });

  it("evaluates Python feature handlers nested inside composites", async () => {
    const results = await evaluateSpecialRules([{
      id: "composite-loop",
      type: "composite",
      constraint: "MUST_HAVE",
      message: "Use a loop",
      params: {
        op: "AND",
        rules: [{
          id: "nested-loop-feature",
          type: "pythonFeature",
          constraint: "MUST_HAVE",
          message: "Use a loop",
          params: { features: ["FOR"] },
        }],
      },
    }], {
      language: "Python",
      sourceText: "for item in items:\n    print(item)",
    });

    expect(results).toMatchObject([{ ruleId: "composite-loop", passed: true }]);
  });
});
