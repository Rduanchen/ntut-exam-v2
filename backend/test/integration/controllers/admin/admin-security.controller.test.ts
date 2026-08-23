import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import type express from "express";

import { createApp } from "../../../../src/app";
import { adminRequest } from "../../../helpers/admin-request";
import { buildUser, buildDeviceKey, buildAesKey } from "../../../fixtures/identity.fixture";

import { User } from "../../../../src/models/user.model";
import { DeviceKeyMap } from "../../../../src/models/device-key-map.model";

describe("AdminSecurityController (integration)", () => {
  let app: express.Express;

  beforeEach(() => {
    app = createApp();
  });

  describe("GET /admin/device", () => {
    it("returns connection status for every seeded user", async () => {
      await User.create({ ...buildUser({ testId: "112590003", name: "Charlie", ipAddress: "127.0.0.1" }) });

      const res = await adminRequest(app).get("/admin/device");

      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty("id");
      expect(res.body[0]).toHaveProperty("name");
      expect(res.body[0]).toHaveProperty("ipAddress");
      expect(res.body[0]).toHaveProperty("deviceUuid");
      expect(res.body[0]).toHaveProperty("isOnline");
    });

    it("returns 401 without an admin token", async () => {
      const res = await request(app).get("/admin/device");

      expect(res.status).toBe(401);
      expect(res.body.error).toContain("Unauthorized");
    });
  });

  describe("PUT /admin/users/:testId/reset-device", () => {
    it("clears the device binding of a bound user", async () => {
      const { hex } = buildAesKey();
      await DeviceKeyMap.create({ ...buildDeviceKey({ deviceUuid: "dev-bound", clientAesKey: hex }) });
      await User.create({ ...buildUser({ testId: "112590003", name: "Charlie", deviceUuid: "dev-bound" }) });

      const res = await adminRequest(app).put("/admin/users/112590003/reset-device");

      expect(res.status).toBe(200);

      const dbUser = await User.findOne({ where: { testId: "112590003" } });
      expect(dbUser!.deviceUuid).toBeNull();
    });

    it("returns 401 with an incorrect admin token", async () => {
      const res = await adminRequest(app, "wrong-token").put("/admin/users/123/reset-device");

      expect(res.status).toBe(401);
    });
  });

  describe("DELETE /admin/device/:deviceUuid", () => {
    it("deletes the stored device key", async () => {
      const { hex } = buildAesKey();
      await DeviceKeyMap.create({ ...buildDeviceKey({ deviceUuid: "dev-bound", clientAesKey: hex }) });

      const res = await adminRequest(app).delete("/admin/device/dev-bound");

      expect(res.status).toBe(200);
      expect(await DeviceKeyMap.findOne({ where: { deviceUuid: "dev-bound" } })).toBeNull();
    });

    it("returns 404 for a device that does not exist", async () => {
      const res = await adminRequest(app).delete("/admin/device/ghost-device");

      expect(res.status).toBe(404);
    });
  });
});
