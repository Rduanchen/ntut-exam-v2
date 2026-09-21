import { User } from "../models/user.model";
import { DeviceKeyMap } from "../models/device-key-map.model";
import { DeviceService } from "./device.service";
import { CryptoService } from "./crypto.service";
import { BindingService } from "./binding.service";
import { HttpError } from "../utils/http-error";
import { AesEncryptedPayload, LoginDecryptedPayload } from "../types/crypto.type";
import { UnblockedDevice } from "../models/unblocked-device.model";
// import { LoginRequest } from "../models/login-request.model";
// import { SystemSettingsService } from "./system-settings.service";
// import { ViolationLog } from "../models/violation-log.model";
// import { Op } from "sequelize";

export class AuthService {
  static async loginAndBind(payload: AesEncryptedPayload, clientIp: string): Promise<string> {
    const { device_uuid: deviceUuid } = payload;
    let aesKey: any;
    if (process.env.LOAD_TEST_MODE !== 'pure') {
      aesKey = await DeviceService.getAesKey(deviceUuid);
    }

    let decryptedData: LoginDecryptedPayload;
    if (process.env.LOAD_TEST_MODE === 'pure') {
      decryptedData = payload as unknown as LoginDecryptedPayload;
    } else {
      try {
        const decryptedText = CryptoService.decryptAESGCM(payload, aesKey);
        decryptedData = JSON.parse(decryptedText);
      } catch (error: any) {
        throw new HttpError(400, `Decryption or parsing of login payload failed: ${error.message}`);
      }
    }

    const { testId } = decryptedData;
    if (!testId) {
      throw new HttpError(400, "Invalid payload: testId is required");
    }

    let user = await User.findOne({ where: { testId } });
    if (!user) {
      if (process.env.LOAD_TEST_MODE === 'pure' || process.env.LOAD_TEST_MODE === 'simulation') {
        user = await User.create({ testId, name: `k6_${testId}`, ipAddress: clientIp });
      } else {
        throw new HttpError(401, `Authentication failed: Student ID "${testId}" not found`);
      }
    }

    const cleanClientIp = clientIp;

    // Check device existence
    const device = await DeviceKeyMap.findOne({ where: { deviceUuid } });
    if (!device && process.env.LOAD_TEST_MODE !== 'pure') {
      throw new HttpError(403, "Device is not registered. Please ensure key exchange is complete.", "REGISTRATION_FAILED");
    }

    // Check if device is bound to ANOTHER user
    if (device && device.testId && device.testId !== testId) {
      // Check if TA has approved re-binding for this device
      const unblockedUuidRecord = await UnblockedDevice.findOne({
        where: { targetType: "UUID", targetValue: deviceUuid }
      });
      if (unblockedUuidRecord) {
        // TA approved: unbind old user and consume the pass
        await BindingService.unbindDevice(deviceUuid);
        await unblockedUuidRecord.destroy();
        // Re-fetch device since unbindDevice modifies it
        const refreshedDevice = await DeviceKeyMap.findOne({ where: { deviceUuid } });
        if (refreshedDevice) {
          // device variable is used later, but since we can't reassign the const,
          // we update the fields directly on the original reference
          device.testId = refreshedDevice.testId;
          device.status = refreshedDevice.status;
        }
      } else {
        throw new HttpError(403, "This device is already bound to another student. Please ask TA to unbind it first.", "BINDING_LOCKED");
      }
    }

    // Checking secondary login for User
    if (user.deviceUuid && user.deviceUuid !== deviceUuid) {
      const oldDevice = await DeviceKeyMap.findOne({ where: { deviceUuid: user.deviceUuid } });
      if (oldDevice) {
        if (oldDevice.isOnline) {
          throw new HttpError(403, "This student ID is currently logged in on another active device.", "ALREADY_LOGGED_IN");
        } else {
          // It's bound but offline. According to new requirements, they must be unbound by TA.
          throw new HttpError(403, "This student ID is bound to an offline device. Please ask TA to unbind it first.", "BINDING_LOCKED");
        }
      }
    }

    const unblockedIpRecord = await UnblockedDevice.findOne({
      where: {
        targetType: "IP",
        targetValue: cleanClientIp
      }
    });

    if (unblockedIpRecord) {
      await unblockedIpRecord.destroy();
    } else {
      if (user.ipAddress) {
        const deviceIp = device?.ipAddress || "";
        if (cleanClientIp !== user.ipAddress && deviceIp !== user.ipAddress) {
          throw new HttpError(403, "Your device ip is not match with the preset ip, please contact the TA", "IP_MISMATCH");
        }
      }
    }

    if (process.env.LOAD_TEST_MODE !== 'pure') {
      await BindingService.bindDeviceToUser(deviceUuid, testId, cleanClientIp);
    }

    if (process.env.LOAD_TEST_MODE === 'pure') {
      const device = await DeviceKeyMap.findOne({ where: { deviceUuid } });
      if (!device) {
        await DeviceKeyMap.create({ deviceUuid, ipAddress: cleanClientIp, clientAesKey: 'pure_mode', isOnline: true });
      }
    }

    user.loginTime = new Date();
    await user.save();

    const tokenPayload = { testId, deviceUuid };
    return CryptoService.generateSessionToken(tokenPayload, aesKey);
  }

  static async resetBinding(testId: string): Promise<void> {
    await BindingService.unbindUser(testId);
  }
}
