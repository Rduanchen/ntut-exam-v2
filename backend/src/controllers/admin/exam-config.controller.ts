import { Request, Response, NextFunction } from "express";
import { ExamConfigService } from "../../services/exam-config.service";
import { InitService } from "../../services/init.service";
import { SystemSettingsService } from "../../services/system-settings.service";
import { HttpError } from "../../utils/http-error";
import { createMessage, MessageType } from "../../services/message.service";
import MessageSocketService from "../../sockets/message-socket.service";

export class ExamConfigController {
  /**
   * POST /admin/config
   * Creates or fully overwrites the global exam configuration.
   */
  static async createOrOverwriteConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const initStatus = await InitService.checkInitStatus();
      if (initStatus.isInitialized) {
        throw new HttpError(403, "Forbidden: Cannot overwrite config after database initialization");
      }

      const config = await ExamConfigService.validateAndSave(req.body);
      res.status(200).json(config);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/config
   * Updates config. Performs restricted updates if already initialized.
   */
  static async updateConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const initStatus = await InitService.checkInitStatus();
      let config;
      if (!initStatus.isInitialized) {
        config = await ExamConfigService.validateAndSave(req.body);
      } else {
        config = await ExamConfigService.restrictedUpdate(req.body);
        const msg = await createMessage(MessageType.CONFIG_UPDATE, "Exam configuration has been updated");
        MessageSocketService.sendConfigUpdateNotification(msg.id);
      }
      res.status(200).json(config);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/config
   * Retrieves the current active configuration.
   */
  static async getConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const config = await SystemSettingsService.getExamConfig();
      if (!config) {
        throw new HttpError(404, "Not Found: No exam config found");
      }
      res.status(200).json(config);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/init
   * Runs initialization of DB tables (Users, Devices, Scoreboards) based on the config.
   */
  static async initializeDatabase(req: Request, res: Response, next: NextFunction) {
    try {
      const status = await InitService.checkInitStatus();
      if (status.isInitialized) {
        throw new HttpError(409, "Conflict: Database already initialized");
      }
      await InitService.performInitialization();
      res.status(200).json({ message: "Database initialized successfully" });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/init/reset
   * Wipes all user progress and system data back to factory setup.
   */
  static async resetDatabase(req: Request, res: Response, next: NextFunction) {
    try {
      const { confirm } = req.body;
      if (confirm !== "RESET") {
        throw new HttpError(400, "Bad Request: Missing or incorrect confirmation string 'RESET'");
      }
      await InitService.wipeAllData();
      res.status(200).json({ message: "Database reset to factory settings successfully" });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/init/init-status
   * Checks current initialized state of the database and configuration.
   */
  static async getSystemInitStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const status = await InitService.checkInitStatus();
      res.status(200).json(status);
    } catch (error) {
      next(error);
    }
  }
}
export default ExamConfigController;
