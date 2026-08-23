import { describe, it, expect } from "vitest";
import crypto from "crypto";

import { ReplayProtectionService } from "../../../src/services/replay-protection.service";
import { HttpError } from "../../../src/utils/http-error";

describe("ReplayProtectionService", () => {
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

    it("should reject a timestamp too far in the future", () => {
      const nonce = crypto.randomBytes(16).toString("hex");
      const futureTimestamp = Date.now() + 15000;

      expect(() => {
        ReplayProtectionService.verifyAndSaveNonce(nonce, futureTimestamp);
      }).toThrowError(HttpError);
    });

    it("should assign a 401 status code to replay rejections", () => {
      const nonce = "status-code-nonce";
      ReplayProtectionService.verifyAndSaveNonce(nonce, Date.now());

      try {
        ReplayProtectionService.verifyAndSaveNonce(nonce, Date.now());
        expect.unreachable("expected a replay rejection");
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpError);
        expect(err.statusCode).toBe(401);
      }
    });
  });
});
