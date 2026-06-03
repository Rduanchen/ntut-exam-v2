import { HttpError } from "../utils/http-error";

export class ReplayProtectionService {
  private static nonces = new Set<string>();

  /**
   * Verify request timestamp drift and enforce unique nonces.
   * TTL is configured to match the maximum allowed drift duration (default: 10s).
   */
  static verifyAndSaveNonce(nonce: string, timestamp: number, allowedDriftMs: number = 10000): void {
    const now = Date.now();
    
    // 1. Verify timestamp drift
    if (Math.abs(now - timestamp) > allowedDriftMs) {
      throw new HttpError(401, "Request expired: Timestamp drift exceeds limit");
    }

    // 2. Enforce nonce uniqueness
    if (this.nonces.has(nonce)) {
      throw new HttpError(401, "Replay attack detected: Nonce has already been used");
    }

    // 3. Register nonce
    this.nonces.add(nonce);

    // 4. Cleanup nonce after TTL expiry
    setTimeout(() => {
      this.nonces.delete(nonce);
    }, allowedDriftMs);
  }
}
