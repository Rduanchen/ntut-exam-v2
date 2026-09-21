import { describe, expect, it } from 'vitest';
import { examConfigSchema } from '../../../src/schemas/config.schema';
import { JUDGE_DEFAULTS } from '../../../src/config/judge.config';
import {
  REHEARSAL_CODE_CORRECT,
  REHEARSAL_CODE_WRONG,
  REHEARSAL_EXAM_CONFIG,
  REHEARSAL_PUZZLE_AC,
  REHEARSAL_PUZZLE_SCORE,
  REHEARSAL_PUZZLE_WA,
  REHEARSAL_STUDENT_ID,
} from '../../../src/config/rehearsal-paper.config';

describe('the rehearsal paper', () => {
  it('is a valid exam configuration by the production schema', () => {
    expect(examConfigSchema.safeParse(REHEARSAL_EXAM_CONFIG).success).toBe(true);
  });

  it('assigns no IP to its student', () => {
    /* This is how the simulated student passes the anti-cheat source check:
     * `AuthService` short-circuits on `if (user.ipAddress)`, so an unassigned
     * seat is already permitted. Adding an IP here would make the rehearsal
     * depend on where the backend happens to run; adding a bypass to
     * AuthService would leave a switch in production that something else
     * eventually flips. */
    expect(REHEARSAL_EXAM_CONFIG.accessibleUsers).toHaveLength(1);
    expect(REHEARSAL_EXAM_CONFIG.accessibleUsers[0].id).toBe(REHEARSAL_STUDENT_ID);
    expect(REHEARSAL_EXAM_CONFIG.accessibleUsers[0].ip).toBeUndefined();
  });

  it('carries one puzzle that must pass and one that must fail', () => {
    const ids = REHEARSAL_EXAM_CONFIG.sections.flatMap((section) => section.puzzles.map((p) => p.id));
    expect(ids).toEqual([REHEARSAL_PUZZLE_AC, REHEARSAL_PUZZLE_WA]);
  });

  it('gives both puzzles deterministic test cases and a known full score', () => {
    for (const puzzle of REHEARSAL_EXAM_CONFIG.sections[0].puzzles) {
      expect(puzzle.score).toBe(REHEARSAL_PUZZLE_SCORE);
      expect(puzzle.subtasks[0].visible.length).toBeGreaterThan(0);
      for (const testCase of puzzle.subtasks[0].visible) {
        expect(testCase.input.trim().length).toBeGreaterThan(0);
        expect(testCase.output.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('requires a start password, as every deployable paper must', () => {
    expect(REHEARSAL_EXAM_CONFIG.environmentVariables.startPassword.length).toBeGreaterThan(0);
  });

  it('does not overwrite the machine-measured concurrency ceiling', () => {
    /* maxConcurrentJobs describes the hardware, not the paper. The rehearsal
     * has no standing to decide it, so the value must come from the schema
     * default and keep the deployment's own resolution path intact. */
    expect(REHEARSAL_EXAM_CONFIG.judgerSettings.maxConcurrentJobs).toBe(JUDGE_DEFAULTS.maxConcurrentJobs);
  });

  it('ships a correct and an incorrect submission that differ', () => {
    expect(REHEARSAL_CODE_CORRECT).toContain('a + b');
    expect(REHEARSAL_CODE_WRONG).toContain('a - b');
    expect(REHEARSAL_CODE_CORRECT).not.toBe(REHEARSAL_CODE_WRONG);
  });
});
