import { Request, Response, NextFunction } from 'express';
import { UserActionLogService } from '../services/user-action-log.service';
import { AntiCheatService } from '../services/anti-cheat.service';
import logger from '../utils/logger.util';

export const createActionLog = (actionType: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // We execute this asynchronously so it doesn't block the request lifecycle
    setImmediate(async () => {
      try {
        const testId = (req as any).user?.testId || (req.body && req.body.testId);
        
        // If we can't identify the user, we can't log properly
        if (!testId) {
          return;
        }

        const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null;
        
        // Save the log
        await UserActionLogService.createLog(testId, ipAddress, actionType, {
          method: req.method,
          originalUrl: req.originalUrl,
          body: req.body, // Be careful about logging sensitive data
          query: req.query
        });

        // Anti-cheat check
        await AntiCheatService.checkUserAction(testId, ipAddress, actionType, {
          method: req.method,
          originalUrl: req.originalUrl
        });

      } catch (error: any) {
        logger.error(`Middleware action-log failed: ${error.message}`);
      }
    });

    next();
  };
};
