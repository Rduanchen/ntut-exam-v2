export interface SubmissionAttrs {
  testId: string;
  questionId: string;
  language: string;
  codeContent: string;
  status: string;
  autoScore: number;
}

export const buildSubmission = (overrides: Partial<SubmissionAttrs> = {}): SubmissionAttrs => ({
  testId: '109590001',
  questionId: 'Q1',
  language: 'Python',
  codeContent: 'print(sum(map(int, input().split())))',
  status: 'Graded',
  autoScore: 50,
  ...overrides,
});

export interface ScoreBoardAttrs {
  testId: string;
  score: number;
  subtaskAmount: number;
  passedSubtaskAmount: number;
  puzzleAmount: number;
  passedPuzzleAmount: number;
  puzzleResults: Record<string, unknown>;
}

export const buildScoreBoard = (overrides: Partial<ScoreBoardAttrs> = {}): ScoreBoardAttrs => ({
  testId: '109590001',
  score: 0,
  subtaskAmount: 0,
  passedSubtaskAmount: 0,
  puzzleAmount: 0,
  passedPuzzleAmount: 0,
  puzzleResults: {},
  ...overrides,
});

export interface ViolationAttrs {
  testId: string;
  ipAddress: string | null;
  type: string;
  message: string;
  time: Date;
  isOk: boolean;
}

export const buildViolation = (overrides: Partial<ViolationAttrs> = {}): ViolationAttrs => ({
  testId: '109590001',
  ipAddress: '127.0.0.1',
  type: 'APP_ON_QUIT',
  message: 'Application quit unexpectedly',
  time: new Date(),
  isOk: false,
  ...overrides,
});
