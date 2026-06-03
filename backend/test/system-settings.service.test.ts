import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { Sequelize } from "sequelize-typescript";
import { SystemSettings } from "../src/models/system-settings.model";
import { SystemSettingsService, PROTECTED_SETTINGS_KEYS } from "../src/services/system-settings.service";
import { HttpError } from "../src/utils/http-error";

describe("SystemSettingsService", () => {
  let testSequelize: Sequelize;

  beforeAll(async () => {
    // Setup in-memory SQLite database for unit testing
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
    // Clear all settings before each test
    await SystemSettings.destroy({ where: {}, truncate: true });
  });

  describe("createSetting", () => {
    it("should successfully create a system setting", async () => {
      const key = "site_name";
      const value = { name: "NTUT Exam System", port: 8080 };

      await SystemSettingsService.createSetting(key, value);

      const record = await SystemSettings.findOne({ where: { name: key } });
      expect(record).not.toBeNull();
      expect(record!.value).toBe(JSON.stringify(value));
    });

    it("should throw 409 Conflict if the key already exists", async () => {
      const key = "conflict_key";
      await SystemSettingsService.createSetting(key, "first_value");

      await expect(
        SystemSettingsService.createSetting(key, "second_value")
      ).rejects.toThrowError(HttpError);

      try {
        await SystemSettingsService.createSetting(key, "second_value");
      } catch (err: any) {
        expect(err.statusCode).toBe(409);
        expect(err.message).toContain("Conflict");
      }
    });

    it("should throw 400 Bad Request if stringification fails", async () => {
      // Circular reference object to cause JSON.stringify to fail
      const circularValue: any = {};
      circularValue.self = circularValue;

      await expect(
        SystemSettingsService.createSetting("circular", circularValue)
      ).rejects.toThrowError(HttpError);

      try {
        await SystemSettingsService.createSetting("circular", circularValue);
      } catch (err: any) {
        expect(err.statusCode).toBe(400);
        expect(err.message).toContain("Bad Request");
      }
    });
  });

  describe("getSetting", () => {
    it("should successfully retrieve and parse a system setting", async () => {
      const key = "test_key";
      const value = { active: true, users: [1, 2, 3] };

      await SystemSettingsService.createSetting(key, value);

      const retrieved = await SystemSettingsService.getSetting<typeof value>(key);
      expect(retrieved).toEqual(value);
    });

    it("should return null if the setting key does not exist", async () => {
      const retrieved = await SystemSettingsService.getSetting("non_existent");
      expect(retrieved).toBeNull();
    });

    it("should log and throw 500 Internal Server Error if DB record has corrupted/invalid JSON", async () => {
      const key = "corrupted_key";
      // Manually create a record with invalid JSON value directly in DB
      await SystemSettings.create({ name: key, value: "{invalid_json: true" });

      await expect(
        SystemSettingsService.getSetting(key)
      ).rejects.toThrowError(HttpError);

      try {
        await SystemSettingsService.getSetting(key);
      } catch (err: any) {
        expect(err.statusCode).toBe(500);
        expect(err.message).toContain("Internal Server Error");
      }
    });
  });

  describe("updateSetting", () => {
    it("should successfully update an existing system setting", async () => {
      const key = "update_key";
      await SystemSettingsService.createSetting(key, "original");

      await SystemSettingsService.updateSetting(key, "updated");

      const retrieved = await SystemSettingsService.getSetting<string>(key);
      expect(retrieved).toBe("updated");
    });

    it("should throw 404 Not Found if the key does not exist", async () => {
      await expect(
        SystemSettingsService.updateSetting("non_existent", "value")
      ).rejects.toThrowError(HttpError);

      try {
        await SystemSettingsService.updateSetting("non_existent", "value");
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
        expect(err.message).toContain("Not Found");
      }
    });

    it("should throw 400 Bad Request if stringification fails on update", async () => {
      const key = "valid_key";
      await SystemSettingsService.createSetting(key, "original");

      const circularValue: any = {};
      circularValue.self = circularValue;

      await expect(
        SystemSettingsService.updateSetting(key, circularValue)
      ).rejects.toThrowError(HttpError);

      try {
        await SystemSettingsService.updateSetting(key, circularValue);
      } catch (err: any) {
        expect(err.statusCode).toBe(400);
        expect(err.message).toContain("Bad Request");
      }
    });
  });

  describe("deleteSetting", () => {
    it("should throw 403 Forbidden if deleting a protected key", async () => {
      const protectedKey = PROTECTED_SETTINGS_KEYS[0] || "exam_config";

      await expect(
        SystemSettingsService.deleteSetting(protectedKey)
      ).rejects.toThrowError(HttpError);

      try {
        await SystemSettingsService.deleteSetting(protectedKey);
      } catch (err: any) {
        expect(err.statusCode).toBe(403);
        expect(err.message).toContain("系統核心設定禁止刪除");
      }
    });

    it("should throw 404 Not Found if setting key does not exist", async () => {
      await expect(
        SystemSettingsService.deleteSetting("non_existent")
      ).rejects.toThrowError(HttpError);

      try {
        await SystemSettingsService.deleteSetting("non_existent");
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
        expect(err.message).toContain("Not Found");
      }
    });

    it("should successfully delete the setting if it exists and is not protected", async () => {
      const key = "deletable_key";
      await SystemSettingsService.createSetting(key, "data");

      await SystemSettingsService.deleteSetting(key);

      const retrieved = await SystemSettingsService.getSetting(key);
      expect(retrieved).toBeNull();
    });
  });
});
