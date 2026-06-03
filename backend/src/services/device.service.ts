import { DeviceKeyMap } from "../models/device-key-map.model";
import { CryptoService } from "./crypto.service";
import { HttpError } from "../utils/http-error";

export class DeviceService {
  /**
   * Register a hardware device and its client AES Key (decrypted from RSA wrapper).
   */
  static async registerKey(deviceUuid: string, encryptedAesKey: string, ipAddress: string = ""): Promise<void> {
    const existing = await DeviceKeyMap.findOne({ where: { deviceUuid } });
    if (existing) {
      throw new HttpError(403, "Device already registered");
    }

    let clientAesKeyBuffer: Buffer;
    try {
      clientAesKeyBuffer = CryptoService.decryptRSA(encryptedAesKey);
      if (clientAesKeyBuffer.length !== 32) {
        throw new Error("Decrypted AES key must be exactly 32 bytes (256-bit)");
      }
    } catch (error: any) {
      throw new HttpError(400, `Failed to decrypt AES key: ${error.message}`);
    }

    await DeviceKeyMap.create({
      deviceUuid,
      ipAddress,
      clientAesKey: clientAesKeyBuffer.toString("hex"),
      isOnline: true
    });
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
  }
}
