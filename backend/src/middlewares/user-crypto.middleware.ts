import { Request, Response, NextFunction } from "express";
import { DeviceService } from "../services/device.service";
import { CryptoService } from "../services/crypto.service";
import { ReplayProtectionService } from "../services/replay-protection.service";
import { HttpError } from "../utils/http-error";
import { AesEncryptedPayload } from "../types/crypto.type";

/**
 * Middleware protecting secure student desktop routes.
 * Performs AES-GCM decryption, replay protection, and session verification.
 */
export async function decryptAndVerifyDeviceSession(req: Request, res: Response, next: NextFunction) {
  const { iv, ciphertext, tag, device_uuid } = req.body as AesEncryptedPayload;

  if (!iv || !ciphertext || !tag || !device_uuid) {
    return next(new HttpError(400, "Bad Request: Missing required cryptographic fields"));
  }

  try {
    // 1. Get AES key
    const aesKey = await DeviceService.getAesKey(device_uuid);

    // 2. Decrypt GCM payload
    const decryptedText = CryptoService.decryptAESGCM(req.body, aesKey);
    const decryptedBody = JSON.parse(decryptedText);

    const { session_token, timestamp, nonce } = decryptedBody;
    if (!session_token || !timestamp || !nonce) {
      return next(new HttpError(400, "Bad Request: Decrypted body missing session_token, timestamp, or nonce"));
    }

    // 3. Verify signature
    const tokenPayload = CryptoService.verifySessionToken(session_token, aesKey);
    if (tokenPayload.deviceUuid !== device_uuid) {
      return next(new HttpError(401, "Unauthorized: Session token does not match device UUID"));
    }

    // 4. Enforce Replay Protection
    ReplayProtectionService.verifyAndSaveNonce(nonce, timestamp);

    // 5. Mount session information on Request
    req.userSession = {
      testId: tokenPayload.testId,
      deviceUuid: device_uuid,
      decryptedBody
    };

    next();
  } catch (error: any) {
    if (error instanceof HttpError) {
      next(error);
    } else {
      next(new HttpError(401, `Cryptographic session verification failed: ${error.message}`));
    }
  }
}
export default decryptAndVerifyDeviceSession;
