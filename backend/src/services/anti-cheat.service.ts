import { ViolationLog } from '../models/violation-log.model';
import { UserActionLog } from '../models/user-action-log.model';
import SocketService from '../sockets/socket.service';
import { Op } from 'sequelize';
import logger from '../utils/logger.util';

export class AntiCheatService {
  /**
   * Evaluates a user action to see if it's a violation.
   * If it is, records a violation and optionally triggers a socket alert.
   */
  public static async checkUserAction(testId: string, ipAddress: string | null, actionType: string, details?: any): Promise<void> {
    try {
      // 1. Dynamic alerts from frontend (e.g. APP_ON_QUIT)
      if (actionType === 'alert' && details && details.type) {
        const message = details.message || `Violation detected: ${details.type}`;
        await this.recordViolation(testId, ipAddress, details.type, message);
      }

      // 2. Multiple IPs for same user OR Multiple users on same IP
      if (ipAddress) {
        // Find if this user used a different IP
        const lastUserLog = await UserActionLog.findOne({
          where: { 
            testId, 
            ipAddress: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: ipAddress }] } 
          },
          order: [['timestamp', 'DESC']],
        });
        
        if (lastUserLog && lastUserLog.ipAddress !== ipAddress) {
           await this.recordViolation(
             testId, 
             ipAddress, 
             'MULTIPLE_IPS', 
             `User logged in from multiple IPs: ${lastUserLog.ipAddress} and ${ipAddress}`
           );
        }

        // Find if another user used this same IP
        const anotherUserLog = await UserActionLog.findOne({
          where: { 
            ipAddress, 
            testId: { [Op.ne]: testId } 
          },
          order: [['timestamp', 'DESC']],
        });

        if (anotherUserLog && anotherUserLog.testId !== testId) {
           await this.recordViolation(
             testId, 
             ipAddress, 
             'MULTIPLE_USERS_ON_IP', 
             `Multiple users on the same IP: ${anotherUserLog.testId} and ${testId}`
           );
        }
      }

    } catch (error: any) {
      logger.error(`AntiCheatService check error for ${testId}: ${error.message}`);
    }
  }

  public static async recordViolation(testId: string, ipAddress: string | null, type: string, message: string): Promise<void> {
    try {
      const existing = await ViolationLog.findOne({
        where: {
          testId,
          type,
          message,
          isOk: false,
        },
      });

      let violation: ViolationLog;
      const time = new Date();
      let shouldAlert = false;

      if (existing) {
        await existing.update({ time, ipAddress });
        violation = existing;
        shouldAlert = false;
      } else {
        violation = await ViolationLog.create({
          testId,
          ipAddress: ipAddress || null,
          type,
          message,
          time,
          isOk: false
        });
        shouldAlert = true;
      }
      
      if (shouldAlert) {
        this.triggerAlert(testId, violation);
      }
    } catch (error: any) {
      logger.error(`Failed to record violation for ${testId}: ${error.message}`);
    }
  }

  private static triggerAlert(testId: string, violation: ViolationLog): void {
    logger.warn(`[AntiCheat Alert] TestID: ${testId}, Type: ${violation.type}, Msg: ${violation.message}`);
    
    // Emit socket event to frontend (Admin SocketService)
    try {
      SocketService.triggerAlertEvent(violation);
    } catch (e: any) {
      logger.error(`Error emitting socket event: ${e.message}`);
    }
  }

  public static async getViolationLogs(filter?: any): Promise<ViolationLog[]> {
    return await ViolationLog.findAll({
      where: filter,
      order: [['time', 'DESC']]
    });
  }

  public static async setAlertOkStatus(violationId: number, isOk: boolean): Promise<boolean> {
    const record = await ViolationLog.findByPk(violationId);
    if (!record) return false;
    
    await record.update({ isOk });
    return true;
  }
}
