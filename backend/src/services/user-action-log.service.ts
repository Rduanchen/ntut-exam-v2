import { UserActionLog } from '../models/user-action-log.model';
import logger from '../utils/logger.util';

export class UserActionLogService {
  public static async createLog(testId: string, ipAddress: string | null, actionType: string, details?: any): Promise<void> {
    try {
      await UserActionLog.create({
        testId,
        ipAddress: ipAddress || null,
        actionType,
        details: details ? JSON.stringify(details) : null
      });
    } catch (error: any) {
      // Non-blocking log failure
      logger.error(`Failed to create action log for ${testId}: ${error.message}`);
    }
  }

  public static async getLogs(filter?: any): Promise<UserActionLog[]> {
    return await UserActionLog.findAll({
      where: filter,
      order: [['timestamp', 'DESC']]
    });
  }
}
