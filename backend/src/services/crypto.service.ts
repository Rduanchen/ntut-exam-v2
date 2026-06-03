import crypto from "crypto";
import { AesEncryptedPayload } from "../types/crypto.type";

export class CryptoService {
  private static rsaPrivateKey: string;
  private static rsaPublicKey: string;

  static {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    this.rsaPrivateKey = process.env.RSA_PRIVATE_KEY || privateKey;
    this.rsaPublicKey = process.env.RSA_PUBLIC_KEY || publicKey;
  }

  static getRsaPublicKey(): string {
    return this.rsaPublicKey;
  }

  static decryptRSA(encryptedData: string): Buffer {
    try {
      const buffer = /^[0-9a-fA-F]+$/.test(encryptedData)
        ? Buffer.from(encryptedData, "hex")
        : Buffer.from(encryptedData, "base64");

      return crypto.privateDecrypt(
        {
          key: this.rsaPrivateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha256",
        },
        buffer
      );
    } catch (error: any) {
      throw new Error(`RSA Decryption failed: ${error.message}`);
    }
  }

  static decryptAESGCM(payload: AesEncryptedPayload, aesKey: Buffer): string {
    try {
      const iv = Buffer.from(payload.iv, "base64");
      const tag = Buffer.from(payload.tag, "base64");
      const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(payload.ciphertext, "base64", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (error: any) {
      throw new Error(`AES-GCM Decryption failed: ${error.message}`);
    }
  }

  static encryptAESGCM(plaintext: string, aesKey: Buffer): Omit<AesEncryptedPayload, "device_uuid"> {
    try {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
      let ciphertext = cipher.update(plaintext, "utf8", "base64");
      ciphertext += cipher.final("base64");
      const tag = cipher.getAuthTag();
      return {
        iv: iv.toString("base64"),
        ciphertext,
        tag: tag.toString("base64"),
      };
    } catch (error: any) {
      throw new Error(`AES-GCM Encryption failed: ${error.message}`);
    }
  }

  static generateSessionToken(payload: object, aesKey: Buffer): string {
    const payloadStr = JSON.stringify(payload);
    const payloadB64 = Buffer.from(payloadStr, "utf8").toString("base64");
    const hmac = crypto
      .createHmac("sha256", aesKey)
      .update(payloadB64)
      .digest("base64");
    return `${payloadB64}.${hmac}`;
  }

  static verifySessionToken(token: string, aesKey: Buffer): any {
    const parts = token.split(".");
    if (parts.length !== 2) {
      throw new Error("Invalid token format");
    }
    const [payloadB64, hmac] = parts;
    const expectedHmac = crypto
      .createHmac("sha256", aesKey)
      .update(payloadB64)
      .digest("base64");
    if (hmac !== expectedHmac) {
      throw new Error("HMAC signature verification failed");
    }
    const payloadStr = Buffer.from(payloadB64, "base64").toString("utf8");
    return JSON.parse(payloadStr);
  }
}
