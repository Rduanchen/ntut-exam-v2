import type { ExamConfig } from "../../schemas/config.schema";
import type { SpecialRule } from "../../schemas/config.schema";

/**
 * Compute the effective special rules for a specific puzzle index.
 *
 * Ordering is stable:
 * 1) globalSpecialRules (config order)
 * 2) puzzles[puzzleIndex].specialRules (config order)
 */
export function getEffectiveSpecialRules(input: {
    globalSpecialRules: SpecialRule[];
    puzzleSpecialRules: SpecialRule[];
}): SpecialRule[] {
    return [...input.globalSpecialRules, ...input.puzzleSpecialRules];
}
