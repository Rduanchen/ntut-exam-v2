import crypto from 'crypto';
import request from 'supertest';
import type express from 'express';

import { CryptoService } from '../../src/services/crypto.service';

/**
 * A student client that speaks the real AES-GCM wire protocol.
 *
 * Integration tests use this rather than the `LOAD_TEST_MODE=pure` bypass: that
 * bypass skips all five checks in `user-crypto.middleware.ts` (key lookup, GCM
 * decryption, token signature, device-UUID match, replay protection), so tests
 * using it would never exercise student authentication at all. See research R2.
 */
export class TestClient {
  private readonly app: express.Express;
  private aesKey!: Buffer;
  private deviceUuid!: string;
  private sessionToken?: string;

  /** Corruptions applied to the next request only. */
  private tamperTag = false;
  private replayNonce?: string;
  private timestampSkewMs = 0;
  private spoofedDeviceUuid?: string;

  constructor(app: express.Express) {
    this.app = app;
  }

  /** RSA-OAEP(SHA-256) wrap of the client AES key, as the desktop client does. */
  private static encryptRSA(data: Buffer, publicKeyPem: string): string {
    return crypto
      .publicEncrypt(
        {
          key: publicKeyPem,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        data,
      )
      .toString('base64');
  }

  /** GET the server RSA public key, then POST /user/auth/register-device. */
  async registerDevice(deviceUuid = 'device-test-0001'): Promise<{ deviceUuid: string; aesKey: Buffer }> {
    const keyRes = await request(this.app).get('/user/auth/rsa-public-key');
    if (keyRes.status !== 200) {
      throw new Error(`rsa-public-key failed: ${keyRes.status} ${JSON.stringify(keyRes.body)}`);
    }

    this.aesKey = crypto.randomBytes(32);
    this.deviceUuid = deviceUuid;

    const res = await request(this.app)
      .post('/user/auth/register-device')
      .send({
        device_uuid: deviceUuid,
        encrypted_aes_key: TestClient.encryptRSA(this.aesKey, keyRes.body.publicKey),
      });

    if (res.status !== 200) {
      throw new Error(`register-device failed: ${res.status} ${JSON.stringify(res.body)}`);
    }

    return { deviceUuid: this.deviceUuid, aesKey: this.aesKey };
  }

  /** POST /user/auth/login with an encrypted payload; stores the session token. */
  async login(testId: string): Promise<{ sessionToken: string; response: request.Response }> {
    const encrypted = CryptoService.encryptAESGCM(JSON.stringify({ testId }), this.aesKey);
    const res = await request(this.app)
      .post('/user/auth/login')
      .send({ ...encrypted, device_uuid: this.deviceUuid });

    if (res.status === 200) {
      this.sessionToken = res.body.session_token;
    }
    return { sessionToken: res.body?.session_token, response: res };
  }

  /** Raw login attempt that does not throw, for negative cases. */
  async attemptLogin(testId: string): Promise<request.Response> {
    const { response } = await this.login(testId);
    return response;
  }

  /** Build the encrypted envelope for an authenticated request. */
  private envelope(extra: Record<string, unknown> = {}) {
    const nonce = this.replayNonce ?? crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now() + this.timestampSkewMs;

    const plaintext = JSON.stringify({
      session_token: this.sessionToken,
      timestamp,
      nonce,
      ...extra,
    });

    const encrypted = CryptoService.encryptAESGCM(plaintext, this.aesKey);

    if (this.tamperTag) {
      // Flip the first byte of the GCM tag; decryption must fail authentication.
      const tag = Buffer.from(encrypted.tag, 'base64');
      tag[0] = tag[0] ^ 0xff;
      encrypted.tag = tag.toString('base64');
    }

    const body = {
      ...encrypted,
      device_uuid: this.spoofedDeviceUuid ?? this.deviceUuid,
    };

    this.resetTampering();
    return { body, nonce };
  }

  private resetTampering() {
    this.tamperTag = false;
    this.replayNonce = undefined;
    this.timestampSkewMs = 0;
    this.spoofedDeviceUuid = undefined;
  }

  async post(path: string, extra: Record<string, unknown> = {}): Promise<request.Response> {
    const { body } = this.envelope(extra);
    return request(this.app).post(path).send(body);
  }

  async get(path: string): Promise<request.Response> {
    return request(this.app).get(path);
  }

  /** Send a raw, unencrypted body — drives the 400 missing-fields branch. */
  async postRaw(path: string, body: Record<string, unknown>): Promise<request.Response> {
    return request(this.app).post(path).send(body);
  }

  /** Decrypt an encrypted response body with this client's session key. */
  decrypt<T = any>(body: any): T {
    return JSON.parse(CryptoService.decryptAESGCM(body, this.aesKey));
  }

  /** The nonce this client will use next — for constructing a replay. */
  useNonce(nonce: string): this {
    this.replayNonce = nonce;
    return this;
  }

  withTamperedTag(): this {
    this.tamperTag = true;
    return this;
  }

  withSkewedTimestamp(seconds: number): this {
    this.timestampSkewMs = seconds * 1000;
    return this;
  }

  withMismatchedDeviceUuid(other: string): this {
    this.spoofedDeviceUuid = other;
    return this;
  }

  get key(): Buffer {
    return this.aesKey;
  }

  get uuid(): string {
    return this.deviceUuid;
  }

  get token(): string | undefined {
    return this.sessionToken;
  }
}
