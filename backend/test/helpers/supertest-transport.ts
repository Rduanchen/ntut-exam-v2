import request from 'supertest';
import type express from 'express';
import type { RehearsalTransport } from '../../src/services/rehearsal-client';

/**
 * Drive the rehearsal through the real Express app.
 *
 * This is the only transport that exercises what the feature exists to check:
 * `exam-phase.middleware` deciding whether now is the right time,
 * `user-crypto.middleware` decrypting and checking for replay,
 * `verifyAdminToken` on the admin half. A stubbed transport tests the stub.
 *
 * The one thing it does not prove is that a socket is actually listening —
 * that belongs to quickstart §C, against a real deployment.
 */
export const supertestTransport = (app: express.Express): RehearsalTransport => async ({ method, path, body, admin }) => {
  const agent = method === 'GET' ? request(app).get(path) : request(app).post(path);
  if (admin) agent.set('x-admin-token', process.env.ADMIN_TOKEN ?? 'admin-secret');
  const response = await (body === undefined ? agent : agent.send(body as object));
  return { status: response.status, body: response.body, text: response.text ?? '' };
};
