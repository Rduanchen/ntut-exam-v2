import { describe, it, expect, beforeEach } from 'vitest';
import { User } from "../../../src/models/user.model";
import { ScoreBoard } from "../../../src/models/score-board.model";
import { DeviceKeyMap } from "../../../src/models/device-key-map.model";
import { Submission } from "../../../src/models/submission.model";
import { ViolationLog } from "../../../src/models/violation-log.model";
import { UserActionLog } from "../../../src/models/user-action-log.model";
import { Message } from "../../../src/models/message.model";
import { SystemSettings } from "../../../src/models/system-settings.model";
import { LoginRequest } from "../../../src/models/login-request.model";
import { UnblockedDevice } from "../../../src/models/unblocked-device.model";
import { ExamConfigService } from "../../../src/services/exam-config.service";
import { InitService } from "../../../src/services/init.service";
import { StatusCode } from "piston-judger/dist/judger.js";
import { buildExamConfig } from "../../fixtures/exam-config.fixture";

describe("InitService", () => {

  const validConfig = buildExamConfig();

  beforeEach(async () => {
    // Wiping tables before each test case
    await Submission.destroy({ where: {} });
    await ScoreBoard.destroy({ where: {} });
    await ViolationLog.destroy({ where: {} });
    await UserActionLog.destroy({ where: {} });
    await Message.destroy({ where: {} });
    await User.destroy({ where: {} });
    await DeviceKeyMap.destroy({ where: {} });
    await LoginRequest.destroy({ where: {} });
    await UnblockedDevice.destroy({ where: {} });
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
      // Device key mapping is decoupled from user initialization: even a user
      // with a pre-assigned IP starts unbound and only gets a deviceUuid when
      // the client actually logs in.
      expect(alice!.deviceUuid).toBeNull();

      const bob = users.find(u => u.name === "Bob");
      expect(bob).toBeDefined();
      expect(bob!.testId).toBe("109590002");
      expect(bob!.ipAddress).toBeNull();
      expect(bob!.deviceUuid).toBeNull();

      // No DeviceKeyMap rows are pre-allocated during initialization.
      expect(await DeviceKeyMap.count()).toBe(0);

      // Step 4: Verify default scoreboards generated
      const scoreboards = await ScoreBoard.findAll();
      expect(scoreboards).toHaveLength(2);
      
      const aliceScoreboard = scoreboards.find(s => s.testId === "109590001");
      expect(aliceScoreboard).toBeDefined();
      expect(aliceScoreboard!.score).toBe(0);
      
      const puzzleResults: any = aliceScoreboard!.puzzleResults;
      expect(puzzleResults).toHaveProperty("Q1");
      expect(puzzleResults.Q1.subtasks).toHaveLength(2);
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
