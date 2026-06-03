import { User } from "../models/user.model";
import { DeviceKeyMap } from "../models/device-key-map.model";
import { DeviceService } from "./device.service";
import { CryptoService } from "./crypto.service";
import { HttpError } from "../utils/http-error";
import { AesEncryptedPayload, LoginDecryptedPayload } from "../types/crypto.type";

export class AuthService {
  static async loginAndBind(payload: AesEncryptedPayload, clientIp: string): Promise<string> {
    const { device_uuid: deviceUuid } = payload;
    const aesKey = await DeviceService.getAesKey(deviceUuid);

    let decryptedData: LoginDecryptedPayload;
    try {
      const decryptedText = CryptoService.decryptAESGCM(payload, aesKey);
      decryptedData = JSON.parse(decryptedText);
    } catch (error: any) {
      throw new HttpError(400, `Decryption or parsing of login payload failed: ${error.message}`);
    }

    const { testId } = decryptedData;
    if (!testId) {
      throw new HttpError(400, "Invalid payload: testId is required");
    }

    const user = await User.findOne({ where: { testId } });
    if (!user) {
      throw new HttpError(401, `Authentication failed: Student ID "${testId}" not found`);
    }

    if (user.deviceUuid) {
      if (user.deviceUuid !== deviceUuid) {
        throw new HttpError(403, "This account is already logged in on another device, please contact the TA");
      }
    } else {
      if (!user.ipAddress) {
        user.deviceUuid = deviceUuid;
        await user.save();
      } else {
        const deviceRecord = await DeviceKeyMap.findOne({ where: { deviceUuid } });
        const deviceIp = deviceRecord?.ipAddress || "";

        const clientIpClean = clientIp.replace(/^::ffff:/, "");
        const presetIpClean = user.ipAddress.replace(/^::ffff:/, "");
        const deviceIpClean = deviceIp.replace(/^::ffff:/, "");

        if (clientIpClean !== presetIpClean && deviceIpClean !== presetIpClean) {
          throw new HttpError(403, "Your device ip is not match with the preset ip, please contact the TA");
        }
        user.deviceUuid = deviceUuid;
        await user.save();
      }
    }

    const tokenPayload = { testId, deviceUuid };
    return CryptoService.generateSessionToken(tokenPayload, aesKey);
  }

  static async resetBinding(testId: string): Promise<void> {
    const user = await User.findOne({ where: { testId } });
    if (!user) {
      throw new HttpError(404, `Not Found: User with test ID "${testId}" not found`);
    }
    user.deviceUuid = null as any;
    await user.save();
  }
}
