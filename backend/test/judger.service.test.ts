import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { Sequelize } from "sequelize-typescript";
import { User } from "../src/models/user.model";
import { ScoreBoard } from "../src/models/score-board.model";
import { DeviceKeyMap } from "../src/models/device-key-map.model";
import { Submission } from "../src/models/submission.model";
import { ViolationLog } from "../src/models/violation-log.model";
import { UserActionLog } from "../src/models/user-action-log.model";
import { Message } from "../src/models/message.model";
import { SystemSettings } from "../src/models/system-settings.model";
import { JudgerService } from "../src/services/judger.service";
import { ExamConfig } from "../src/schemas/config.schema";

describe("JudgerService syncScoreBoard", () => {
  let testSequelize: Sequelize;

  beforeAll(async () => {
    testSequelize = new Sequelize({
      dialect: "sqlite",
      storage: ":memory:",
      models: [
        DeviceKeyMap,
        User,
        Submission,
        ScoreBoard,
        UserActionLog,
        ViolationLog,
        Message,
        SystemSettings
      ],
      logging: false,
    });
    await testSequelize.sync();
  });

  afterAll(async () => {
    await testSequelize.close();
  });

  beforeEach(async () => {
    await Submission.destroy({ where: {} });
    await ScoreBoard.destroy({ where: {} });
    await User.destroy({ where: {} });
  });

  it("should calculate score correctly and apply section maxScore caps", async () => {
    const testId = "student-123";
    await User.create({ uuid: testId, testId, name: "Student 1" });

    // Mock exam configuration with a section score cap
    const mockConfig: ExamConfig = {
      testTitle: "Cap Exam",
      description: "Exam with capped section scores",
      judgerSettings: { timeLimit: 1000, memoryLimit: 64 },
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
    };

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
