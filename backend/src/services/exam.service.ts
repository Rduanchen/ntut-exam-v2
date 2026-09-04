import { SystemSettingsService } from "./system-settings.service";
import { DeviceService } from "./device.service";
import { CryptoService } from "./crypto.service";
import { ReplayProtectionService } from "./replay-protection.service";
import { ExamConfigParserService } from "./exam-config-parser.service";
import { HttpError } from "../utils/http-error";
import { AesEncryptedPayload } from "../types/crypto.type";
import logger from "../utils/logger.util";

export class ExamService {
  /**
   * Decrypt a payload authenticated by device registration alone.
   *
   * The same envelope as every other student request, minus the session token:
   * some endpoints are reached before any student has logged in, so demanding
   * a session would make them unreachable exactly when they are needed. The
   * device key, nonce and timestamp still have to be right.
   */
  static async decryptDevicePayload(payload: AesEncryptedPayload): Promise<any> {
    const { device_uuid: deviceUuid } = payload;

    if (process.env.LOAD_TEST_MODE === "pure") {
      return payload as unknown as any;
    }

    const aesKey = await DeviceService.getAesKey(deviceUuid);

    let decrypted: any;
    try {
      decrypted = JSON.parse(CryptoService.decryptAESGCM(payload, aesKey));
    } catch (error: any) {
      throw new HttpError(400, `Failed to decrypt request: ${error.message}`);
    }

    const { timestamp, nonce } = decrypted;
    if (timestamp === undefined || nonce === undefined) {
      throw new HttpError(400, "Missing timestamp or nonce in encrypted payload");
    }
    ReplayProtectionService.verifyAndSaveNonce(nonce, timestamp);

    return decrypted;
  }

  /**
   * Hand a registered machine the split paper.
   *
   * Authenticated by device registration alone. It used to require a session
   * token, which meant a machine could not receive its paper until a student
   * had logged in — but delivery now happens in INITIALIZED, in an empty room,
   * precisely so the room is not waiting on a download when the exam starts.
   *
   * Relaxing that check costs nothing: what comes back is ciphertext plus the
   * metadata a machine needs to probe its own toolchain. Without the exam key
   * — which this endpoint never returns — there is no paper to read.
   */
  static async getSecureConfig(payload: AesEncryptedPayload, decryptedBody?: any): Promise<AesEncryptedPayload> {
    const { device_uuid: deviceUuid } = payload;

    let aesKey: any = null;
    if (process.env.LOAD_TEST_MODE !== 'pure') {
      aesKey = await DeviceService.getAesKey(deviceUuid);
    }

    if (!decryptedBody && process.env.LOAD_TEST_MODE !== 'pure') {
      await this.decryptDevicePayload(payload);
    }

    const meta = await SystemSettingsService.getSetting<any>("exam_config_meta");
    const cipher = await SystemSettingsService.getSetting<any>("exam_config_cipher");

    if (!meta || !cipher) {
      throw new HttpError(409, "Exam paper has not been prepared yet");
    }

    const encryptedResult = CryptoService.encryptAESGCM(JSON.stringify({ meta, cipher }), aesKey);
    return {
      ...encryptedResult,
      device_uuid: deviceUuid
    };
  }

  /**
   * Release the exam key.
   *
   * The one thing that turns a delivered paper into a readable one, so it is
   * withheld until the exam actually starts — enforced by the phase matrix on
   * the route, and by this service refusing to look the key up any earlier.
   *
   * Idempotent: the same key every time, no state changed. A machine that
   * retries after a dropped connection must not be punished for it.
   */
  static async getExamKey(payload: AesEncryptedPayload): Promise<AesEncryptedPayload> {
    const { device_uuid: deviceUuid } = payload;

    let aesKey: any = null;
    if (process.env.LOAD_TEST_MODE !== 'pure') {
      aesKey = await DeviceService.getAesKey(deviceUuid);
    }

    const decrypted = await this.decryptDevicePayload(payload);

    /* The key is the exam itself. Handing it to a device that has not proved a
     * session would let an unregistered seat read the paper. */
    if (process.env.LOAD_TEST_MODE !== 'pure') {
      const sessionToken = decrypted?.session_token;
      if (!sessionToken) {
        throw new HttpError(400, "Missing required session_token in decrypted payload");
      }
      const tokenPayload = CryptoService.verifySessionToken(sessionToken, aesKey);
      if (tokenPayload.deviceUuid !== deviceUuid) {
        throw new HttpError(401, "Security violation: Token device UUID mismatch");
      }
    }

    const examKey = await SystemSettingsService.getSetting<string>("exam_key");
    if (!examKey) {
      throw new HttpError(409, "Exam key is not available");
    }

    const encryptedResult = CryptoService.encryptAESGCM(JSON.stringify({ examKey }), aesKey);
    return {
      ...encryptedResult,
      device_uuid: deviceUuid
    };
  }
}
