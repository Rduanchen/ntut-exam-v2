import { DeviceKeyMap } from "../models/device-key-map.model";
import { User } from "../models/user.model";
import { HttpError } from "../utils/http-error";
import { MessageSocketService } from "../sockets/message-socket.service";
import logger from "../utils/logger.util";
import { SocketService } from "../sockets/socket.service";
import { SystemSettingsService } from "./system-settings.service";

export class BindingService {
  /**
   * The seat the roster assigns this student, or null if it assigns none.
   *
   * `user.ipAddress` carries two things at once: the seat the exam config
   * declares, and the address the student last logged in from. Unbinding used
   * to null it, which threw the first away along with the second — and the
   * login check is written as `if (user.ipAddress)`, so a student whose seat
   * had been cleared could sign in from anywhere for the rest of the exam. One
   * TA approval was enough to disable the check permanently.
   *
   * Restoring the declared value keeps the check meaning what the config says.
   * A student who genuinely moved seats is handled by the approval issuing a
   * one-shot pass for the new address, not by disarming the rule.
   */
  private static async rosterIpFor(testId: string): Promise<string | null> {
    try {
      const config = await SystemSettingsService.getExamConfig();
      const entry = config?.accessibleUsers?.find(
        (candidate: any) => String(candidate?.id) === String(testId)
      );
      return entry?.ip ?? null;
    } catch (error: any) {
      logger.warn(`[BindingService] Could not read the roster IP for ${testId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Bind a device to a user (Bidirectional).
   */
  static async bindDeviceToUser(deviceUuid: string, testId: string, ipAddress: string): Promise<void> {
    const device = await DeviceKeyMap.findOne({ where: { deviceUuid } });
    if (!device) {
      throw new HttpError(404, `Device ${deviceUuid} not found`);
    }

    const user = await User.findOne({ where: { testId } });
    if (!user) {
      throw new HttpError(404, `User ${testId} not found`);
    }

    // Update Device side
    device.testId = testId;
    device.status = "ONLINE";
    if (ipAddress) device.ipAddress = ipAddress;
    await device.save();

    // Update User side
    user.deviceUuid = deviceUuid;
    if (ipAddress) user.ipAddress = ipAddress;
    await user.save();

    SocketService.triggerDataUpdateEvent("connection");
    SocketService.triggerDataUpdateEvent("student");
  }

  /**
   * Unbind device from user (Initiated by device UUID)
   */
  static async unbindDevice(deviceUuid: string): Promise<void> {
    const device = await DeviceKeyMap.findOne({ where: { deviceUuid } });
    if (!device) return;

    // Check if there is an associated user
    const user = await User.findOne({ where: { deviceUuid } });

    // Force logout if online
    if (device.socketId) {
      await this.forceLogoutDevice(deviceUuid, "Your device binding has been removed by the TA.");
    }

    // Unbind Device
    device.testId = null;
    device.status = "UNBOUND";
    await device.save();

    // Unbind User
    if (user) {
      user.deviceUuid = null;
      user.ipAddress = await this.rosterIpFor(user.testId);
      await user.save();
    }

    SocketService.triggerDataUpdateEvent("connection");
    SocketService.triggerDataUpdateEvent("student");
  }

  /**
   * Unbind user from device (Initiated by testId)
   */
  static async unbindUser(testId: string): Promise<void> {
    const user = await User.findOne({ where: { testId } });
    if (!user) return;

    const deviceUuid = user.deviceUuid;

    // Unbind User
    user.deviceUuid = null;
    user.ipAddress = await this.rosterIpFor(testId);
    await user.save();

    // Unbind Device
    if (deviceUuid) {
      const device = await DeviceKeyMap.findOne({ where: { deviceUuid } });
      if (device) {
        if (device.socketId) {
          await this.forceLogoutDevice(deviceUuid, "Your device binding has been removed by the TA.");
        }
        device.testId = null;
        device.status = "UNBOUND";
        await device.save();
      }
    }

    SocketService.triggerDataUpdateEvent("connection");
    SocketService.triggerDataUpdateEvent("student");
  }

  /**
   * Unregister a device completely (removes from DeviceKeyMap and unbinds user)
   */
  static async unregisterDevice(deviceUuid: string): Promise<void> {
    const device = await DeviceKeyMap.findOne({ where: { deviceUuid } });
    if (!device) return;

    if (device.status === "ONLINE") {
      await this.forceLogoutDevice(deviceUuid, "Your device registration has been cancelled by the TA.");
    }

    const user = await User.findOne({ where: { deviceUuid } });
    if (user) {
      user.deviceUuid = null;
      user.ipAddress = await this.rosterIpFor(user.testId);
      await user.save();
    }

    await device.destroy();

    SocketService.triggerDataUpdateEvent("connection");
    SocketService.triggerDataUpdateEvent("student");
  }

  /**
   * Send a machine back through the entry gate.
   *
   * Clears everything keyed by the device — its key, its registration, its
   * binding — and touches nothing keyed by the student. Submissions and scores
   * belong to a test ID, not to a machine, so a student who re-enters on the
   * same seat or a different one finds their work where they left it.
   *
   * This is the same path a restart takes on its own. There is no separate
   * recovery procedure to keep working: the machine comes back as an
   * unregistered one and asks to be let in, exactly like any other.
   */
  static async reEntry(deviceUuid: string): Promise<void> {
    const device = await DeviceKeyMap.findOne({ where: { deviceUuid } });
    if (!device) {
      throw new HttpError(404, `Device ${deviceUuid} not found`);
    }

    await this.forceLogoutDevice(deviceUuid, "This machine has been sent back to sign in again.");
    await this.unregisterDevice(deviceUuid);
  }

  /**
   * Force logout a device by sending a socket event
   */
  static async forceLogoutDevice(deviceUuid: string, reason: string): Promise<void> {
    const device = await DeviceKeyMap.findOne({ where: { deviceUuid } });
    if (device && device.socketId) {
      logger.info(`[BindingService] Force logging out device ${deviceUuid}`);
      MessageSocketService.sendForceLogout(device.socketId, reason);
    }
  }

  /**
   * Get current device status
   */
  static async getDeviceStatus(deviceUuid: string): Promise<string> {
    const device = await DeviceKeyMap.findOne({ where: { deviceUuid } });
    if (!device) return "UNREGISTERED";
    return device.status; // "UNBOUND", "AWAITING_LOGIN", or "ONLINE"
  }
}
