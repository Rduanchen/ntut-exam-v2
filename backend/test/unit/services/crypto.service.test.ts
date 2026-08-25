import { describe, it, expect } from "vitest";
import crypto from "crypto";

import { CryptoService } from "../../../src/services/crypto.service";

/** RSA-OAEP(SHA-256) wrap, mirroring what the desktop client does. */
function encryptRSA(data: Buffer, publicKeyPem: string): string {
  const encrypted = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    data
  );
  return encrypted.toString("base64");
}

describe("CryptoService", () => {
  describe("CryptoService Primitives", () => {
    it("should encrypt and decrypt using RSA public and private keys", () => {
      const aesKey = crypto.randomBytes(32);
      const publicKey = CryptoService.getRsaPublicKey();

      const encrypted = encryptRSA(aesKey, publicKey);
      const decrypted = CryptoService.decryptRSA(encrypted);

      expect(decrypted).toEqual(aesKey);
    });

    it("should encrypt and decrypt using AES-256-GCM", () => {
      const aesKey = crypto.randomBytes(32);
      const plaintext = "Hello World NTUT";

      const encryptedPayload = CryptoService.encryptAESGCM(plaintext, aesKey);
      const payloadWithDevice = {
        ...encryptedPayload,
        device_uuid: "dev-123",
      };

      const decrypted = CryptoService.decryptAESGCM(payloadWithDevice, aesKey);
      expect(decrypted).toBe(plaintext);
    });

    it("should sign and verify session tokens", () => {
      const aesKey = crypto.randomBytes(32);
      const payload = { testId: "student123", deviceUuid: "dev-456" };

      const token = CryptoService.generateSessionToken(payload, aesKey);
      const verified = CryptoService.verifySessionToken(token, aesKey);

      expect(verified).toEqual(payload);
    });

    it("should throw error if session token signature is tampered", () => {
      const aesKey = crypto.randomBytes(32);
      const payload = { testId: "student123", deviceUuid: "dev-456" };

      const token = CryptoService.generateSessionToken(payload, aesKey);
      const tamperedToken = token + "a"; // append character

      expect(() => {
        CryptoService.verifySessionToken(tamperedToken, aesKey);
      }).toThrow();
    });

    it("should reject a session token verified with a different AES key", () => {
      const aesKey = crypto.randomBytes(32);
      const otherKey = crypto.randomBytes(32);
      const token = CryptoService.generateSessionToken({ testId: "s1" }, aesKey);

      expect(() => CryptoService.verifySessionToken(token, otherKey)).toThrow();
    });

    it("should fail AES-GCM decryption when the auth tag is tampered", () => {
      const aesKey = crypto.randomBytes(32);
      const payload = CryptoService.encryptAESGCM("secret", aesKey);

      const tag = Buffer.from(payload.tag, "base64");
      tag[0] = tag[0] ^ 0xff;

      expect(() =>
        CryptoService.decryptAESGCM({ ...payload, tag: tag.toString("base64"), device_uuid: "d" }, aesKey)
      ).toThrow();
    });
  });
});
