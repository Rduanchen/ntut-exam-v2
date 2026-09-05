import { Request, Response, NextFunction } from "express";
import { DeviceKeyMap } from "../../models/device-key-map.model";
import { User } from "../../models/user.model";
import { LoginRequest } from "../../models/login-request.model";
import { UnblockedDevice } from "../../models/unblocked-device.model";
import { SystemSettingsService } from "../../services/system-settings.service";
import { HttpError } from "../../utils/http-error";
import { BindingService } from "../../services/binding.service";
import { SocketService } from "../../sockets/socket.service";

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
      await BindingService.unbindDevice(uuid);
      res.status(200).json({ message: "Device unbound successfully" });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /admin/connection/devices/:uuid
   * Completely unregister a device
   */
  static async unregisterDevice(req: Request, res: Response, next: NextFunction) {
    try {
      const { uuid } = req.params;
      await BindingService.unregisterDevice(uuid);
      res.status(200).json({ message: "Device unregistered successfully" });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/connection/device/:deviceUuid/re-entry
   *
   * Send one machine back through the entry gate, leaving its student's work
   * untouched. For a seat that has to be re-signed-in — a swapped machine, a
   * student logged in as someone else — without waiting for it to restart on
   * its own.
   */
  static async reEntryDevice(req: Request, res: Response, next: NextFunction) {
    try {
      const { deviceUuid } = req.params;
      if (!deviceUuid) {
        throw new HttpError(400, "Bad Request: Missing deviceUuid parameter");
      }

      await BindingService.reEntry(deviceUuid);

      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/connection/requests
   *
   * Machines waiting to be let in, with what a TA needs to decide.
   *
   * The bare row said only which device and which IP. Deciding meant opening
   * other screens to ask: who was this machine bound to, is that student
   * already sitting somewhere else, did it drop a moment ago or ten minutes
   * ago, is it in the seat the roster expects. Under time pressure a TA who
   * cannot answer those approves everything, and the gate stops meaning
   * anything.
   */
  static async getRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const requests = await LoginRequest.findAll({
        where: { status: "PENDING" },
        order: [["created_at", "DESC"]],
      });

      const detailed = await Promise.all(
        requests.map(async (request) => {
          const previousTestId = request.previousTestId ?? null;

          const previousStudent = previousTestId
            ? await User.findOne({ where: { testId: previousTestId } })
            : null;

          /* Whether that student is answering somewhere else right now. The
           * difference between "their machine restarted" and "someone is
           * claiming a seat that is already in use". */
          const otherDevice = previousTestId
            ? await DeviceKeyMap.findOne({ where: { testId: previousTestId } })
            : null;
          const previousStudentOnlineElsewhere =
            !!otherDevice && otherDevice.deviceUuid !== request.deviceUuid && otherDevice.isOnline;

          const existing = await DeviceKeyMap.findOne({
            where: { deviceUuid: request.deviceUuid }
          });

          /* Whether this request comes from the seat the roster assigns. A
           * machine asking from its own seat is the ordinary case; one asking
           * from elsewhere is the one worth a second look. */
          const rosterMatch = previousTestId
            ? await User.findOne({ where: { testId: previousTestId } })
            : await User.findOne({ where: { ipAddress: request.ipAddress } });
          const ipMatchesRoster =
            !!rosterMatch?.ipAddress && rosterMatch.ipAddress === request.ipAddress;

          return {
            id: request.id,
            deviceUuid: request.deviceUuid,
            ipAddress: request.ipAddress,
            createdAt: request.createdAt,
            type: request.type,
            testId: request.testId,
            previousTestId,
            previousStudentName: previousStudent?.name ?? null,
            previousStudentOnlineElsewhere,
            lastDisconnectedAt: existing?.lastDisconnectedAt ?? null,
            ipMatchesRoster
          };
        })
      );

      res.status(200).json(detailed);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/connection/requests/:id/approve
   *
   * Let a machine in, optionally handing it to a different student.
   *
   * `targetTestId` names who will sit here. When it differs from whoever the
   * machine was bound to, both bindings have to go: this machine's old one and
   * the new student's hold on whatever machine they were using. Undoing only
   * the first — which is all this used to do — leaves the student blocked on
   * their own previous seat, so the TA has to run the whole approval again
   * after the student fails to log in. Twice, for one swapped machine.
   */
  static async approveRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { action, targetTestId } = req.body;
      const request = await LoginRequest.findByPk(id);
      if (!request) {
        throw new HttpError(404, "Login request not found");
      }

      request.status = "ALLOWED";
      await request.save();

      const unbound: string[] = [];
      const previousTestId = request.previousTestId ?? request.testId ?? null;

      /* Reassigning the seat. Both sides are released in this one call so the
       * student can simply log in. */
      if (targetTestId && targetTestId !== previousTestId) {
        if (previousTestId) {
          await BindingService.unbindUser(previousTestId);
          unbound.push(previousTestId);
        }
        await BindingService.unbindUser(targetTestId);
        unbound.push(targetTestId);
      } else if (action === "UNBIND_USER") {
        if (previousTestId) {
          await BindingService.unbindUser(previousTestId);
          unbound.push(previousTestId);
        } else {
          await BindingService.unregisterDevice(request.deviceUuid);
        }
      }

      // Add to unblocked devices (target device UUID)
      await UnblockedDevice.create({
        targetType: "UUID",
        targetValue: request.deviceUuid,
      });

      SocketService.triggerDataUpdateEvent("connection");
      SocketService.triggerDataUpdateEvent("student");

      res.status(200).json({
        message: "Request approved and device unblocked",
        unbound
      });
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

      SocketService.triggerDataUpdateEvent("connection");

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
          await BindingService.unregisterDevice(targetValue);
        } else if (targetType === "IP") {
          const user = await User.findOne({ where: { ipAddress: targetValue } });
          if (user) {
            await BindingService.unbindUser(user.testId);
          }
        }
      }

      await UnblockedDevice.create({
        targetType,
        targetValue,
      });

      SocketService.triggerDataUpdateEvent("connection");
      SocketService.triggerDataUpdateEvent("student");

      res.status(200).json({ message: "Successfully added to unblocked list" });
    } catch (error) {
      next(error);
    }
  }
}
