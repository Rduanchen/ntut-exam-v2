import { randomUUID } from "crypto";

import { User } from "../models/user.model";
import { ScoreBoard } from "../models/score-board.model";
import { DeviceKeyMap } from "../models/device-key-map.model";
import { Submission } from "../models/submission.model";
import { ViolationLog } from "../models/violation-log.model";
import { UserActionLog } from "../models/user-action-log.model";
import { Message } from "../models/message.model";
import { LoginRequest } from "../models/login-request.model";
import { UnblockedDevice } from "../models/unblocked-device.model";
import { SystemSettingsService } from "./system-settings.service";
import { ExamStateService, ExamState } from "./exam-state.service";
import MessageSocketService from "../sockets/message-socket.service";
import { ExamConfigCryptoService } from "./exam-config-crypto.service";
import { HttpError } from "../utils/http-error";
import { getDefaultScoreboard } from "../utils/init-db.util";

/** Where the split paper and its key live once initialisation has run. */
export const EXAM_KEY_SETTING = "exam_key";
export const EXAM_CONFIG_META_SETTING = "exam_config_meta";
export const EXAM_CONFIG_CIPHER_SETTING = "exam_config_cipher";

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
  static async performInitialization(): Promise<{ passwordIsWeak: boolean }> {
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
        const user = await User.create({
          testId: accessibleUser.id,
          name: accessibleUser.name,
          deviceUuid: null, // Initially unbound
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

    /* Split the paper and lock the half that would give it away.
     *
     * Done here rather than on first delivery so the key exists before any
     * machine can ask for a paper — the phase transition below refuses until
     * it does, which is what stops a machine being handed something it can
     * read. */
    const prepared = ExamConfigCryptoService.prepare(config);
    await SystemSettingsService.upsertSetting(EXAM_KEY_SETTING, prepared.examKey);
    await SystemSettingsService.upsertSetting(EXAM_CONFIG_META_SETTING, prepared.meta);
    await SystemSettingsService.upsertSetting(EXAM_CONFIG_CIPHER_SETTING, prepared.cipher);

    await ExamStateService.changeState(ExamState.INITIALIZED);

    return { passwordIsWeak: prepared.passwordIsWeak };

    /* Registration is opened by the INITIALIZED transition above, not here.
     * One owner for that switch means it cannot be left open by a path that
     * forgot to close it. */
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
      await LoginRequest.destroy({ where: {}, transaction });
      await UnblockedDevice.destroy({ where: {}, transaction });

      await transaction.commit();
    } catch (error: any) {
      await transaction.rollback();
      throw error;
    }

    /* Nothing may survive a reset that could decrypt the previous paper. */
    await SystemSettingsService.purgeSetting(EXAM_KEY_SETTING);
    await SystemSettingsService.purgeSetting(EXAM_CONFIG_META_SETTING);
    await SystemSettingsService.purgeSetting(EXAM_CONFIG_CIPHER_SETTING);

    /* Reset is not a phase transition — it is the one channel that may move
     * backwards, and it must work from FINISHED, which the table treats as
     * terminal. It broadcasts nothing itself, so the announcement below is the
     * only one machines receive. */
    await ExamStateService.resetToUninitialized();

    /* Announced on its own channel. A machine has to forget its identity, its
     * key and its paper — none of which a phase change asks of it, and all of
     * which the backend has just deleted. Leaving a client holding a key the
     * server no longer knows is what made the previous reset unusable: every
     * request afterwards was refused, with no path back. */
    MessageSocketService.sendExamReset();
  }
}
