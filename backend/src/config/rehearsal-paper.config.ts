import { examConfigSchema, type ExamConfig } from "../schemas/config.schema";

/**
 * The paper the rehearsal sits, and the two submissions it sits it with.
 *
 * Typed as the production `ExamConfig` and parsed at module load, so a change
 * to the paper schema breaks the build here rather than rotting quietly. That
 * is not a stylistic preference: duplicated, untyped fixtures drifted from the
 * schema for two months in 2026 before anyone noticed, because nothing was
 * watching them.
 */

/** Distinctive enough that it cannot collide with a real student number. */
export const REHEARSAL_STUDENT_ID = "__rehearsal__";
export const REHEARSAL_SECTION_ID = "__rehearsal_section__";
export const REHEARSAL_PUZZLE_AC = "rehearsal-ac";
export const REHEARSAL_PUZZLE_WA = "rehearsal-wa";

/** Full marks for the correct submission; the wrong one must score zero. */
export const REHEARSAL_PUZZLE_SCORE = 100;

const additionProblem = (id: string) => ({
  id,
  title: "Rehearsal Addition",
  score: REHEARSAL_PUZZLE_SCORE,
  language: "C" as const,
  timeLimit: 5_000,
  memoryLimit: 65_536,
  subtasks: [
    {
      title: "sums",
      score: REHEARSAL_PUZZLE_SCORE,
      visible: [
        { input: "2 3\n", output: "5\n" },
        { input: "10 -4\n", output: "6\n" },
      ],
      hidden: [],
    },
  ],
});

const paper: ExamConfig = examConfigSchema.parse({
  testTitle: "Post-Deployment Rehearsal",
  description: "A minimal exam used to verify a fresh deployment. Erased when the rehearsal finishes.",
  submitGraceSeconds: 60,
  judgerSettings: {
    timeLimit: 5_000,
    memoryLimit: 65_536,
    compareMode: "strict",
    /* maxConcurrentJobs is deliberately absent. It is a property of the
     * machine, measured by whoever deployed it; a rehearsal has no standing to
     * overwrite that, and the schema default keeps the deployed value's own
     * resolution path intact. */
  },
  environmentVariables: {
    /* Never used to start anything — the rehearsal drives the phase directly —
     * but the schema requires it, and rightly so: a paper that can be deployed
     * without one is how an exam ends up unprotected. */
    startPassword: "rehearsal-only-not-a-real-password",
  },
  /* No `ip`. The roster entry carries no assigned seat, so `AuthService`'s
   * source-address check short-circuits on `if (user.ipAddress)` and the
   * simulated student logs in the way the anti-cheat rules already allow.
   * Giving the rehearsal its own bypass would leave a boolean in production
   * code that something else eventually sets. */
  accessibleUsers: [
    { id: REHEARSAL_STUDENT_ID, name: "Rehearsal Student" },
  ],
  sections: [
    {
      id: REHEARSAL_SECTION_ID,
      title: "Rehearsal",
      maxScore: REHEARSAL_PUZZLE_SCORE * 2,
      puzzles: [additionProblem(REHEARSAL_PUZZLE_AC), additionProblem(REHEARSAL_PUZZLE_WA)],
    },
  ],
});

export const REHEARSAL_EXAM_CONFIG: ExamConfig = paper;

/** Reads two integers and prints their sum. Must be judged AC. */
export const REHEARSAL_CODE_CORRECT = `#include <stdio.h>
int main(void) {
    long a, b;
    if (scanf("%ld %ld", &a, &b) != 2) return 1;
    printf("%ld\\n", a + b);
    return 0;
}
`;

/**
 * Subtracts instead of adding. Must be judged WA, attributed to the
 * submission.
 *
 * A rehearsal that only ever exercises the success path cannot tell a working
 * judger from one that calls every failure a compile error — which is the
 * failure this project actually had.
 */
export const REHEARSAL_CODE_WRONG = `#include <stdio.h>
int main(void) {
    long a, b;
    if (scanf("%ld %ld", &a, &b) != 2) return 1;
    printf("%ld\\n", a - b);
    return 0;
}
`;
