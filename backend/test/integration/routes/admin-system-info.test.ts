import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type express from 'express';

import { createApp } from '../../../src/app';
import { adminRequest } from '../../helpers/admin-request';

/**
 * `admin-system-info.route.ts` defines its handler inline and has no controller
 * file, so a controller-file-based coverage check would skip it. It is the
 * dashboard's only signal that a security bypass is active, which makes it the
 * visible counterpart to the guard test in test/integration/security-guard.
 */
describe('GET /admin/system-info', () => {
  let app: express.Express;

  beforeEach(() => {
    app = createApp();
  });

  afterEach(() => {
    delete process.env.LOAD_TEST_MODE;
  });

  it('reports no warnings when LOAD_TEST_MODE is unset', async () => {
    const res = await adminRequest(app).get('/admin/system-info');

    expect(res.status).toBe(200);
    expect(res.body.warnings).toEqual([]);
  });

  it.each([
    ['pure', '加密驗證已完全繞過'],
    ['simulation', '不存在的帳號將被自動建立'],
    ['true', 'IP 可被偽造'],
  ])('warns the admin when LOAD_TEST_MODE is %s', async (mode, expected) => {
    process.env.LOAD_TEST_MODE = mode;

    const res = await adminRequest(app).get('/admin/system-info');

    expect(res.status).toBe(200);
    expect(res.body.warnings).toHaveLength(1);
    expect(res.body.warnings[0]).toContain(expected);
  });

  it('returns 401 without an admin token', async () => {
    const res = await request(app).get('/admin/system-info');

    expect(res.status).toBe(401);
  });
});
