import { describe, it, expect, beforeEach } from 'vitest';
import { SystemSettings } from "../../../src/models/system-settings.model";
import { ExamConfigService } from "../../../src/services/exam-config.service";
import { SystemSettingsService } from "../../../src/services/system-settings.service";
import { HttpError } from "../../../src/utils/http-error";
import { buildExamConfig, buildSpecialRule } from "../../fixtures/exam-config.fixture";

describe("ExamConfigService", () => {

  const validConfig = buildExamConfig();

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

      try {
        await ExamConfigService.validateAndSave(invalidConfig);
        expect.unreachable("validateAndSave should have rejected");
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpError);
        expect(err.statusCode).toBe(400);
        // Pin the failure to testTitle, so the assertion cannot pass because
        // some unrelated field drifted out of the schema.
        expect(err.message).toContain('"path":["testTitle"]');
      }
    });

    it("should throw 400 Bad Request if startPassword is missing", async () => {
      const withoutEnv = JSON.parse(JSON.stringify(validConfig));
      delete withoutEnv.environmentVariables;

      try {
        await ExamConfigService.validateAndSave(withoutEnv);
        expect.unreachable("validateAndSave should have rejected");
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpError);
        expect(err.statusCode).toBe(400);
        expect(err.message).toContain('"path":["environmentVariables"]');
      }
    });
  });

  describe("restrictedUpdate", () => {
    it("updates existing questions, test cases and settings after initialization", async () => {
      await ExamConfigService.validateAndSave(validConfig);

      const updatedConfig = JSON.parse(JSON.stringify(validConfig));

      // Tunable fields are applied as submitted.
      updatedConfig.testTitle = "Renamed Exam";
      updatedConfig.sections[0].puzzles[0].title = "Three Sum";
      updatedConfig.sections[0].puzzles[0].timeLimit = 2000;
      updatedConfig.sections[0].puzzles[0].memoryLimit = 64000;
      updatedConfig.sections[0].puzzles[0].score = 150;
      updatedConfig.sections[0].puzzles[0].multiplier = 0.8;
      updatedConfig.sections[0].puzzles[0].subtasks[0].score = 75;
      updatedConfig.sections[0].puzzles[0].subtasks[0].visible[0].input = "updated input";
      updatedConfig.sections[0].puzzles[0].subtasks[0].hidden[0].output = "updated output";
      updatedConfig.environmentVariables.EXTRA_FLAG = "updated";
      updatedConfig.globalSpecialRules = [buildSpecialRule()];
      updatedConfig.sections[0].puzzles[0].specialRules = [buildSpecialRule({ id: "puzzle-rule" })];

      const result = await ExamConfigService.restrictedUpdate(updatedConfig);

      expect(result.testTitle).toBe("Renamed Exam");
      expect(result.sections[0].puzzles[0].title).toBe("Three Sum");
      expect(result.sections[0].puzzles[0].timeLimit).toBe(2000);
      expect(result.sections[0].puzzles[0].memoryLimit).toBe(64000);
      expect(result.sections[0].puzzles[0].score).toBe(150);
      expect(result.sections[0].puzzles[0].multiplier).toBe(0.8);
      expect(result.sections[0].puzzles[0].subtasks[0].score).toBe(75);
      expect(result.sections[0].puzzles[0].subtasks[0].visible[0].input).toBe("updated input");
      expect(result.sections[0].puzzles[0].subtasks[0].hidden[0].output).toBe("updated output");
      expect(result.environmentVariables.EXTRA_FLAG).toBe("updated");
      expect(result.globalSpecialRules?.[0].id).toBe("rule-no-eval");
      expect(result.sections[0].puzzles[0].specialRules?.[0].id).toBe("puzzle-rule");
      expect(result.environmentVariables.startPassword).toBe("exam-start-password");
      expect((await SystemSettingsService.getExamConfig()).environmentVariables.EXTRA_FLAG).toBe("updated");
    });

    it("rejects locked fields once a config exists", async () => {
      await ExamConfigService.validateAndSave(validConfig);

      const structuralChanges: Array<[string, (config: any) => void]> = [
        ["visible test case count", (c) =>
          c.sections[0].puzzles[0].subtasks[0].visible.push({ input: "9 9", output: "18" })],
        ["hidden test case count", (c) =>
          c.sections[0].puzzles[0].subtasks[0].hidden.push({ input: "9 9", output: "18" })],
        ["subtask count", (c) =>
          c.sections[0].puzzles[0].subtasks.push(
            JSON.parse(JSON.stringify(c.sections[0].puzzles[0].subtasks[0]))
          )],
        ["puzzle count", (c) =>
          c.sections[0].puzzles.push(JSON.parse(JSON.stringify(c.sections[0].puzzles[0])))],
        ["section count", (c) =>
          c.sections.push(JSON.parse(JSON.stringify(c.sections[0])))],
        ["section id", (c) => { c.sections[0].id = "S99"; }],
        ["section title", (c) => { c.sections[0].title = "Changed section"; }],
        ["section description", (c) => { c.sections[0].description = "Changed"; }],
        ["section max score", (c) => { c.sections[0].maxScore = 500; }],
        ["puzzle id", (c) => { c.sections[0].puzzles[0].id = "Q99"; }],
        ["puzzle language", (c) => { c.sections[0].puzzles[0].language = "Cpp"; }],
        ["student name", (c) => { c.accessibleUsers[0].name = "Changed"; }],
        ["student IP", (c) => { c.accessibleUsers[0].ip = "10.0.0.10"; }],
        ["start password", (c) => { c.environmentVariables.startPassword = "changed"; }],
      ];

      for (const [label, mutate] of structuralChanges) {
        const payload = JSON.parse(JSON.stringify(validConfig));
        mutate(payload);

        try {
          await ExamConfigService.restrictedUpdate(payload);
          expect.unreachable(`restrictedUpdate should reject a change to ${label}`);
        } catch (err: any) {
          expect(err, label).toBeInstanceOf(HttpError);
          expect(err.statusCode, label).toBe(400);
        }
        expect(await SystemSettingsService.getExamConfig()).toEqual(validConfig);
      }
    });

    it("should throw 404 if no existing config is found", async () => {
      await expect(
        ExamConfigService.restrictedUpdate(validConfig)
      ).rejects.toThrowError(HttpError);
    });
  });
});
