import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type express from 'express';

import { createApp } from '../../../../src/app';
import { adminRequest } from '../../../helpers/admin-request';
import { buildUser } from '../../../fixtures/identity.fixture';
import { User } from '../../../../src/models/user.model';
import { UserActionLog } from '../../../../src/models/user-action-log.model';

describe('AdminLogController (integration)', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = createApp();
    await User.create({ ...buildUser({ testId: 's-1', name: 'Alice' }) });
    await User.create({ ...buildUser({ testId: 's-2', name: 'Bob' }) });
  });

  describe('GET /admin/log', () => {
    it('returns all action logs', async () => {
      await UserActionLog.create({ testId: 's-1', ipAddress: '1.1.1.1', actionType: 'LOGIN', details: '' });
      await UserActionLog.create({ testId: 's-2', ipAddress: '2.2.2.2', actionType: 'LOGIN', details: '' });

      const res = await adminRequest(app).get('/admin/log');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it('returns 401 without an admin token', async () => {
      const res = await request(app).get('/admin/log');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /admin/log/:testId', () => {
    it('returns only that student\'s logs', async () => {
      await UserActionLog.create({ testId: 's-1', ipAddress: '1.1.1.1', actionType: 'LOGIN', details: '' });
      await UserActionLog.create({ testId: 's-2', ipAddress: '2.2.2.2', actionType: 'LOGIN', details: '' });

      const res = await adminRequest(app).get('/admin/log/s-1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].testId).toBe('s-1');
    });

    it('returns an empty list for a student with no logs', async () => {
      const res = await adminRequest(app).get('/admin/log/s-2');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });
  });
});
