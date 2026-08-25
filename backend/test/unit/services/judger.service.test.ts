import { describe, it, expect, beforeEach, vi } from "vitest";
import { User } from "../../../src/models/user.model";
import { ScoreBoard } from "../../../src/models/score-board.model";
import { Submission } from "../../../src/models/submission.model";
import { JudgerService } from "../../../src/services/judger.service";
import { ExamConfig } from "../../../src/schemas/config.schema";
import { buildExamConfig } from "../../fixtures/exam-config.fixture";
import { createMockPayload, setupTestUser } from "../../fixtures/mockFactories";

// Sandbox behaviour is driven through these; the global piston mock in
// test/setup.ts is overridden here so each scenario can script a response.
const mockExecute = vi.fn();
const mockJudge = vi.fn();

vi.mock('piston-judger', () => {
  return {
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

describe('JudgerService - Filesystem Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle permission denied errors from sandbox execution and return SE status', async () => {
    const maliciousPayload = createMockPayload({
      code: 'import os; os.system("cat /etc/passwd")',
      language: 'python'
    });

    await setupTestUser('test_123');

    const sub = await Submission.create({
      testId: 'test_123',
      questionId: 'Q1',
      codeContent: maliciousPayload.code,
      language: maliciousPayload.language,
      status: 'Pending'
    });

    // Simulate Piston returning a permission denied / system error
    mockExecute.mockResolvedValue({
      success: false,
      error: 'Permission denied: /etc/passwd',
      run: null
    });

    const result = await JudgerService.processSingleSubmission(sub, mockExamConfig as any);

    expect(mockExecute).toHaveBeenCalled();
    expect(result.subtasks[0].visible[0].status).toBe('SE');
    expect(result.subtasks[0].visible[0].message).toContain('Permission denied');
  });
});

describe('JudgerService - Network Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle network timeout/block errors from sandbox and return SE status', async () => {
    const maliciousPayload = createMockPayload({
      code: 'import urllib.request; urllib.request.urlopen("http://google.com")',
      language: 'python'
    });

    await setupTestUser('test_123');

    const sub = await Submission.create({
      testId: 'test_123',
      questionId: 'Q1',
      codeContent: maliciousPayload.code,
      language: maliciousPayload.language,
      status: 'Pending'
    });

    // Simulate Piston returning a network unreachable / timeout error
    mockExecute.mockResolvedValue({
      success: false,
      error: 'Network is unreachable',
      run: null
    });

    const result = await JudgerService.processSingleSubmission(sub, mockExamConfig as any);

    expect(mockExecute).toHaveBeenCalled();
    expect(result.subtasks[0].visible[0].status).toBe('SE');
    expect(result.subtasks[0].visible[0].message).toContain('Network is unreachable');
  });
});

describe('JudgerService - Timeout (TLE)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle infinite loops and return TLE status without hanging', async () => {
    const maliciousPayload = createMockPayload({
      code: 'while True: pass',
      language: 'python'
    });

    await setupTestUser('test_123');

    const sub = await Submission.create({
      testId: 'test_123',
      questionId: 'Q1',
      codeContent: maliciousPayload.code,
      language: maliciousPayload.language,
      status: 'Pending'
    });

    // Simulate Piston stopping the execution due to timeout
    mockExecute.mockResolvedValue({
      success: true,
      run: {
        output: '',
        stdout: '',
        stderr: ''
      }
    });

    mockJudge.mockReturnValue({
      status: 'TLE',
      actualOutput: '',
      details: {
        runInfo: { wallTime: '10000' }
      }
    });

    const result = await JudgerService.processSingleSubmission(sub, mockExamConfig as any);

    expect(mockExecute).toHaveBeenCalled();
    expect(result.subtasks[0].visible[0].status).toBe('TLE');
  });
});

describe('JudgerService - Output Truncation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should truncate extremely large outputs from the sandbox to prevent freezing', async () => {
    const maliciousPayload = createMockPayload({
      code: 'print("A" * 10000000)',
      language: 'python'
    });

    await setupTestUser('test_123');

    const sub = await Submission.create({
      testId: 'test_123',
      questionId: 'Q1',
      codeContent: maliciousPayload.code,
      language: maliciousPayload.language,
      status: 'Pending'
    });

    // Simulate Piston returning a massive output string
    const hugeOutput = "A".repeat(10000000);
    mockExecute.mockResolvedValue({
      success: true,
      run: {
        output: hugeOutput,
        stdout: hugeOutput,
        stderr: ''
      }
    });

    mockJudge.mockReturnValue({
      status: 'WA',
      actualOutput: hugeOutput,
      details: {
        runInfo: { wallTime: '10' }
      }
    });

    const result = await JudgerService.processSingleSubmission(sub, mockExamConfig as any);

    expect(mockExecute).toHaveBeenCalled();
    const formattedOutput = result.subtasks[0].visible[0].userOutput;
    
    // Default truncation limit is 5000 in judger.service.ts
    // Plus the length of "\n...[Output Truncated]" which is 22 chars
    expect(formattedOutput.length).toBeLessThanOrEqual(5000 + 30);
    expect(formattedOutput).toContain('[Output Truncated]');
  });
});
