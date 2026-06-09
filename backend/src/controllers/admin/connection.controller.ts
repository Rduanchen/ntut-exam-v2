import { Request, Response, NextFunction } from "express";
import { DeviceKeyMap } from "../../models/device-key-map.model";
import { User } from "../../models/user.model";
import { LoginRequest } from "../../models/login-request.model";
import { UnblockedDevice } from "../../models/unblocked-device.model";
import { SystemSettingsService } from "../../services/system-settings.service";
import { HttpError } from "../../utils/http-error";

export class ConnectionController {
  /**
   * GET /admin/connection/settings
   * Get connection settings (e.g. allow_device_registration)
   */
  static async getSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const allowRegistration = await SystemSettingsService.getAllowDeviceRegistration();
      res.status(200).json({ allowRegistration });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/connection/settings
   * Update connection settings
   */
  static async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const { allowRegistration } = req.body;
      if (typeof allowRegistration !== "boolean") {
        throw new HttpError(400, "allowRegistration must be a boolean");
      }
      await SystemSettingsService.setAllowDeviceRegistration(allowRegistration);
      res.status(200).json({ message: "Settings updated successfully" });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/connection/devices
   * Get all devices, their connection status, and bounded user info
   */
  static async getDevices(req: Request, res: Response, next: NextFunction) {
    try {
      const devices = await DeviceKeyMap.findAll({
        include: [{ model: User, required: false }],
        order: [["created_at", "DESC"]],
      });
      res.status(200).json(devices);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/connection/devices/:uuid/unbind
   * Unbind a device from a user
   */
  static async unbindDevice(req: Request, res: Response, next: NextFunction) {
    try {
      const { uuid } = req.params;
      const user = await User.findOne({ where: { deviceUuid: uuid } });
      if (user) {
        await user.update({
          deviceUuid: null,
          ipAddress: null
        });
      }
      res.status(200).json({ message: "Device unbound successfully" });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/connection/requests
   * Get pending login requests
   */
  static async getRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const requests = await LoginRequest.findAll({
        where: { status: "PENDING" },
        order: [["created_at", "DESC"]],
      });
      res.status(200).json(requests);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/connection/requests/:id/approve
   * Approve a login request
   */
  static async approveRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { action } = req.body; // "KEEP_USER" | "UNBIND_USER"
      const request = await LoginRequest.findByPk(id);
      if (!request) {
        throw new HttpError(404, "Login request not found");
      }

      request.status = "ALLOWED";
      await request.save();

      if (action === "UNBIND_USER") {
        if (request.testId) {
          // Import AuthService to call resetBinding
          const { AuthService } = require("../../services/auth.service");
          await AuthService.resetBinding(request.testId);
        } else {
          // Fallback if testId is missing but we want to unbind
          const { DeviceService } = require("../../services/device.service");
          await DeviceService.deleteKey(request.deviceUuid).catch(() => {});
          const user = await User.findOne({ where: { deviceUuid: request.deviceUuid } });
          if (user) await user.update({ deviceUuid: null, ipAddress: null });
        }
      }

      // Add to unblocked devices (target device UUID)
      await UnblockedDevice.create({
        targetType: "UUID",
        targetValue: request.deviceUuid,
      });

      res.status(200).json({ message: "Request approved and device unblocked" });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/connection/requests/:id/reject
   * Reject a login request
   */
  static async rejectRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const request = await LoginRequest.findByPk(id);
      if (!request) {
        throw new HttpError(404, "Login request not found");
      }

      request.status = "REJECTED";
      await request.save();

      res.status(200).json({ message: "Request rejected" });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/connection/unblock
   * Manually unblock a specific IP or UUID
   */
  static async manualUnblock(req: Request, res: Response, next: NextFunction) {
    try {
      const { targetType, targetValue, action } = req.body;
      if (!["IP", "UUID"].includes(targetType) || !targetValue) {
        throw new HttpError(400, "Invalid targetType or targetValue");
      }

      if (action === "UNBIND_USER") {
        if (targetType === "UUID") {
          const { DeviceService } = require("../../services/device.service");
          await DeviceService.deleteKey(targetValue).catch(() => {});
          const user = await User.findOne({ where: { deviceUuid: targetValue } });
          if (user) await user.update({ deviceUuid: null, ipAddress: null });
        } else if (targetType === "IP") {
          const user = await User.findOne({ where: { ipAddress: targetValue } });
          if (user) {
            const { AuthService } = require("../../services/auth.service");
            await AuthService.resetBinding(user.testId);
          }
        }
      }

      await UnblockedDevice.create({
        targetType,
        targetValue,
      });

      res.status(200).json({ message: "Successfully added to unblocked list" });
    } catch (error) {
      next(error);
    }
  }
}
