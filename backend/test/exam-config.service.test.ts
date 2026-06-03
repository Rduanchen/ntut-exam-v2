import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { Sequelize } from "sequelize-typescript";
import { SystemSettings } from "../src/models/system-settings.model";
import { ExamConfigService } from "../src/services/exam-config.service";
import { SystemSettingsService } from "../src/services/system-settings.service";
import { HttpError } from "../src/utils/http-error";

describe("ExamConfigService", () => {
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
              },
              {
                title: "Subtask 2",
                score: 50,
                visible: [],
                hidden: [{ input: "-1 1", output: "0" }]
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
      models: [SystemSettings],
      logging: false,
    });
    await testSequelize.sync();
  });

  afterAll(async () => {
    await testSequelize.close();
  });

  beforeEach(async () => {
    await SystemSettings.destroy({ where: {}, truncate: true });
  });

  describe("validateAndSave", () => {
    it("should save valid configuration successfully", async () => {
      const savedConfig = await ExamConfigService.validateAndSave(validConfig);
      expect(savedConfig.testTitle).toBe("NTUT Midterm Exam");

      const inDb = await SystemSettingsService.getExamConfig();
      expect(inDb).not.toBeNull();
      expect(inDb.testTitle).toBe("NTUT Midterm Exam");
    });

    it("should throw 400 Bad Request if validation fails", async () => {
      const invalidConfig = { ...validConfig, testTitle: 123 as any };
      await expect(
        ExamConfigService.validateAndSave(invalidConfig)
      ).rejects.toThrowError(HttpError);
    });
  });

  describe("restrictedUpdate", () => {
    it("should perform restricted update successfully, merging only allowed fields", async () => {
      // Step 1: Save baseline
      await ExamConfigService.validateAndSave(validConfig);

      // Step 2: Attempt restricted update with modified config
      const updatedConfig = JSON.parse(JSON.stringify(validConfig));
      
      // Allowed modifications:
      updatedConfig.sections[0].puzzles[0].timeLimit = 2000;
      updatedConfig.sections[0].puzzles[0].memoryLimit = 64000;
      updatedConfig.sections[0].puzzles[0].score = 150;
      updatedConfig.sections[0].puzzles[0].subtasks[0].score = 75;
      updatedConfig.sections[0].puzzles[0].subtasks[0].visible.push({ input: "9 9", output: "18" });

      // Disallowed modifications (should be ignored):
      updatedConfig.testTitle = "Hacked Title"; // Ignored (restricted merge only covers sections/puzzles)
      updatedConfig.sections[0].puzzles[0].title = "Three Sum"; // Ignored (only timeLimit, memoryLimit, score merged)

      const result = await ExamConfigService.restrictedUpdate(updatedConfig);

      // Check merged properties
      expect(result.testTitle).toBe("NTUT Midterm Exam"); // Retained from oldConfig
      expect(result.sections[0].puzzles[0].title).toBe("Two Sum"); // Retained from oldConfig
      expect(result.sections[0].puzzles[0].timeLimit).toBe(2000); // Updated
      expect(result.sections[0].puzzles[0].memoryLimit).toBe(64000); // Updated
      expect(result.sections[0].puzzles[0].score).toBe(150); // Updated
      expect(result.sections[0].puzzles[0].subtasks[0].score).toBe(75); // Updated
      expect(result.sections[0].puzzles[0].subtasks[0].visible).toHaveLength(2); // Updated
    });

    it("should throw 404 if no existing config is found", async () => {
      await expect(
        ExamConfigService.restrictedUpdate(validConfig)
      ).rejects.toThrowError(HttpError);
    });
  });
});
