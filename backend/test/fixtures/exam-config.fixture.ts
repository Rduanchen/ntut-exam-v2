import type { ExamConfig, SpecialRule } from '../../src/schemas/config.schema';
import { JUDGE_DEFAULTS } from '../../src/config/judge.config';

/**
 * Single source of truth for a valid exam configuration in tests.
 *
 * The return type is the production `ExamConfig`, so a schema change breaks
 * compilation (`tsc -p tsconfig.test.json`, wired into `npm run test`) instead
 * of rotting silently — which is exactly how the fixtures duplicated across
 * test files drifted for two months before 2026-08-23.
 */
export const buildExamConfig = (overrides: Partial<ExamConfig> = {}): ExamConfig => ({
  testTitle: 'NTUT Midterm Exam',
  description: 'Midterm exam for NTUT students',
  submitGraceSeconds: 60,
  judgerSettings: {
    timeLimit: 5000,
    memoryLimit: 65536,
    compareMode: 'loose',
    // From the resolver's own defaults, so this fixture cannot drift from the
    // values the system actually applies. The type check just proved the point:
    // adding four schema fields broke compilation here immediately.
    ...JUDGE_DEFAULTS,
  },
  environmentVariables: {
    startPassword: 'exam-start-password',
  },
  accessibleUsers: [
    { id: '109590001', name: 'Alice', ip: '192.168.1.10' },
    { id: '109590002', name: 'Bob' },
  ],
  sections: [
    {
      id: 'S1',
      title: 'Section 1',
      maxScore: 100,
      puzzles: [
        {
          id: 'Q1',
          title: 'Two Sum',
          score: 100,
          language: 'Python',
          timeLimit: 1000,
          memoryLimit: 32768,
          subtasks: [
            {
              title: 'Subtask 1',
              score: 50,
              visible: [{ input: '1 2', output: '3' }],
              hidden: [{ input: '3 4', output: '7' }],
            },
            {
              title: 'Subtask 2',
              score: 50,
              visible: [],
              hidden: [{ input: '-1 1', output: '0' }],
            },
          ],
        },
      ],
    },
  ],
  ...overrides,
});

/** Deep clone, for tests that mutate a config before submitting it. */
export const cloneExamConfig = (config: ExamConfig): ExamConfig =>
  JSON.parse(JSON.stringify(config));

export const buildSpecialRule = (overrides: Partial<SpecialRule> = {}): SpecialRule => ({
  id: 'rule-no-eval',
  type: 'regex',
  constraint: 'MUST_NOT_HAVE',
  message: 'eval() is not allowed',
  severity: 'warn',
  multiplier: 0.5,
  params: { pattern: 'eval\\(' },
  ...overrides,
});
