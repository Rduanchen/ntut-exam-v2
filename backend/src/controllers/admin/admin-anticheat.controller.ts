import { Request, Response } from 'express';
import { AntiCheatService } from '../../services/anti-cheat.service';
import logger from '../../utils/logger.util';

export class AdminAnticheatController {
  public static async getAlertLogs(req: Request, res: Response): Promise<void> {
    try {
      const logs = await AntiCheatService.getViolationLogs();
      res.status(200).json(logs);
    } catch (error: any) {
      logger.error(`Admin getAlertLogs error: ${error.message}`);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  public static async getAlertLogsByStudentId(req: Request, res: Response): Promise<void> {
    try {
      const { studentID } = req.params;
      if (!studentID) {
        res.status(400).json({ error: 'Bad Request: Missing studentID' });
        return;
      }
      const logs = await AntiCheatService.getViolationLogs({ testId: studentID });
      res.status(200).json(logs);
    } catch (error: any) {
      logger.error(`Admin getAlertLogsByStudentId error: ${error.message}`);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  public static async setAlertOkStatus(req: Request, res: Response): Promise<void> {
    try {
      const { violationId, isOk } = req.body;
      if (violationId === undefined || isOk === undefined) {
        res.status(400).json({ error: 'Bad Request: Missing violationId or isOk' });
        return;
      }
      const updated = await AntiCheatService.setAlertOkStatus(violationId, isOk);
      if (updated) {
        res.status(200).json({ success: true, message: 'Status updated successfully' });
      } else {
        res.status(404).json({ error: 'Violation log not found' });
      }
    } catch (error: any) {
      logger.error(`Admin setAlertOkStatus error: ${error.message}`);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}
