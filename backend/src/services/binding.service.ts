import { DeviceKeyMap } from "../models/device-key-map.model";
import { User } from "../models/user.model";
import { HttpError } from "../utils/http-error";
import { MessageSocketService } from "../sockets/message-socket.service";
import logger from "../utils/logger.util";
import { SocketService } from "../sockets/socket.service";

export class BindingService {
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
    if (device.status === "ONLINE") {
      await this.forceLogoutDevice(deviceUuid, "Your device binding has been removed by the TA.");
    }

    // Unbind Device
    device.testId = null;
    device.status = "UNBOUND";
    await device.save();

    // Unbind User
    if (user) {
      user.deviceUuid = null;
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
    await user.save();

    // Unbind Device
    if (deviceUuid) {
      const device = await DeviceKeyMap.findOne({ where: { deviceUuid } });
      if (device) {
        if (device.status === "ONLINE") {
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
      await user.save();
    }

    await device.destroy();

    SocketService.triggerDataUpdateEvent("connection");
    SocketService.triggerDataUpdateEvent("student");
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
