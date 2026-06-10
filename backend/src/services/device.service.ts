import { DeviceKeyMap } from "../models/device-key-map.model";
import { CryptoService } from "./crypto.service";
import { HttpError } from "../utils/http-error";
import { SystemSettingsService } from "./system-settings.service";
import { LoginRequest } from "../models/login-request.model";
import { UnblockedDevice } from "../models/unblocked-device.model";
import { User } from "../models/user.model";
import { SocketService } from "../sockets/socket.service";

export class DeviceService {
  /**
   * Register a hardware device and its client AES Key (decrypted from RSA wrapper).
   */
  static async registerKey(deviceUuid: string, encryptedAesKey: string, ipAddress: string = ""): Promise<void> {
    let clientAesKeyBuffer: Buffer;
    try {
      clientAesKeyBuffer = CryptoService.decryptRSA(encryptedAesKey);
      if (clientAesKeyBuffer.length !== 32) {
        throw new Error("Decrypted AES key must be exactly 32 bytes (256-bit)");
      }
    } catch (error: any) {
      throw new HttpError(400, `Failed to decrypt AES key: ${error.message}`);
    }

    const existing = await DeviceKeyMap.findOne({ where: { deviceUuid }, include: [User] });
    
    // Check if device is unblocked
    const unblocked = await UnblockedDevice.findOne({
      where: { targetType: "UUID", targetValue: deviceUuid }
    });

    if (existing) {
      // Secondary Binding: This device is already registered, and client is sending a new AES key.
      if (!unblocked) {
        // Block it and log request
        await LoginRequest.create({
          ipAddress,
          deviceUuid,
          testId: existing.user ? existing.user.testId : null,
          type: "SECONDARY",
          status: "PENDING"
        });
        SocketService.triggerDataUpdateEvent('connection');
        throw new HttpError(403, "Secondary binding blocked. A request has been sent to the TA.");
      } else {
        // Unblocked: Consume the pass and allow binding
        await unblocked.destroy();
        existing.clientAesKey = clientAesKeyBuffer.toString("hex");
        existing.ipAddress = ipAddress;
        existing.isOnline = true;
        await existing.save();
        SocketService.triggerDataUpdateEvent('connection');
        SocketService.triggerDataUpdateEvent('student');
      }
    } else {
      // First-Time Binding
      const allowRegistration = await SystemSettingsService.getAllowDeviceRegistration();
      if (!allowRegistration && !unblocked) {
        // Try to guess testId by IP if possible
        const userByIp = await User.findOne({ where: { ipAddress } });
        await LoginRequest.create({
          ipAddress,
          deviceUuid,
          testId: userByIp ? userByIp.testId : null,
          type: "FIRST_TIME",
          status: "PENDING"
        });
        SocketService.triggerDataUpdateEvent('connection');
        throw new HttpError(403, "Registration is closed. A request has been sent to the TA.");
      }
      
      // Consume pass if it was used to bypass
      if (!allowRegistration && unblocked) {
        await unblocked.destroy();
      }

      await DeviceKeyMap.create({
        deviceUuid,
        ipAddress,
        clientAesKey: clientAesKeyBuffer.toString("hex"),
        isOnline: true
      });
      SocketService.triggerDataUpdateEvent('connection');
      SocketService.triggerDataUpdateEvent('student');
    }
  }

  /**
   * Retrieve the client AES Key for a specific device uuid as a Buffer.
   * Throws 401 Unauthorized if not registered.
   */
  static async getAesKey(deviceUuid: string): Promise<Buffer> {
    const record = await DeviceKeyMap.findOne({ where: { deviceUuid } });
    if (!record) {
      throw new HttpError(401, `Unauthorized: Device UUID "${deviceUuid}" is not registered`);
    }
    return Buffer.from(record.clientAesKey, "hex");
  }

  /**
   * Delete the device key registry (used for resetting connection).
   */
  static async deleteKey(deviceUuid: string): Promise<void> {
    const record = await DeviceKeyMap.findOne({ where: { deviceUuid } });
    if (!record) {
      throw new HttpError(404, `Not Found: Device with UUID "${deviceUuid}" does not exist`);
    }
    await DeviceKeyMap.destroy({ where: { deviceUuid } });
    SocketService.triggerDataUpdateEvent('connection');
    SocketService.triggerDataUpdateEvent('student');
  }
}
