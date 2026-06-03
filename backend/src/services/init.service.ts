import { randomUUID } from "crypto";

import { User } from "../models/user.model";
import { ScoreBoard } from "../models/score-board.model";
import { DeviceKeyMap } from "../models/device-key-map.model";
import { Submission } from "../models/submission.model";
import { ViolationLog } from "../models/violation-log.model";
import { UserActionLog } from "../models/user-action-log.model";
import { Message } from "../models/message.model";
import { SystemSettingsService } from "./system-settings.service";
import { HttpError } from "../utils/http-error";
import { getDefaultScoreboard } from "../utils/init-db.util";

export interface InitStatusResponse {
  hasConfig: boolean;
  initializedUserCount: number;
  isInitialized: boolean;
}

export class InitService {
  /**
   * Retrieves current DB initialization status.
   */
  static async checkInitStatus(): Promise<InitStatusResponse> {
    const config = await SystemSettingsService.getExamConfig();
    const hasConfig = !!config;
    const initializedUserCount = await User.count();
    const isInitialized = initializedUserCount > 0;

    return {
      hasConfig,
      initializedUserCount,
      isInitialized
    };
  }

  /**
   * Perform database initialization in a single transaction.
   */
  static async performInitialization(): Promise<void> {
    const config = await SystemSettingsService.getExamConfig();
    if (!config) {
      throw new HttpError(400, "Bad Request: No configuration found. Please upload a config first.");
    }

    const seq = User.sequelize;
    if (!seq) {
      throw new Error("Sequelize instance not found on User model");
    }
    const transaction = await seq.transaction();
    try {
      const defaultScoreboardJson = getDefaultScoreboard(config.sections);

      // Loop through accessibleUsers to build records
      for (const accessibleUser of config.accessibleUsers) {
        let deviceUuid: string | null = null;
        
        if (accessibleUser.ip) {
          deviceUuid = randomUUID();
          await DeviceKeyMap.create({
            deviceUuid,
            ipAddress: accessibleUser.ip,
            clientAesKey: "", // initialized without key until client logs in
            isOnline: false
          }, { transaction });
        }

        const user = await User.create({
          testId: accessibleUser.id,
          name: accessibleUser.name,
          deviceUuid: deviceUuid || null,
          ipAddress: accessibleUser.ip || null
        }, { transaction });

        await ScoreBoard.create({
          testId: user.testId,
          score: 0,
          puzzleResults: defaultScoreboardJson
        }, { transaction });
      }

      await transaction.commit();
    } catch (error: any) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Safe cascade wipe of all exam tables in order of dependencies.
   */
  static async wipeAllData(): Promise<void> {
    const seq = User.sequelize;
    if (!seq) {
      throw new Error("Sequelize instance not found on User model");
    }
    const transaction = await seq.transaction();
    try {
      // Wiping data in reverse order of foreign key dependency
      await Submission.destroy({ where: {}, transaction });
      await ScoreBoard.destroy({ where: {}, transaction });
      await ViolationLog.destroy({ where: {}, transaction });
      await UserActionLog.destroy({ where: {}, transaction });
      await Message.destroy({ where: {}, transaction });
      await User.destroy({ where: {}, transaction });
      await DeviceKeyMap.destroy({ where: {}, transaction });

      await transaction.commit();
    } catch (error: any) {
      await transaction.rollback();
      throw error;
    }
  }
}
