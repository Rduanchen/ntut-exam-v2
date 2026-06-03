import { Request, Response, NextFunction } from "express";
import { DeviceService } from "../../services/device.service";
import { AuthService } from "../../services/auth.service";
import { HttpError } from "../../utils/http-error";

export class AdminSecurityController {
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
