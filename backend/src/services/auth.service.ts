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

    const approval = await UnblockedDevice.findOne({
      where: { targetType: "UUID", targetValue: deviceUuid }
    });
    const validApproval = !!approval &&
      (approval.approvalMode === "SAME_USER"
        ? device?.testId === testId && approval.expectedTestId === testId
        : approval.approvalMode === "NEW_USER" && !device?.testId) &&
      (!approval.approvedIpAddress || approval.approvedIpAddress === clientIp);

    // A device cannot use an approval to evict its current student.
    if (device && device.testId && device.testId !== testId) {
      throw new HttpError(403, "This device is already bound to another student. Please ask TA to unbind it first.", "BINDING_LOCKED");
    }
    if (approval?.approvalMode === "SAME_USER" && !validApproval) {
      throw new HttpError(403, "This approval only permits the machine's original student.", "BINDING_LOCKED");
    }
    if (approval?.approvalMode === "NEW_USER" && !validApproval) {
      throw new HttpError(403, "This approval is no longer valid for this machine or address.", "BINDING_LOCKED");
    }

    // Another machine's binding is never released by an entry approval.
    if (user.deviceUuid && user.deviceUuid !== deviceUuid) {
      const oldDevice = await DeviceKeyMap.findOne({ where: { deviceUuid: user.deviceUuid } });
      if (oldDevice?.isOnline) {
        throw new HttpError(403, "This student ID is currently logged in on another active device.", "ALREADY_LOGGED_IN");
      }
      throw new HttpError(403, "This student ID is bound to another device. Please ask TA to unbind it first.", "BINDING_LOCKED");
    }

    if (!validApproval) {
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

    if (validApproval) await approval.destroy();

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
