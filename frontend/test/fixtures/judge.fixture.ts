import type { BackendHealth, Runtime } from '../../src/types/judge-settings';
import type { ExamConfig } from '../../src/types/config';

/** Recorded from a live Piston instance — note c++ carries the alias cpp. */
export const FULL_RUNTIMES: Runtime[] = [
  { language: 'c', version: '10.2.0', aliases: ['gcc'] },
  { language: 'c++', version: '10.2.0', aliases: ['cpp', 'g++'] },
  { language: 'python', version: '3.12.0', aliases: ['py', 'py3'] },
  { language: 'java', version: '20.0.2', aliases: [] },
  { language: 'javascript', version: '20.1.0', aliases: ['node', 'js'] },
];

/** The condition that actually occurred: only the C family installed. */
export const C_ONLY_RUNTIMES: Runtime[] = [
  { language: 'c', version: '10.2.0', aliases: ['gcc'] },
  { language: 'c++', version: '10.2.0', aliases: ['cpp', 'g++'] },
];

export const reachable = (runtimes: Runtime[]): BackendHealth => ({
  reachable: true,
  url: 'http://localhost:2000',
  runtimes,
  checkedAt: 1_700_000_000_000,
});

export const unreachable = (): BackendHealth => ({
  reachable: false,
  url: 'http://localhost:2000',
  runtimes: [],
  checkedAt: 1_700_000_000_000,
  error: 'ECONNREFUSED',
});

/** An exam paper requiring the given languages, as the config names them. */
export const examRequiring = (...languages: string[]): ExamConfig =>
  ({
    testTitle: 'Test Exam',
    description: '',
    judgerSettings: { timeLimit: 5000, memoryLimit: 256, compareMode: 'loose' },
    environmentVariables: { startPassword: 'x' },
    accessibleUsers: [],
    sections: [
      {
        id: 'S1',
        title: 'Section 1',
        puzzles: languages.map((language, i) => ({
          id: `Q${i + 1}`,
          title: `Q${i + 1}`,
          score: 100,
          language,
          subtasks: [],
        })),
      },
    ],
  }) as unknown as ExamConfig;
