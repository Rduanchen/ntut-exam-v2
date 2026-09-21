import { describe, expect, it } from 'vitest';
import { CryptoService } from '../../../src/services/crypto.service';
import { SimulatedStudent, loopbackTransport, rehearsalBaseUrl } from '../../../src/services/rehearsal-client';
import { FakeTransport, json } from '../../helpers/rehearsal-transport';

/** A backend that records what the student sent and answers plausibly. */
const backend = () => {
  const captured: { aesKey?: Buffer; bodies: Array<Record<string, unknown>> } = { bodies: [] };
  const transport = new FakeTransport((request) => {
    captured.bodies.push((request.body ?? {}) as Record<string, unknown>);
    const key = `${request.method} ${request.path}`;
    if (key === 'GET /user/auth/rsa-public-key') return json(200, { publicKey: CryptoService.getRsaPublicKey() });
    if (key === 'POST /user/auth/register-device') {
      captured.aesKey = CryptoService.decryptRSA((request.body as { encrypted_aes_key: string }).encrypted_aes_key);
      return json(200, { message: 'ok' });
    }
    if (key === 'POST /user/auth/login') {
      return json(200, { session_token: CryptoService.generateSessionToken({ testId: 's-1' }, captured.aesKey!) });
    }
    return json(200, { ok: true });
  });
  return { captured, transport };
};

describe('the simulated student handshake', () => {
  it('wraps a 256-bit device key the server can unwrap', async () => {
    const { captured, transport } = backend();
    const student = new SimulatedStudent(transport.fn, 'device-1');

    const response = await student.registerDevice();

    expect(response.status).toBe(200);
    expect(student.isRegistered).toBe(true);
    /* AES-256, wrapped with RSA-OAEP/SHA-256 — the shape CryptoService expects.
     * Anything else and registration would fail on a real backend. */
    expect(captured.aesKey).toHaveLength(32);
  });

  it('reports a failed key fetch instead of registering with no key', async () => {
    const transport = new FakeTransport(() => json(503, { error: 'down' }));
    const student = new SimulatedStudent(transport.fn, 'device-1');

    const response = await student.registerDevice();

    expect(response.status).toBe(503);
    expect(student.isRegistered).toBe(false);
  });

  it('stores the session token only on a successful login', async () => {
    const { transport } = backend();
    const student = new SimulatedStudent(transport.fn, 'device-1');
    await student.registerDevice();

    expect(student.hasSession).toBe(false);
    await student.login('s-1');
    expect(student.hasSession).toBe(true);
  });

  it('refuses to act before it holds a device key', async () => {
    const { transport } = backend();
    const student = new SimulatedStudent(transport.fn, 'device-1');
    await expect(student.post('/user/exam/config')).rejects.toThrow(/has not registered/);
  });

  it('sends a fresh nonce and a current timestamp on every request', async () => {
    /* ReplayProtectionService rejects reuse. A client that repeated either
     * would report a working system as broken. */
    const { captured, transport } = backend();
    const student = new SimulatedStudent(transport.fn, 'device-1');
    await student.registerDevice();
    await student.login('s-1');

    await student.post('/user/exam/config');
    await student.post('/user/exam/config');

    const envelopes = captured.bodies.slice(-2);
    const decoded = envelopes.map((body) =>
      JSON.parse(CryptoService.decryptAESGCM(body as never, captured.aesKey!)) as { nonce: string; timestamp: number; session_token: string },
    );

    expect(decoded[0].nonce).not.toBe(decoded[1].nonce);
    expect(decoded[0].session_token).toBeTruthy();
    expect(Math.abs(Date.now() - decoded[0].timestamp)).toBeLessThan(60_000);
  });

  it('carries extra fields inside the encrypted envelope, not beside it', async () => {
    const { captured, transport } = backend();
    const student = new SimulatedStudent(transport.fn, 'device-1');
    await student.registerDevice();
    await student.login('s-1');

    await student.post('/user/submissions/code', { questionId: 'q1', language: 'C', codeContent: 'int main(){}' });

    const body = captured.bodies.at(-1)!;
    expect(body).not.toHaveProperty('questionId');
    const decoded = JSON.parse(CryptoService.decryptAESGCM(body as never, captured.aesKey!)) as { questionId: string };
    expect(decoded.questionId).toBe('q1');
  });

  it('decrypts what the backend encrypted for this device', async () => {
    const { captured, transport } = backend();
    const student = new SimulatedStudent(transport.fn, 'device-1');
    await student.registerDevice();

    const payload = CryptoService.encryptAESGCM(JSON.stringify({ examKey: 'abc' }), captured.aesKey!);
    expect(student.decrypt<{ examKey: string }>(payload).examKey).toBe('abc');
  });

  it('gives each student its own device identifier by default', () => {
    const { transport } = backend();
    expect(new SimulatedStudent(transport.fn).deviceUuid)
      .not.toBe(new SimulatedStudent(transport.fn).deviceUuid);
  });
});

describe('the loopback transport', () => {
  it('addresses the port this process is listening on', () => {
    expect(rehearsalBaseUrl()).toContain('127.0.0.1');
  });

  it('reports a refused connection as a finding rather than throwing', async () => {
    /* "The server is not listening" is exactly what a post-deployment check
     * wants to be told — as a failing stage, not an orchestration crash. */
    const previous = process.env.PORT;
    process.env.PORT = '1';
    try {
      const response = await loopbackTransport({ method: 'GET', path: '/admin/rehearsal/profile', admin: true });
      expect(response.status).toBe(0);
      expect(response.text).toContain('transport error');
    } finally {
      if (previous === undefined) delete process.env.PORT; else process.env.PORT = previous;
    }
  });
});
