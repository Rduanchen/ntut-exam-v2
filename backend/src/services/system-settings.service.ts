import { SystemSettings } from "../models/system-settings.model";
import { HttpError } from "../utils/http-error";
import logger from "../utils/logger.util";

export type SystemSettingKey = string;
export const PROTECTED_SETTINGS_KEYS: SystemSettingKey[] = ["exam_config"];

export class SystemSettingsService {
  static async createSetting(key: SystemSettingKey, value: any): Promise<void> {
    const existing = await SystemSettings.findOne({ where: { name: key } });
    if (existing) {
      throw new HttpError(409, `Conflict: Setting with key "${key}" already exists`);
    }

    let stringifiedValue: string;
    try {
      stringifiedValue = JSON.stringify(value);
      if (stringifiedValue === undefined) {
        throw new Error();
      }
    } catch {
      throw new HttpError(400, "Bad Request: Failed to serialize setting value to JSON");
    }

    await SystemSettings.create({ name: key, value: stringifiedValue });
  }

  static async getSetting<T>(key: SystemSettingKey): Promise<T | null> {
    const record = await SystemSettings.findOne({ where: { name: key } });
    if (!record) {
      return null;
    }

    try {
      return JSON.parse(record.value) as T;
    } catch (error: any) {
      logger.error(`Failed to parse system setting for key "${key}":`, error);
      throw new HttpError(500, `Internal Server Error: Database record for setting "${key}" is corrupted`);
    }
  }

  static async updateSetting(key: SystemSettingKey, value: any): Promise<void> {
    const record = await SystemSettings.findOne({ where: { name: key } });
    if (!record) {
      throw new HttpError(404, `Not Found: Setting with key "${key}" does not exist`);
    }

    let stringifiedValue: string;
    try {
      stringifiedValue = JSON.stringify(value);
      if (stringifiedValue === undefined) {
        throw new Error();
      }
    } catch {
      throw new HttpError(400, "Bad Request: Failed to serialize setting value to JSON");
    }

    await SystemSettings.update({ value: stringifiedValue }, { where: { name: key } });
  }

  static async deleteSetting(key: SystemSettingKey): Promise<void> {
    if (PROTECTED_SETTINGS_KEYS.includes(key)) {
      throw new HttpError(403, "Forbidden: 系統核心設定禁止刪除");
    }

    const record = await SystemSettings.findOne({ where: { name: key } });
    if (!record) {
      throw new HttpError(404, `Not Found: Setting with key "${key}" does not exist`);
    }

    await SystemSettings.destroy({ where: { name: key } });
  }

  static async getExamConfig(): Promise<any | null> {
    return this.getSetting<any>("exam_config");
  }

  static async saveExamConfig(value: any): Promise<void> {
    const existing = await SystemSettings.findOne({ where: { name: "exam_config" } });
    if (existing) {
      await this.updateSetting("exam_config", value);
    } else {
      await this.createSetting("exam_config", value);
    }
  }
}
