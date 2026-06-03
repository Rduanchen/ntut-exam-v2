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
import { ExamConfigService } from "../src/services/exam-config.service";
import { InitService } from "../src/services/init.service";
import { StatusCode } from "piston-judger/dist/judger.js";

describe("InitService", () => {
  let testSequelize: Sequelize;

  const validConfig = {
    testTitle: "NTUT Midterm Exam",
    description: "Midterm exam for NTUT students",
    judgerSettings: {
      timeLimit: 5000,
      memoryLimit: 65536
    },
    accessibleUsers: [
      { id: "109590001", name: "Alice", ip: "192.168.1.10" },
      { id: "109590002", name: "Bob" }
    ],
    sections: [
      {
        id: "S1",
        title: "Section 1",
        maxScore: 100,
        puzzles: [
          {
            id: "Q1",
            title: "Two Sum",
            score: 100,
            language: "Python",
            timeLimit: 1000,
            memoryLimit: 32768,
            subtasks: [
              {
                title: "Subtask 1",
                score: 50,
                visible: [{ input: "1 2", output: "3" }],
                hidden: [{ input: "3 4", output: "7" }]
              }
            ]
          }
        ]
      }
    ]
  };

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
    // Wiping tables before each test case
    await Submission.destroy({ where: {} });
    await ScoreBoard.destroy({ where: {} });
    await ViolationLog.destroy({ where: {} });
    await UserActionLog.destroy({ where: {} });
    await Message.destroy({ where: {} });
    await User.destroy({ where: {} });
    await DeviceKeyMap.destroy({ where: {} });
    await SystemSettings.destroy({ where: {} });
  });

  describe("checkInitStatus", () => {
    it("should return false status when clean", async () => {
      const status = await InitService.checkInitStatus();
      expect(status.hasConfig).toBe(false);
      expect(status.initializedUserCount).toBe(0);
      expect(status.isInitialized).toBe(false);
    });

    it("should return true for hasConfig after config is uploaded", async () => {
      await ExamConfigService.validateAndSave(validConfig);
      const status = await InitService.checkInitStatus();
      expect(status.hasConfig).toBe(true);
      expect(status.initializedUserCount).toBe(0);
      expect(status.isInitialized).toBe(false);
    });
  });

  describe("performInitialization & wipeAllData", () => {
    it("should perform full database initialization and reset successfully", async () => {
      // Step 1: Upload configuration
      await ExamConfigService.validateAndSave(validConfig);

      // Step 2: Initialize
      await InitService.performInitialization();

      // Step 3: Verify created users and IP configurations
      const users = await User.findAll();
      expect(users).toHaveLength(2);

      const alice = users.find(u => u.name === "Alice");
      expect(alice).toBeDefined();
      expect(alice!.testId).toBe("109590001");
      expect(alice!.ipAddress).toBe("192.168.1.10");
      expect(alice!.deviceUuid).not.toBeNull();

      // Check DeviceKeyMap binding
      const device = await DeviceKeyMap.findOne({ where: { deviceUuid: alice!.deviceUuid } });
      expect(device).not.toBeNull();
      expect(device!.ipAddress).toBe("192.168.1.10");

      const bob = users.find(u => u.name === "Bob");
      expect(bob).toBeDefined();
      expect(bob!.testId).toBe("109590002");
      expect(bob!.ipAddress).toBeNull();
      expect(bob!.deviceUuid).toBeNull(); // IP-less Bob should not have pre-allocated device uuid

      // Step 4: Verify default scoreboards generated
      const scoreboards = await ScoreBoard.findAll();
      expect(scoreboards).toHaveLength(2);
      
      const aliceScoreboard = scoreboards.find(s => s.testId === "109590001");
      expect(aliceScoreboard).toBeDefined();
      expect(aliceScoreboard!.score).toBe(0);
      
      const puzzleResults: any = aliceScoreboard!.puzzleResults;
      expect(puzzleResults).toHaveProperty("Q1");
      expect(puzzleResults.Q1.subtasks).toHaveLength(1);
      expect(puzzleResults.Q1.subtasks[0].visible).toHaveLength(1);
      expect(puzzleResults.Q1.subtasks[0].visible[0].status).toBe(StatusCode.WA);

      // Step 5: Test wipeAllData
      await InitService.wipeAllData();

      // Verify clean DB status
      const statusAfterWipe = await InitService.checkInitStatus();
      expect(statusAfterWipe.initializedUserCount).toBe(0);
      expect(statusAfterWipe.isInitialized).toBe(false);

      expect(await User.count()).toBe(0);
      expect(await DeviceKeyMap.count()).toBe(0);
      expect(await ScoreBoard.count()).toBe(0);
    });
  });
});
