import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Sequelize } from "sequelize-typescript";
import express from "express";
import crypto from "crypto";
import { AddressInfo } from "net";

import { User } from "../src/models/user.model";
import { DeviceKeyMap } from "../src/models/device-key-map.model";
import { SystemSettings } from "../src/models/system-settings.model";
import { UserActionLog } from "../src/models/user-action-log.model";

import { CryptoService } from "../src/services/crypto.service";
import { DeviceService } from "../src/services/device.service";
import { AuthService } from "../src/services/auth.service";
import { ReplayProtectionService } from "../src/services/replay-protection.service";
import { ExamService } from "../src/services/exam.service";

import userRouter from "../src/routes/user";
import adminRouter from "../src/routes/admin";
import { HttpError } from "../src/utils/http-error";

// Helper to encrypt data using RSA public key for test client simulation
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

describe("Cryptography & Device Binding Integration", () => {
  let testSequelize: Sequelize;
  let app: express.Express;
  let server: any;
  let serverUrl: string;

  beforeAll(async () => {
    // 1. Setup in-memory Sequelize
    testSequelize = new Sequelize({
      dialect: "sqlite",
      storage: ":memory:",
      models: [User, DeviceKeyMap, SystemSettings, UserActionLog],
      logging: false,
    });
    await testSequelize.sync();

    // 2. Setup Express app running on dynamic port
    app = express();
    app.use(express.json());

    // Register routes
    app.use("/user", userRouter);
    app.use("/admin", adminRouter);

    // Global error handler
    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      const status = err.statusCode || err.status || 500;
      res.status(status).json({ error: err.message || "Internal Server Error" });
    });

    // Start server
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        serverUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await testSequelize.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    // Clear databases
    await User.destroy({ where: {}, truncate: true });
    await DeviceKeyMap.destroy({ where: {}, truncate: true });
    await SystemSettings.destroy({ where: {}, truncate: true });
    await UserActionLog.destroy({ where: {}, truncate: true });
  });

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
  });

  describe("Replay Protection Service", () => {
    it("should allow a valid nonce and timestamp", () => {
      const nonce = crypto.randomBytes(16).toString("hex");
      const timestamp = Date.now();

      expect(() => {
        ReplayProtectionService.verifyAndSaveNonce(nonce, timestamp);
      }).not.toThrow();
    });

    it("should throw 401 if a nonce is reused within TTL", () => {
      const nonce = "duplicate-nonce";
      const timestamp = Date.now();

      ReplayProtectionService.verifyAndSaveNonce(nonce, timestamp);

      expect(() => {
        ReplayProtectionService.verifyAndSaveNonce(nonce, timestamp);
      }).toThrowError(HttpError);
    });

    it("should throw 401 if timestamp drift exceeds 10 seconds", () => {
      const nonce = crypto.randomBytes(16).toString("hex");
      const oldTimestamp = Date.now() - 15000; // 15s ago

      expect(() => {
        ReplayProtectionService.verifyAndSaveNonce(nonce, oldTimestamp);
      }).toThrowError(HttpError);
    });
  });

  describe("End-to-End Cryptographic API Scenarios", () => {
    it("should complete full key exchange, login binding, and secure retrieval of testcases", async () => {
      // Seed exam config
      await SystemSettings.create({
        name: "exam_config",
        value: JSON.stringify({
          sections: [
            {
              id: "S1",
              title: "Section 1",
              puzzles: [
                {
                  id: "Q1",
                  title: "Two Sum",
                  subtasks: []
                }
              ]
            }
          ]
        })
      });

      // 1. Get RSA Public Key
      const keyRes = await fetch(`${serverUrl}/user/auth/rsa-public-key`);
      const keyData = (await keyRes.json()) as { publicKey: string };
      expect(keyRes.status).toBe(200);
      expect(keyData.publicKey).toBeDefined();

      // 2. Generate and encrypt AES key
      const clientAesKey = crypto.randomBytes(32);
      const deviceUuid = "device-macbook-pro";
      const encryptedAesKey = encryptRSA(clientAesKey, keyData.publicKey);

      // Register device
      const regRes = await fetch(`${serverUrl}/user/auth/register-device`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_uuid: deviceUuid,
          encrypted_aes_key: encryptedAesKey,
        }),
      });
      const regData = await regRes.json();
      expect(regRes.status).toBe(200);

      // Verify double register is blocked with 403 Forbidden
      const regRes2 = await fetch(`${serverUrl}/user/auth/register-device`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_uuid: deviceUuid,
          encrypted_aes_key: encryptedAesKey,
        }),
      });
      expect(regRes2.status).toBe(403);

      // Seed student user (No preset IP)
      const studentId = "112590001";
      await User.create({
        testId: studentId,
        name: "Alice Wang",
        ipAddress: null,
      });

      // 3. Login
      const loginPayloadPlain = JSON.stringify({ testId: studentId });
      const encryptedLogin = CryptoService.encryptAESGCM(loginPayloadPlain, clientAesKey);
      const loginRes = await fetch(`${serverUrl}/user/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...encryptedLogin,
          device_uuid: deviceUuid,
        }),
      });
      const loginData = (await loginRes.json()) as { session_token: string };
      expect(loginRes.status).toBe(200);
      expect(loginData.session_token).toBeDefined();

      // Verify the user is bound to the device UUID
      const dbUser = await User.findOne({ where: { testId: studentId } });
      expect(dbUser!.deviceUuid).toBe(deviceUuid);

      // Verify logging in from another device is blocked
      const anotherDeviceUuid = "device-iphone-13";
      const anotherAesKey = crypto.randomBytes(32);
      const anotherEncryptedAesKey = encryptRSA(anotherAesKey, keyData.publicKey);

      await DeviceService.registerKey(anotherDeviceUuid, anotherEncryptedAesKey, "127.0.0.1");

      const anotherEncryptedLogin = CryptoService.encryptAESGCM(loginPayloadPlain, anotherAesKey);
      const badLoginRes = await fetch(`${serverUrl}/user/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...anotherEncryptedLogin,
          device_uuid: anotherDeviceUuid,
        }),
      });
      expect(badLoginRes.status).toBe(403); // blocked because student is already bound

      // 4. Secure retrieval of exam config
      const nonce = crypto.randomBytes(16).toString("hex");
      const timestamp = Date.now();
      const configPayloadPlain = JSON.stringify({
        session_token: loginData.session_token,
        timestamp,
        nonce,
      });

      const encryptedConfigPayload = CryptoService.encryptAESGCM(configPayloadPlain, clientAesKey);
      const configRes = await fetch(`${serverUrl}/user/exam/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...encryptedConfigPayload,
          device_uuid: deviceUuid,
        }),
      });

      expect(configRes.status).toBe(200);
      const secureConfig = (await configRes.json()) as any;
      expect(secureConfig.ciphertext).toBeDefined();

      // Decrypt config response
      const configDecryptedText = CryptoService.decryptAESGCM(secureConfig, clientAesKey);
      const configData = JSON.parse(configDecryptedText);
      expect(configData.sections).toBeDefined();
    });

    it("should respect preset IP binding rules", async () => {
      // Get public key
      const keyRes = await fetch(`${serverUrl}/user/auth/rsa-public-key`);
      const keyData = (await keyRes.json()) as { publicKey: string };
      const clientAesKey = crypto.randomBytes(32);
      const deviceUuid = "device-pc-1";
      const encryptedAesKey = encryptRSA(clientAesKey, keyData.publicKey);

      // Register device with local loopback IP
      await DeviceService.registerKey(deviceUuid, encryptedAesKey, "192.168.1.100");

      // Seed student user with a mismatching preset IP
      const studentId = "112590002";
      await User.create({
        testId: studentId,
        name: "Bob Chen",
        ipAddress: "192.168.1.200", // Mismatch
      });

      // Login attempt should throw 403 Forbidden
      const loginPayloadPlain = JSON.stringify({ testId: studentId });
      const encryptedLogin = CryptoService.encryptAESGCM(loginPayloadPlain, clientAesKey);
      const loginRes = await fetch(`${serverUrl}/user/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...encryptedLogin,
          device_uuid: deviceUuid,
        }),
      });

      expect(loginRes.status).toBe(403);
      const loginData = await loginRes.json();
      expect(loginData.error).toContain("Your device ip is not match");
    });
  });

  describe("Admin security operations", () => {
    it("should allow resetting user device binding and deleting keys with correct token", async () => {
      const studentId = "112590003";
      const deviceUuid = "dev-bound";
      const clientAesKey = crypto.randomBytes(32);
      await DeviceKeyMap.create({
        deviceUuid,
        ipAddress: "127.0.0.1",
        clientAesKey: clientAesKey.toString("hex"),
      });

      await User.create({
        testId: studentId,
        name: "Charlie",
        deviceUuid,
      });

      const adminSecret = "admin-secret";

      // 1. Reset device binding
      const resetRes = await fetch(`${serverUrl}/admin/users/${studentId}/reset-device`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${adminSecret}` },
      });
      expect(resetRes.status).toBe(200);

      const dbUser = await User.findOne({ where: { testId: studentId } });
      expect(dbUser!.deviceUuid).toBeNull();

      // 2. Delete device key
      const deleteRes = await fetch(`${serverUrl}/admin/device/${deviceUuid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminSecret}` },
      });
      expect(deleteRes.status).toBe(200);

      const dbDevice = await DeviceKeyMap.findOne({ where: { deviceUuid } });
      expect(dbDevice).toBeNull();
    });

    it("should allow getting all devices connection status", async () => {
      // Seed a user first
      await User.create({
        testId: "112590003",
        name: "Charlie",
        ipAddress: "127.0.0.1",
      });

      const adminSecret = "admin-secret";
      const res = await fetch(`${serverUrl}/admin/device`, {
        method: "GET",
        headers: { Authorization: `Bearer ${adminSecret}` },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any[];
      expect(data).toBeInstanceOf(Array);
      expect(data.length).toBeGreaterThan(0);
      expect(data[0]).toHaveProperty("id");
      expect(data[0]).toHaveProperty("name");
      expect(data[0]).toHaveProperty("ipAddress");
      expect(data[0]).toHaveProperty("deviceUuid");
      expect(data[0]).toHaveProperty("isOnline");
    });

    it("should block admin operations with incorrect token", async () => {
      const resetRes = await fetch(`${serverUrl}/admin/users/123/reset-device`, {
        method: "PUT",
        headers: { Authorization: "Bearer wrong-token" },
      });
      expect(resetRes.status).toBe(401);
    });
  });
});
