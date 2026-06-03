import { Request, Response } from 'express';
import { UserActionLogService } from '../../services/user-action-log.service';
import { AntiCheatService } from '../../services/anti-cheat.service';

export class UserLogController {
  public static async logClientAction(req: Request, res: Response): Promise<void> {
    try {
      const testId = (req as any).user?.testId;
      const { actionType, details } = req.body;
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null;

      if (!testId) {
        res.status(401).json({ error: 'Unauthorized: Missing user information' });
        return;
      }

      if (!actionType) {
        res.status(400).json({ error: 'Bad Request: Missing actionType' });
        return;
      }

      // We do not await these to avoid blocking the client unnecessarily (fire-and-forget)
      setImmediate(async () => {
        await UserActionLogService.createLog(testId, ipAddress, actionType, details);
        await AntiCheatService.checkUserAction(testId, ipAddress, actionType, details);
      });

      res.status(200).json({ success: true, message: 'Action logged successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  }
}
