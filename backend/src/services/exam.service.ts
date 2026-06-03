import { SystemSettingsService } from "./system-settings.service";
import { DeviceService } from "./device.service";
import { CryptoService } from "./crypto.service";
import { ReplayProtectionService } from "./replay-protection.service";
import { HttpError } from "../utils/http-error";
import { AesEncryptedPayload } from "../types/crypto.type";
import logger from "../utils/logger.util";

export class ExamService {
  static async getSecureTestCase(payload: AesEncryptedPayload, decryptedBody?: any): Promise<AesEncryptedPayload> {
    const { device_uuid: deviceUuid } = payload;
    const aesKey = await DeviceService.getAesKey(deviceUuid);

    let decrypted = decryptedBody;
    if (!decrypted) {
      try {
        const plaintext = CryptoService.decryptAESGCM(payload, aesKey);
        decrypted = JSON.parse(plaintext);
      } catch (error: any) {
        throw new HttpError(400, `Failed to decrypt request: ${error.message}`);
      }

      const { timestamp, nonce } = decrypted;
      if (timestamp === undefined || nonce === undefined) {
        throw new HttpError(400, "Missing timestamp or nonce in encrypted payload");
      }
      ReplayProtectionService.verifyAndSaveNonce(nonce, timestamp);
    }

    const { session_token: sessionToken, question_id: questionId } = decrypted;
    if (!sessionToken || !questionId) {
      throw new HttpError(400, "Missing required fields in decrypted payload");
    }

    let tokenPayload: any;
    try {
      tokenPayload = CryptoService.verifySessionToken(sessionToken, aesKey);
    } catch (error: any) {
      throw new HttpError(401, `Session validation failed: ${error.message}`);
    }

    if (tokenPayload.deviceUuid !== deviceUuid) {
      throw new HttpError(401, "Security violation: Token device UUID mismatch");
    }

    let testcaseContent = "";
    try {
      const config = await SystemSettingsService.getSetting<any>("exam_config");
      if (config?.sections) {
        let foundPuzzle: any = null;
        for (const section of config.sections) {
          foundPuzzle = section.puzzles?.find((p: any) => p.id === questionId);
          if (foundPuzzle) break;
        }

        if (foundPuzzle) {
          testcaseContent = JSON.stringify(foundPuzzle.subtasks);
        }
      }
    } catch (err: any) {
      logger.warn(`Failed to retrieve testcase from exam_config: ${err.message}`);
    }

    if (!testcaseContent) {
      testcaseContent = JSON.stringify({
        questionId,
        subtasks: [
          {
            title: "Default Subtask",
            score: 100,
            visible: [{ input: "hello", output: "hello" }],
            hidden: [{ input: "secret", output: "secret" }]
          }
        ]
      });
    }

    const encryptedResult = CryptoService.encryptAESGCM(testcaseContent, aesKey);
    return {
      ...encryptedResult,
      device_uuid: deviceUuid
    };
  }
}
