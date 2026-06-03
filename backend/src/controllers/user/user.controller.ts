import { Request, Response, NextFunction } from "express";
import { CryptoService } from "../../services/crypto.service";
import { DeviceService } from "../../services/device.service";
import { AuthService } from "../../services/auth.service";
import { ExamService } from "../../services/exam.service";
import { HttpError } from "../../utils/http-error";

export class UserController {
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
   * POST /user/auth/register-device
   * Register device UUID with encrypted AES key.
   */
  static async registerDevice(req: Request, res: Response, next: NextFunction) {
    const { device_uuid, encrypted_aes_key } = req.body;
    if (!device_uuid || !encrypted_aes_key) {
      return next(new HttpError(400, "Bad Request: Missing device_uuid or encrypted_aes_key"));
    }

    try {
      const ipAddress = req.ip || req.socket.remoteAddress || "";
      await DeviceService.registerKey(device_uuid, encrypted_aes_key, ipAddress);
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
    const { iv, ciphertext, tag, device_uuid } = req.body;
    if (!iv || !ciphertext || !tag || !device_uuid) {
      return next(new HttpError(400, "Bad Request: Missing encrypted payload fields"));
    }

    try {
      const clientIp = req.ip || req.socket.remoteAddress || "";
      const session_token = await AuthService.loginAndBind(req.body, clientIp);
      res.status(200).json({ session_token });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /user/exam/testcase
   * Securely retrieve encrypted testcase content.
   */
  static async getTestCase(req: Request, res: Response, next: NextFunction) {
    try {
      const payload = req.body;
      const decryptedBody = req.userSession?.decryptedBody;
      const encryptedTestCase = await ExamService.getSecureTestCase(payload, decryptedBody);
      res.status(200).json(encryptedTestCase);
    } catch (error) {
      next(error);
    }
  }
}
