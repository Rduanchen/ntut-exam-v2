import { describe, it, expect, beforeEach } from "vitest";
import crypto from "crypto";
import request from "supertest";
import type express from "express";

import { createApp } from "../../../../src/app";
import { TestClient } from "../../../helpers/test-client";
import { buildExamConfig } from "../../../fixtures/exam-config.fixture";

import { User } from "../../../../src/models/user.model";
import { DeviceKeyMap } from "../../../../src/models/device-key-map.model";
import { SystemSettings } from "../../../../src/models/system-settings.model";
import { CryptoService } from "../../../../src/services/crypto.service";
import { DeviceService } from "../../../../src/services/device.service";
import { SystemSettingsService } from "../../../../src/services/system-settings.service";
import { ExamState } from "../../../../src/services/exam-state.service";
import { seedExamPhase, satisfyInitializePreconditions } from "../../../helpers/exam-phase";

describe("UserController (integration)", () => {
  let app: express.Express;

  beforeEach(async () => {
    app = createApp();
    /* Student endpoints are phase-gated. Seed a running exam so these tests
     * exercise the endpoint rather than the gate; the gate has its own tests
     * in test/unit/middlewares/exam-phase.middleware.test.ts. */
    await seedExamPhase(ExamState.IN_PROGRESS);
  });

  const seedConfig = async () =>
    SystemSettings.upsert({
      name: "exam_config",
      value: JSON.stringify(buildExamConfig()),
    });

  describe("GET /user/auth/rsa-public-key", () => {
    it("returns a PEM public key", async () => {
      const res = await request(app).get("/user/auth/rsa-public-key");

      expect(res.status).toBe(200);
      expect(res.body.publicKey).toContain("BEGIN PUBLIC KEY");
    });
  });

  describe("GET /user/auth/student-id", () => {
    it("returns 404 when no student is assigned to the caller IP", async () => {
      const res = await request(app).get("/user/auth/student-id");

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("Not Found");
    });
  });

  describe("POST /user/auth/register-device", () => {
    it("returns 400 when device_uuid or encrypted_aes_key is missing", async () => {
      const res = await request(app).post("/user/auth/register-device").send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Bad Request");
    });

    it("registers a machine while self-service is open", async () => {
      await SystemSettingsService.setAllowDeviceRegistration(true);
      const client = new TestClient(app);

      await expect(client.registerDevice("device-macbook-pro")).resolves.toMatchObject({
        deviceUuid: "device-macbook-pro",
      });
    });

    it("lets the same machine re-key itself while self-service is open", async () => {
      /* A restart arrives as an unregistered machine with a new key, because
       * the key only ever lived in memory. During the phase where machines set
       * themselves up, that needs no ceremony — refusing it is what used to
       * make a crash unrecoverable. */
      await SystemSettingsService.setAllowDeviceRegistration(true);
      await new TestClient(app).registerDevice("device-macbook-pro");

      const again = await new TestClient(app).registerDevice("device-macbook-pro");

      expect(again.deviceUuid).toBe("device-macbook-pro");
    });

    it("sends a machine to the TA once self-service has closed", async () => {
      await SystemSettingsService.setAllowDeviceRegistration(true);
      await new TestClient(app).registerDevice("device-macbook-pro");
      await SystemSettingsService.setAllowDeviceRegistration(false);

      const keyRes = await request(app).get("/user/auth/rsa-public-key");
      const encrypted = crypto
        .publicEncrypt(
          {
            key: keyRes.body.publicKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: "sha256",
          },
          crypto.randomBytes(32),
        )
        .toString("base64");

      const refused = await request(app)
        .post("/user/auth/register-device")
        .send({ device_uuid: "device-macbook-pro", encrypted_aes_key: encrypted });

      expect(refused.status).toBe(403);
      expect(refused.body.code).toBe("entry_pending");
    });
  });

  describe("POST /user/auth/login", () => {
    it("returns 400 when the encrypted payload fields are missing", async () => {
      const res = await request(app).post("/user/auth/login").send({ device_uuid: "d" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Missing encrypted payload fields");
    });

    it("completes key exchange, binds the device, and blocks a second device", async () => {
      const studentId = "112590001";
      await User.create({ testId: studentId, name: "Alice Wang", ipAddress: null });

      const client = new TestClient(app);
      await client.registerDevice("device-macbook-pro");

      const { sessionToken, response } = await client.login(studentId);
      expect(response.status).toBe(200);
      expect(sessionToken).toBeDefined();

      const dbUser = await User.findOne({ where: { testId: studentId } });
      expect(dbUser!.deviceUuid).toBe("device-macbook-pro");

      // A second device must not be able to log the same student in.
      const second = new TestClient(app);
      await second.registerDevice("device-iphone-13");
      const blocked = await second.attemptLogin(studentId);

      expect(blocked.status).toBe(403);
    });

    it("rejects login when the caller IP does not match the preset IP", async () => {
      const studentId = "112590002";
      await User.create({
        testId: studentId,
        name: "Bob Chen",
        ipAddress: "192.168.1.200", // deliberate mismatch against the loopback caller
      });

      const client = new TestClient(app);
      const { aesKey } = await client.registerDevice("device-pc-1");

      // Re-register the key against a different IP to reproduce the mismatch.
      await DeviceKeyMap.destroy({ where: { deviceUuid: "device-pc-1" } });
      await DeviceKeyMap.create({
        deviceUuid: "device-pc-1",
        ipAddress: "192.168.1.100",
        clientAesKey: aesKey.toString("hex"),
      });

      const encryptedLogin = CryptoService.encryptAESGCM(
        JSON.stringify({ testId: studentId }),
        aesKey,
      );
      const res = await request(app)
        .post("/user/auth/login")
        .send({ ...encryptedLogin, device_uuid: "device-pc-1" });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Your device ip is not match");
    });
  });

  describe("POST /user/exam/config", () => {
    it("returns the split paper encrypted to the device key", async () => {
      await seedConfig();
      await satisfyInitializePreconditions();
      const studentId = "112590004";
      await User.create({ testId: studentId, name: "Dora", ipAddress: null });

      const client = new TestClient(app);
      await client.registerDevice("device-exam-1");
      await client.login(studentId);

      const res = await client.post("/user/exam/config");

      expect(res.status).toBe(200);
      expect(res.body.ciphertext).toBeDefined();

      const payload = client.decrypt(res.body);
      expect(payload.meta.sections[0].puzzles[0].id).toBe("Q1");
      expect(payload.cipher.ciphertext).toBeDefined();
      // The half that would tell a student what the exam is about stays shut.
      expect(JSON.stringify(payload.meta)).not.toContain("subtasks");
    });

    it("returns 401 for a device that was never registered", async () => {
      await seedConfig();

      const res = await request(app)
        .post("/user/exam/config")
        .send({ iv: "aa", ciphertext: "bb", tag: "cc", device_uuid: "ghost-device" });

      expect(res.status).toBe(401);
    });
  });

  describe("device registration service contract", () => {
    it("stores the AES key in hex so getAesKey can decode it", async () => {
      const client = new TestClient(app);
      const { aesKey } = await client.registerDevice("device-hex-check");

      const stored = await DeviceService.getAesKey("device-hex-check");
      expect(stored).toEqual(aesKey);
    });
  });

  describe('GET /user/exam/status', () => {
    it('reports the current exam state without authentication', async () => {
      const res = await request(app).get('/user/exam/status');

      expect(res.status).toBe(200);
      // Note: the user-facing endpoint names this field `status`, while the
      // admin endpoint names the same value `state`.
      expect(res.body).toHaveProperty('status');
    });
  });

  describe('POST /user/exam/messages', () => {
    it('returns missed messages encrypted to the session key', async () => {
      await seedConfig();
      const studentId = '112590005';
      await User.create({ testId: studentId, name: 'Eve', ipAddress: null });

      const client = new TestClient(app);
      await client.registerDevice('device-msg-1');
      await client.login(studentId);

      const res = await client.post('/user/exam/messages', { lastMessageId: 0 });

      expect(res.status).toBe(200);
      expect(res.body.ciphertext).toBeDefined();
    });

    it('returns 400 when the encrypted envelope is incomplete', async () => {
      const res = await request(app).post('/user/exam/messages').send({ device_uuid: 'd' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing required cryptographic fields');
    });
  });
});
