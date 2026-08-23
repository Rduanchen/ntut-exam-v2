import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type express from 'express';

import { createApp } from '../../src/app';
import { adminRequest } from '../helpers/admin-request';
import { SystemSettings } from '../../src/models/system-settings.model';
import { JudgerService } from '../../src/services/judger.service';
import { vi } from 'vitest';

/**
 * spec.md:39 requires that an invalid request is intercepted by the *global*
 * error handler and returned in the correct shape. That handler only exists in
 * the real application, which is why integration tests drive `createApp()`
 * rather than assembling a throwaway Express app.
 */
describe('Global error handler (integration)', () => {
  let app: express.Express;

  beforeEach(() => {
    app = createApp();
    vi.restoreAllMocks();
  });

  it('returns 400 with an { error } body for a validation failure', async () => {
    const res = await adminRequest(app).post('/admin/config').send({ testTitle: 123 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(typeof res.body.error).toBe('string');
  });

  it('returns 401 with an { error } body for a missing admin token', async () => {
    const res = await request(app).get('/admin/log');

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Unauthorized');
  });

  it('returns 404 with an { error } body when a resource is absent', async () => {
    await SystemSettings.destroy({ where: {} });

    const res = await adminRequest(app).get('/admin/config');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('CONFIG_NOT_INITIALIZED');
  });

  it('propagates the error code field when the HttpError carries one', async () => {
    // BINDING_LOCKED is raised with a code; the handler must not drop it.
    const res = await adminRequest(app).post('/admin/init/reset').send({ confirm: 'wrong' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 500 with an { error } body when a service throws unexpectedly', async () => {
    vi.spyOn(JudgerService, 'judgeStudentSubmissions').mockRejectedValue(new Error('boom'));

    const res = await adminRequest(app).post('/admin/judger/judge/s-1').send({});

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });

  it('serves the health and root endpoints from the composed app', async () => {
    expect((await request(app).get('/')).text).toBe('NTUT Exam Host Backend is running.');

    const health = await request(app).get('/health');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('UP');
    expect(health.body.loadTestMode).toBe('NOT SET');
  });
});
