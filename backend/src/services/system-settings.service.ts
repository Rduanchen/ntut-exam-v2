import { SystemSettings } from "../models/system-settings.model";
import { HttpError } from "../utils/http-error";
import logger from "../utils/logger.util";

export type SystemSettingKey = string;
export const PROTECTED_SETTINGS_KEYS: SystemSettingKey[] = [
  "exam_config",
  "allow_device_registration",
  "judger_deploy_test_latest",
  /* Feature 007. Deleting any of these mid-exam would leave every machine
   * holding a paper it can never decrypt, with no way to re-derive the key. */
  "exam_key",
  "exam_config_cipher",
  "exam_config_meta"
];

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

  /** Create or replace, whichever applies. */
  static async upsertSetting(key: SystemSettingKey, value: any): Promise<void> {
    const existing = await SystemSettings.findOne({ where: { name: key } });
    if (existing) {
      await this.updateSetting(key, value);
    } else {
      await this.createSetting(key, value);
    }
  }

  /**
   * Remove a setting even if it is protected, and say nothing if it is absent.
   *
   * Only for the reset channel. Protection exists to stop an operator deleting
   * the exam key mid-exam, leaving every machine holding a paper it can never
   * open — but reset is precisely the operation that must remove it, since
   * nothing may survive that could decrypt the previous paper.
   */
  static async purgeSetting(key: SystemSettingKey): Promise<void> {
    await SystemSettings.destroy({ where: { name: key } });
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

  static async getAllowDeviceRegistration(): Promise<boolean> {
    const value = await this.getSetting<boolean>("allow_device_registration");
    /* Closed when unset. Every phase sets this explicitly, so an unset value
     * means no phase has run — and an exam that has not been set up should not
     * be accepting machines. Defaulting open made "nobody has decided yet" and
     * "the operator opened it" indistinguishable. */
    return value === null ? false : value;
  }

  static async setAllowDeviceRegistration(value: boolean): Promise<void> {
    const existing = await SystemSettings.findOne({ where: { name: "allow_device_registration" } });
    if (existing) {
      await this.updateSetting("allow_device_registration", value);
    } else {
      await this.createSetting("allow_device_registration", value);
    }
  }
}
