import type { RuleEvalContext, RuleEvalResult } from "special-rule-engine";
import type { SpecialRule } from "../../schemas/config.schema";

import { evaluateRules as evaluateRulesImpl } from "special-rule-engine";

export async function evaluateSpecialRules(rules: SpecialRule[], ctx: RuleEvalContext): Promise<RuleEvalResult[]> {
    // special-rule-engine SpecialRule is structurally compatible with backend schema SpecialRule.
    return evaluateRulesImpl(rules as any, ctx);
}
