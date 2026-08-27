import { describe, it, expect, beforeEach, vi } from "vitest";
import { User } from "../../../src/models/user.model";
import { ScoreBoard } from "../../../src/models/score-board.model";
import { Submission } from "../../../src/models/submission.model";
import { JudgerService } from "../../../src/services/judger.service";
import { ExamConfig } from "../../../src/schemas/config.schema";
import { buildExamConfig } from "../../fixtures/exam-config.fixture";
import { createMockPayload, setupTestUser } from "../../fixtures/mockFactories";
import * as fx from "../../fixtures/judge-verdicts.fixture";
import { JUDGE_DEFAULTS } from "../../../src/config/judge.config";


// Sandbox behaviour is driven through these; the global piston mock in
// test/setup.ts is overridden here so each scenario can script a response.
const mockExecute = vi.fn();
const mockJudge = vi.fn();

// `...actual` is not optional here: the judging service now reads
// FaultAttribution and StatusCode from this module to decide whether a verdict
// is scored or retried. Replacing the module wholesale leaves those undefined,
// and every attribution comparison silently becomes false.
vi.mock('piston-judger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('piston-judger')>();
  return {
    ...actual,
    pistonJudger: () => ({
      execute: mockExecute,
      judge: mockJudge,
    })
  };
});

const mockExamConfig = {
  testTitle: 'Test Exam',
  sections: [
    {
      puzzles: [
        {
          id: 'Q1',
          subtasks: [
            {
              score: 100,
              visible: [{ input: '1', output: '1' }],
              hidden: [{ input: '2', output: '2' }]
            }
          ]
        }
      ]
    }
  ]
} as unknown as ExamConfig;

describe("JudgerService syncScoreBoard", () => {

  beforeEach(async () => {
    await Submission.destroy({ where: {} });
    await ScoreBoard.destroy({ where: {} });
    await User.destroy({ where: {} });
  });

  it("should calculate score correctly and apply section maxScore caps", async () => {
    const testId = "student-123";
    await User.create({ uuid: testId, testId, name: "Student 1" });

    // Mock exam configuration with a section score cap
    const mockConfig: ExamConfig = buildExamConfig({
      testTitle: "Cap Exam",
      description: "Exam with capped section scores",
      accessibleUsers: [{ id: testId, name: "Student 1" }],
      sections: [
        {
          id: "S1",
          title: "Section 1",
          maxScore: 80, // Cap is 80!
          puzzles: [
            {
              id: "Q1",
              title: "Question 1",
              score: 50,
              language: "Python",
              subtasks: [{ title: "Subtask 1", score: 50, visible: [], hidden: [] }]
            },
            {
              id: "Q2",
              title: "Question 2",
              score: 50,
              language: "Python",
              subtasks: [{ title: "Subtask 1", score: 50, visible: [], hidden: [] }]
            }
          ]
        },
        {
          id: "S2",
          title: "Section 2",
          maxScore: 100, // Cap is 100
          puzzles: [
            {
              id: "Q3",
              title: "Question 3",
              score: 50,
              language: "Python",
              subtasks: [{ title: "Subtask 1", score: 50, visible: [], hidden: [] }]
            }
          ]
        }
      ]
    });

    // Submissions:
    // Q1 gets 50 points
    // Q2 gets 50 points
    // Q3 gets 50 points
    // Total raw for S1: 100 points, capped to 80 points
    // Total raw for S2: 50 points, capped to 50 points (not reaching limit)
    // Overall score should be 80 + 50 = 130!
    await Submission.create({
      testId,
      questionId: "Q1",
      language: "Python",
      codeContent: "pass",
      status: "Graded",
      autoScore: 50
    });

    await Submission.create({
      testId,
      questionId: "Q2",
      language: "Python",
      codeContent: "pass",
      status: "Graded",
      autoScore: 50
    });

    await Submission.create({
      testId,
      questionId: "Q3",
      language: "Python",
      codeContent: "pass",
      status: "Graded",
      autoScore: 50
    });

    // Mock results for subtasks
    const latestResults = {
      Q1: { subtasks: [{ visible: [{ status: "AC" }], hidden: [{ status: "AC" }] }], specialRuleResults: [] },
      Q2: { subtasks: [{ visible: [{ status: "AC" }], hidden: [{ status: "AC" }] }], specialRuleResults: [] },
      Q3: { subtasks: [{ visible: [{ status: "AC" }], hidden: [{ status: "AC" }] }], specialRuleResults: [] }
    };

    await JudgerService.syncScoreBoard(testId, latestResults, mockConfig);

    const sb = await ScoreBoard.findOne({ where: { testId } });
    expect(sb).not.toBeNull();
    expect(sb!.score).toBe(130); // 80 capped from S1 + 50 from S2
    expect(sb!.puzzleAmount).toBe(3);
    expect(sb!.passedPuzzleAmount).toBe(3);
    expect(sb!.subtaskAmount).toBe(3);
    expect(sb!.passedSubtaskAmount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// US1 — a system failure is never charged to the student
// ---------------------------------------------------------------------------

const seedSubmission = async (testId = "test_123", questionId = "Q1") => {
  await setupTestUser(testId);
  return Submission.create({
    testId,
    questionId,
    codeContent: "int main(){}",
    language: "c",
    status: "Pending",
  });
};

/** Script every attempt to yield the same verdict. */
const alwaysJudge = (verdict: unknown) => {
  mockExecute.mockResolvedValue(fx.executionOk());
  mockJudge.mockReturnValue(verdict);
};

describe("US1 - system failures are not charged to the student", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not mark a submission graded when the compile stage was killed", async () => {
    const sub = await seedSubmission();
    alwaysJudge(fx.compileTimedOut());

    const outcome = await JudgerService.processSingleSubmission(sub, mockExamConfig as any);

    expect(outcome.systemFailure).toBe(true);
    const stored = await Submission.findOne({ where: { testId: "test_123", questionId: "Q1" } });
    expect(stored!.status).toBe("SystemError");
    expect(stored!.autoScore).toBeNull();
  });

  it("leaves an existing score untouched rather than zeroing it", async () => {
    // The distinction matters: a score of 0 is a statement about the student's
    // work. A system failure is a statement about the machine.
    const sub = await seedSubmission();
    await Submission.update({ status: "Graded", autoScore: 80 }, { where: { id: sub.id } });
    alwaysJudge(fx.compileTimedOut());

    await JudgerService.processSingleSubmission(sub, mockExamConfig as any);

    const stored = await Submission.findOne({ where: { id: sub.id } });
    expect(stored!.status).toBe("SystemError");
    expect(stored!.autoScore).toBeNull();
  });

  it("retries a system-attributed verdict up to the configured maximum", async () => {
    const sub = await seedSubmission();
    alwaysJudge(fx.compileTimedOut());

    await JudgerService.processSingleSubmission(sub, mockExamConfig as any);

    // Two test cases (one visible, one hidden), each attempted 1 + maxRetries.
    const attemptsPerCase = 1 + JUDGE_DEFAULTS.maxSystemRetries;
    expect(mockExecute).toHaveBeenCalledTimes(attemptsPerCase * 2);
  });

  it("stops retrying as soon as a verdict becomes the submission's", async () => {
    const sub = await seedSubmission();
    mockExecute.mockResolvedValue(fx.executionOk());
    mockJudge
      .mockReturnValueOnce(fx.compileTimedOut())   // system -> retry
      .mockReturnValue(fx.accepted("1"));          // submission -> stop

    await JudgerService.processSingleSubmission(sub, mockExamConfig as any);

    // 2 for the first case (one retry), 1 for the second.
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it("never retries a genuine compilation error", async () => {
    // Guards the opposite failure: a change that blames the system for
    // everything would pass the tests above and be just as wrong.
    const sub = await seedSubmission();
    alwaysJudge(fx.compileError());

    const outcome = await JudgerService.processSingleSubmission(sub, mockExamConfig as any);

    expect(outcome.systemFailure).toBe(false);
    expect(mockExecute).toHaveBeenCalledTimes(2); // one per test case, no retries
    const stored = await Submission.findOne({ where: { id: sub.id } });
    expect(stored!.status).toBe("Graded");
  });

  it("judges an unreachable backend without a pre-check and without throwing", async () => {
    const sub = await seedSubmission();
    mockExecute.mockResolvedValue(fx.executionFailed());
    mockJudge.mockReturnValue(fx.backendUnreachable());

    const outcome = await JudgerService.processSingleSubmission(sub, mockExamConfig as any);

    // The failure arm went straight into judge(); the service inspected nothing.
    expect(mockJudge).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false }),
      expect.anything(),
    );
    expect(outcome.systemFailure).toBe(true);
  });

  it("records attribution on every test-case result", async () => {
    const sub = await seedSubmission();
    alwaysJudge(fx.accepted("1"));

    const outcome = await JudgerService.processSingleSubmission(sub, mockExamConfig as any);

    expect(outcome.result.subtasks[0].visible[0].attribution).toBe("submission");
  });

  it("does not score a submission whose cases mix system and student failures", async () => {
    const sub = await seedSubmission();
    mockExecute.mockResolvedValue(fx.executionOk());
    mockJudge
      .mockReturnValueOnce(fx.wrongAnswer())        // student's failure
      .mockReturnValue(fx.compileTimedOut());       // then the machine dies

    const outcome = await JudgerService.processSingleSubmission(sub, mockExamConfig as any);

    // Partially evaluated is not evaluated.
    expect(outcome.systemFailure).toBe(true);
    const stored = await Submission.findOne({ where: { id: sub.id } });
    expect(stored!.status).toBe("SystemError");
  });

  it("passes the configured compile allowance to the execution backend", async () => {
    // The allowance that used to default silently inside the dependency.
    const sub = await seedSubmission();
    alwaysJudge(fx.accepted("1"));

    await JudgerService.processSingleSubmission(sub, mockExamConfig as any);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ compile_timeout: JUDGE_DEFAULTS.compileTimeout }),
    );
  });
});

describe("JudgerService - system errors surface as SE, not as student failures", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports a sandbox permission failure as a system fault", async () => {
    const sub = await seedSubmission("test_fs");
    mockExecute.mockResolvedValue(fx.executionFailed());
    mockJudge.mockReturnValue(fx.backendUnreachable());

    const outcome = await JudgerService.processSingleSubmission(sub, mockExamConfig as any);

    expect(outcome.result.subtasks[0].visible[0].status).toBe("SE");
    expect(outcome.result.subtasks[0].visible[0].attribution).toBe("system");
  });
});

describe("JudgerService - Timeout (TLE) stays the student's failure", () => {
  beforeEach(() => vi.clearAllMocks());

  it("attributes a run-stage timeout to the submission, unlike a compile timeout", async () => {
    const sub = await seedSubmission("test_tle");
    alwaysJudge({
      status: "TLE",
      attribution: "submission",
      message: "Time Limit Exceeded",
      actualOutput: "",
      details: { attribution: "submission", stage: "run" },
    });

    const outcome = await JudgerService.processSingleSubmission(sub, mockExamConfig as any);

    expect(outcome.systemFailure).toBe(false);
    expect(outcome.result.subtasks[0].visible[0].status).toBe("TLE");
    expect(mockExecute).toHaveBeenCalledTimes(2); // the run allowance IS the question; no retry
  });
});

describe("JudgerService - Output Truncation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("truncates an enormous output before it is stored", async () => {
    const sub = await seedSubmission("test_trunc");
    alwaysJudge({ ...fx.accepted("X".repeat(50000)) });

    const outcome = await JudgerService.processSingleSubmission(sub, mockExamConfig as any);

    const stored = outcome.result.subtasks[0].visible[0].userOutput;
    expect(stored.length).toBeLessThan(50000);
    expect(stored).toContain("[Output Truncated]");
  });
});
