import { Request, Response } from 'express';
import { UserActionLogService } from '../../services/user-action-log.service';
import logger from '../../utils/logger.util';

export class AdminLogController {
  public static async getLogs(req: Request, res: Response): Promise<void> {
    try {
      const logs = await UserActionLogService.getLogs();
      res.status(200).json(logs);
    } catch (error: any) {
      logger.error(`Admin getLogs error: ${error.message}`);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  public static async getLogsByTestId(req: Request, res: Response): Promise<void> {
    try {
      const { testId } = req.params;
      if (!testId) {
        res.status(400).json({ error: 'Bad Request: Missing testId' });
        return;
      }
      const logs = await UserActionLogService.getLogs({ testId });
      res.status(200).json(logs);
    } catch (error: any) {
      logger.error(`Admin getLogsByTestId error: ${error.message}`);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}
