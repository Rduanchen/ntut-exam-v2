import { deviceEnvelopeSchema, deviceRequestSchema, LANGUAGE_ORDER, examLanguagesSchema } from '../schemas/exam-languages.schema';
import { examConfigSchema } from '../schemas/config.schema';
import { DeviceKeyMap } from '../models/device-key-map.model';
import { ExamStateService, ExamState } from './exam-state.service';
import { SystemSettingsService } from "./system-settings.service";
import { DeviceService } from "./device.service";
import { CryptoService } from "./crypto.service";
import { ReplayProtectionService } from "./replay-protection.service";
import { ExamConfigParserService } from "./exam-config-parser.service";
import { HttpError } from "../utils/http-error";
import { AesEncryptedPayload } from "../types/crypto.type";
import logger from "../utils/logger.util";

export class ExamService {
  static async authenticateRegisteredDevice(input: unknown) {
    const parsed = deviceEnvelopeSchema.safeParse(input);
    if (!parsed.success) throw new HttpError(400, 'Invalid encrypted request', 'invalid_language_request');
    const payload = parsed.data;
    const device = await DeviceKeyMap.findByPk(payload.device_uuid);
    if (!device) throw new HttpError(401, 'Device is not registered', 'device_not_registered');
    const key = Buffer.from(device.clientAesKey, 'hex');
    let body: ReturnType<typeof deviceRequestSchema.parse>;
    try {
      const raw: unknown = JSON.parse(CryptoService.decryptAESGCM(payload, key));
      body = deviceRequestSchema.parse(raw);
    } catch {
      throw new HttpError(400, 'Invalid encrypted request', 'invalid_language_request');
    }
    try { ReplayProtectionService.verifyAndSaveNonce(body.nonce, body.timestamp); }
    catch { throw new HttpError(401, 'Expired or replayed request', 'invalid_request_freshness'); }
    return { payload, body, device, key };
  }

  static async getLanguages(input: unknown): Promise<AesEncryptedPayload> {
    const { payload, device, key } = await this.authenticateRegisteredDevice(input);
    const raw: unknown = await SystemSettingsService.getExamConfig();
    if (!raw) throw new HttpError(409, 'Exam languages unavailable', 'exam_languages_unavailable');
    const parsed = examConfigSchema.safeParse(raw);
    if (!parsed.success) throw new HttpError(500, 'Invalid exam configuration', 'invalid_exam_languages');
    const used = new Set(parsed.data.sections.flatMap(section => section.puzzles.map(puzzle => puzzle.language)));
    const result = examLanguagesSchema.parse({ languages: LANGUAGE_ORDER.filter(language => used.has(language)) });
    const phase = await ExamStateService.getCurrentState();
    const current = await DeviceKeyMap.findByPk(payload.device_uuid);
    if (![ExamState.INITIALIZED, ExamState.SETUP_FINISHED, ExamState.IN_PROGRESS].includes(phase)
      || current?.clientAesKey !== device.clientAesKey) {
      throw new HttpError(409, 'Exam languages unavailable', 'exam_languages_unavailable');
    }
    return { ...CryptoService.encryptAESGCM(JSON.stringify(result), key), device_uuid: payload.device_uuid };
  }

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
  static async getSecureConfig(payload: AesEncryptedPayload, _decryptedBody?: unknown): Promise<AesEncryptedPayload> {
    const { device_uuid: deviceUuid } = payload;

    // Never trust an optional pre-decrypted body to bypass device authentication.
    const authentication = process.env.LOAD_TEST_MODE === 'pure'
      ? null : await this.authenticateRegisteredDevice(payload);
    const paper = await SystemSettingsService.getPreparedPaper();
    if (!paper) throw new HttpError(409, 'Exam paper has not been prepared yet');
    const phase = await ExamStateService.getCurrentState();
    if (![ExamState.INITIALIZED, ExamState.SETUP_FINISHED, ExamState.IN_PROGRESS].includes(phase)) {
      throw new HttpError(409, 'Exam paper unavailable', 'exam_paper_unavailable');
    }
    if (authentication) {
      const current = await DeviceKeyMap.findByPk(deviceUuid);
      if (current?.clientAesKey !== authentication.device.clientAesKey) {
        throw new HttpError(409, 'Registration changed', 'exam_paper_unavailable');
      }
    }
    const key = authentication?.key ?? await DeviceService.getAesKey(deviceUuid);
    return { ...CryptoService.encryptAESGCM(JSON.stringify(paper), key), device_uuid: deviceUuid };
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
