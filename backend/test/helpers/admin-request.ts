import request from 'supertest';
import type express from 'express';

/**
 * Supertest agent carrying admin credentials.
 *
 * `verifyAdminToken` compares `x-admin-token` (or a Bearer header) against
 * `process.env.ADMIN_TOKEN`, which test/setup.ts fixes to a known value — no
 * session or database row is involved.
 *
 * Pass an explicit wrong token to drive the 401 branch.
 */
export const adminRequest = (app: express.Express, token?: string) => {
  const value = token ?? process.env.ADMIN_TOKEN ?? 'admin-secret';
  const agent = request(app);

  return {
    get: (path: string) => agent.get(path).set('x-admin-token', value),
    post: (path: string) => agent.post(path).set('x-admin-token', value),
    put: (path: string) => agent.put(path).set('x-admin-token', value),
    patch: (path: string) => agent.patch(path).set('x-admin-token', value),
    delete: (path: string) => agent.delete(path).set('x-admin-token', value),
  };
};
