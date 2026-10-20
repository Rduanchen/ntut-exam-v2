import crypto from "node:crypto";
import { CryptoService } from "./crypto.service";

/**
 * How the rehearsal talks to the system: over HTTP, to itself.
 *
 * Not by calling services directly, and that is the point of the whole
 * feature. Nearly everything a rehearsal exists to check lives above the
 * service layer — the phase matrix in `exam-phase.middleware`, AES-GCM
 * decryption and replay protection in `user-crypto.middleware`, the admin
 * token check, the 202-and-poll handover for judging. A rehearsal that called
 * services would prove the database is writable, not that an exam can be sat.
 *
 * The transport is injectable so the same client can be driven through
 * supertest in tests and through a real socket in production. Tests that
 * stubbed it out entirely would be testing the stub.
 */

export interface RehearsalResponse {
  status: number;
  body: unknown;
  /** Raw text, kept for diagnostics when the body is not JSON. */
  text: string;
}

export interface RehearsalRequest {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  /** Send the admin token. Uses the process's own, minting no new credential. */
  admin?: boolean;
}

export type RehearsalTransport = (request: RehearsalRequest) => Promise<RehearsalResponse>;

export const rehearsalBaseUrl = (path = "/admin"): string =>
  `http://127.0.0.1:${path.startsWith("/user/") ? (process.env.USER_PORT || 3001) : (process.env.ADMIN_PORT || process.env.PORT || 3000)}`;

/**
 * The production transport: a real request over the loopback interface.
 *
 * A network error is returned as status 0 rather than thrown, so a refused
 * connection reads as "the server is not listening" — a finding the operator
 * wants — instead of an orchestration crash.
 */
export const loopbackTransport: RehearsalTransport = async ({ method, path, body, admin }) => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (admin) headers["x-admin-token"] = process.env.ADMIN_TOKEN || "admin-secret";

  try {
    const response = await fetch(`${rehearsalBaseUrl(path)}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      /* Left as text: a non-JSON body from an endpoint that promises JSON is
       * itself the diagnostic. */
    }
    return { status: response.status, body: parsed, text };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 0, body: null, text: `transport error: ${message}` };
  }
};

/**
 * A student, as far as the backend can tell.
 *
 * Performs the same handshake the desktop client performs: fetch the RSA
 * public key, generate a device AES key, wrap it with RSA-OAEP/SHA-256,
 * register, log in, and from then on wrap every request body in AES-GCM with a
 * session token, a timestamp and a fresh nonce.
 *
 * Deliberately does NOT use `LOAD_TEST_MODE`. That flag short-circuits key
 * lookup, GCM decryption, token verification, the device-UUID match and replay
 * protection — every check this stage exists to exercise. A rehearsal passing
 * under it would be certifying a code path that does not run on exam day.
 */
export class SimulatedStudent {
  private aesKey?: Buffer;
  private sessionToken?: string;

  constructor(
    private readonly transport: RehearsalTransport,
    public readonly deviceUuid: string = `rehearsal-${crypto.randomUUID()}`,
  ) {}

  private static wrapKey(key: Buffer, publicKeyPem: string): string {
    return crypto
      .publicEncrypt(
        { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
        key,
      )
      .toString("base64");
  }

  private requireKey(): Buffer {
    if (!this.aesKey) throw new Error("Simulated student has not registered a device key");
    return this.aesKey;
  }

  get isRegistered(): boolean {
    return this.aesKey !== undefined;
  }

  get hasSession(): boolean {
    return this.sessionToken !== undefined;
  }

  async fetchPublicKey(): Promise<RehearsalResponse> {
    return this.transport({ method: "GET", path: "/user/auth/rsa-public-key" });
  }

  /** GET the public key, then POST the wrapped device key. */
  async registerDevice(): Promise<RehearsalResponse> {
    const keyResponse = await this.fetchPublicKey();
    const publicKey = (keyResponse.body as { publicKey?: string } | null)?.publicKey;
    if (keyResponse.status !== 200 || !publicKey) return keyResponse;

    this.aesKey = crypto.randomBytes(32);
    return this.transport({
      method: "POST",
      path: "/user/auth/register-device",
      body: {
        device_uuid: this.deviceUuid,
        encrypted_aes_key: SimulatedStudent.wrapKey(this.aesKey, publicKey),
      },
    });
  }

  async login(testId: string): Promise<RehearsalResponse> {
    const encrypted = CryptoService.encryptAESGCM(JSON.stringify({ testId }), this.requireKey());
    const response = await this.transport({
      method: "POST",
      path: "/user/auth/login",
      body: { ...encrypted, device_uuid: this.deviceUuid },
    });
    const token = (response.body as { session_token?: string } | null)?.session_token;
    if (response.status === 200 && token) this.sessionToken = token;
    return response;
  }

  /**
   * An authenticated, encrypted POST.
   *
   * A fresh nonce and a current timestamp every time — not for tidiness, but
   * because `ReplayProtectionService` rejects reuse, and a client that reused
   * either would report a working system as broken.
   */
  async post(path: string, extra: Record<string, unknown> = {}): Promise<RehearsalResponse> {
    const plaintext = JSON.stringify({
      session_token: this.sessionToken,
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString("hex"),
      ...extra,
    });
    const encrypted = CryptoService.encryptAESGCM(plaintext, this.requireKey());
    return this.transport({
      method: "POST",
      path,
      body: { ...encrypted, device_uuid: this.deviceUuid },
    });
  }

  /** Decrypt a response the backend encrypted with this device's key. */
  decrypt<T>(body: unknown): T {
    return JSON.parse(CryptoService.decryptAESGCM(body as never, this.requireKey())) as T;
  }
}
