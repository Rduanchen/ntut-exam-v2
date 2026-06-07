import { Request, Response, NextFunction } from "express";
import { DeviceService } from "../../services/device.service";
import { AuthService } from "../../services/auth.service";
import { HttpError } from "../../utils/http-error";
import { User } from "../../models/user.model";
import { DeviceKeyMap } from "../../models/device-key-map.model";

export class AdminSecurityController {
  /**
   * GET /admin/device
   * Get all devices including student name, student ID, device IP, device UUID, and online status.
   */
  static async getDevices(req: Request, res: Response, next: NextFunction) {
    try {
      const users = await User.findAll({
        include: [
          {
            model: DeviceKeyMap,
            as: "device"
          }
        ]
      });

      const result = users.map(user => ({
        id: user.testId,
        name: user.name,
        ipAddress: user.ipAddress || (user.device?.ipAddress || null),
        deviceUuid: user.deviceUuid,
        isOnline: user.device ? user.device.isOnline : false
      }));

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /admin/device/:deviceUuid
   * Delete device AES key, allowing a rebooted/crashed PC to reconnect.
   */
  static async deleteDeviceKey(req: Request, res: Response, next: NextFunction) {
    const { deviceUuid } = req.params;
    if (!deviceUuid) {
      return next(new HttpError(400, "Bad Request: Missing deviceUuid parameter"));
    }

    try {
      await DeviceService.deleteKey(deviceUuid);
      res.status(200).json({ message: `Device key for UUID "${deviceUuid}" deleted successfully` });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/users/:testId/reset-device
   * Reset a student's bound device UUID to null, allowing them to login on another computer.
   */
  static async resetUserDeviceBinding(req: Request, res: Response, next: NextFunction) {
    const { testId } = req.params;
    if (!testId) {
      return next(new HttpError(400, "Bad Request: Missing testId parameter"));
    }

    try {
      await AuthService.resetBinding(testId);
      res.status(200).json({ message: `Device binding for student "${testId}" reset successfully` });
    } catch (error) {
      next(error);
    }
  }
}
export default AdminSecurityController;
