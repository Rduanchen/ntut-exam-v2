import { Request, Response, NextFunction } from "express";
import { CryptoService } from "../../services/crypto.service";
import { DeviceService } from "../../services/device.service";
import { AuthService } from "../../services/auth.service";
import { ExamService } from "../../services/exam.service";
import * as MessageService from "../../services/message.service";
import { ExamStateService } from "../../services/exam-state.service";
import { User } from "../../models/user.model";
import { HttpError } from "../../utils/http-error";
import { normalizeIp } from "../../utils/ip.util";

export class UserController {
  static async getLanguages(req: Request, res: Response, next: NextFunction) {
    try { res.status(200).json(await ExamService.getLanguages(req.body)); }
    catch (error) { next(error); }
  }

  /**
   * GET /user/auth/rsa-public-key
   * Retrieve the server's RSA Public Key in PEM format.
   */
  static getPublicKey(req: Request, res: Response, next: NextFunction) {
    try {
      const publicKey = CryptoService.getRsaPublicKey();
      res.status(200).json({ publicKey });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /user/auth/student-id
   * Helper endpoint for desktop client to automatically retrieve its student ID by IP address.
   */
  static async getStudentIdByIp(req: Request, res: Response, next: NextFunction) {
    try {
      const ipAddress = normalizeIp(req.ip || req.socket.remoteAddress || "");
      if (!ipAddress) {
        throw new HttpError(400, "Bad Request: Could not determine client IP address");
      }

      const user = await User.findOne({ where: { ipAddress } });
      if (!user) {
        throw new HttpError(404, `Not Found: No student assigned to IP address ${ipAddress}`);
      }

      res.status(200).json({ testId: user.testId });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /user/auth/register-device
   * Register device UUID with encrypted AES key.
   */
  static async registerDevice(req: Request, res: Response, next: NextFunction) {
    const { device_uuid, encrypted_aes_key, resubmit } = req.body;
    if (!device_uuid || !encrypted_aes_key) {
      return next(new HttpError(400, "Bad Request: Missing device_uuid or encrypted_aes_key"));
    }

    try {
      const ipAddress = normalizeIp(req.ip || req.socket.remoteAddress || "");
      await DeviceService.registerKey(device_uuid, encrypted_aes_key, ipAddress, resubmit === true);
      res.status(200).json({ message: "Device registered successfully" });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /user/auth/login
   * Authenticate student and bind device.
   */
  static async login(req: Request, res: Response, next: NextFunction) {
    if (process.env.LOAD_TEST_MODE === 'pure') {
      const { device_uuid } = req.body;
      if (!device_uuid) {
        return next(new HttpError(400, "Bad Request: Missing device_uuid in pure mode"));
      }
    } else {
      const { iv, ciphertext, tag, device_uuid } = req.body;
      if (!iv || !ciphertext || !tag || !device_uuid) {
        return next(new HttpError(400, "Bad Request: Missing encrypted payload fields"));
      }
    }

    try {
      const clientIp = normalizeIp(req.ip || req.socket.remoteAddress || "");
      const session_token = await AuthService.loginAndBind(req.body, clientIp);
      res.status(200).json({ session_token });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /user/exam/config
   * Securely retrieve encrypted exam config.
   */
  static async getConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const payload = req.body;
      const decryptedBody = req.userSession?.decryptedBody;
      const encryptedConfig = await ExamService.getSecureConfig(payload, decryptedBody);
      res.status(200).json(encryptedConfig);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /user/exam/key
   *
   * Release the exam key. Reachable only in IN_PROGRESS — the phase matrix
   * refuses it earlier, and the service refuses to look the key up.
   *
   * Never broadcast. The socket announces that the exam has started and
   * nothing else; a broadcast reaches every listener without proving who any
   * of them are, which is not a channel a key can travel on.
   */
  static async getExamKey(req: Request, res: Response, next: NextFunction) {
    try {
      const encrypted = await ExamService.getExamKey(req.body);
      res.status(200).json(encrypted);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /user/exam/environment-report
   *
   * Report this machine's environment-check verdict.
   *
   * Authenticated by device registration alone, not by a session token: the
   * check runs in INITIALIZED, before any student has logged in, so requiring
   * a session would make the report impossible exactly when it is wanted.
   *
   * The payload is deliberately thin — a status and the languages that failed.
   * The full diagnostic stays on the machine. Compiler output is unbounded and
   * has frozen this system before when it was stored unbounded.
   */
  static async reportEnvironmentCheck(req: Request, res: Response, next: NextFunction) {
    try {
      const payload = req.body;
      const deviceUuid = payload?.device_uuid;
      if (!deviceUuid) {
        throw new HttpError(400, "Bad Request: Missing device_uuid");
      }

      const authenticated = await ExamService.authenticateRegisteredDevice(payload);
      const decrypted = authenticated.body;
      const status = decrypted.status;
      if (status !== "RUNNING" && status !== "PASSED" && status !== "FAILED") {
        throw new HttpError(400, "Bad Request: status must be RUNNING, PASSED or FAILED");
      }

      const failed = Array.isArray(decrypted?.failedLanguages)
        ? decrypted.failedLanguages
          .filter((l: unknown): l is string => typeof l === "string")
          .slice(0, 20)
          .map((language: string) => language.slice(0, 32))
        : [];

      if (typeof decrypted.sequence !== 'number' || !Number.isSafeInteger(decrypted.sequence) || decrypted.sequence <= 0) {
        throw new HttpError(400, 'Invalid report sequence');
      }
      if (status !== 'RUNNING' && status !== 'PASSED' && status !== 'FAILED') throw new HttpError(400, 'Invalid status');
      await DeviceService.recordOrderedEnvironmentReport(deviceUuid, authenticated.device.clientAesKey,
        decrypted.sequence, status, failed);

      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /user/exam/messages
   * Securely retrieve missed messages after a given message ID.
   */
  static async getMissedMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const decryptedBody = req.userSession?.decryptedBody;
      const deviceUuid = req.userSession?.deviceUuid;
      if (!decryptedBody || !deviceUuid) {
         return next(new HttpError(401, "Unauthorized: Missing session details"));
      }

      const lastMessageId = decryptedBody.lastMessageId || 0;
      const messages = await MessageService.getMessagesAfterId(Number(lastMessageId));

      let aesKey: any = null;
      if (process.env.LOAD_TEST_MODE !== 'pure') {
        aesKey = await DeviceService.getAesKey(deviceUuid);
      }
      const encryptedResult = CryptoService.encryptAESGCM(JSON.stringify(messages), aesKey);

      res.status(200).json({
        ...encryptedResult,
        device_uuid: deviceUuid
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /user/exam/status
   * Retrieve the current exam state.
   */
  static async getExamStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const status = await ExamStateService.getCurrentState();
      res.status(200).json({ status });
    } catch (error) {
      next(error);
    }
  }
}
