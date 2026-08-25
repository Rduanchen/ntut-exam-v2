import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type express from 'express';

import { createApp } from '../../../../src/app';
import { adminRequest } from '../../../helpers/admin-request';
import { buildUser } from '../../../fixtures/identity.fixture';
import { buildViolation } from '../../../fixtures/exam-data.fixture';
import { User } from '../../../../src/models/user.model';
import { ViolationLog } from '../../../../src/models/violation-log.model';

describe('AdminAnticheatController (integration)', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = createApp();
    await User.create({ ...buildUser({ testId: 's-1', name: 'Alice' }) });
    await User.create({ ...buildUser({ testId: 's-2', name: 'Bob' }) });
  });

  describe('GET /admin/anticheat/logs', () => {
    it('returns every violation log', async () => {
      await ViolationLog.create({ ...buildViolation({ testId: 's-1' }) });
      await ViolationLog.create({ ...buildViolation({ testId: 's-2' }) });

      const res = await adminRequest(app).get('/admin/anticheat/logs');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it('returns 401 without an admin token', async () => {
      const res = await request(app).get('/admin/anticheat/logs');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /admin/anticheat/logs/:studentID', () => {
    it('returns only that student\'s violations', async () => {
      await ViolationLog.create({ ...buildViolation({ testId: 's-1', message: 'a' }) });
      await ViolationLog.create({ ...buildViolation({ testId: 's-2', message: 'b' }) });

      const res = await adminRequest(app).get('/admin/anticheat/logs/s-1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].testId).toBe('s-1');
    });

    it('returns an empty list for a student with no violations', async () => {
      const res = await adminRequest(app).get('/admin/anticheat/logs/s-2');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });
  });

  describe('PUT /admin/anticheat/status', () => {
    it('marks a violation as reviewed', async () => {
      const violation = await ViolationLog.create({ ...buildViolation({ testId: 's-1' }) });

      const res = await adminRequest(app)
        .put('/admin/anticheat/status')
        .send({ violationId: violation.id, isOk: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const updated = await ViolationLog.findByPk(violation.id);
      expect(updated!.isOk).toBe(true);
    });

    it('returns 400 when violationId or isOk is missing', async () => {
      const res = await adminRequest(app).put('/admin/anticheat/status').send({ isOk: true });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Bad Request');
    });

    it('returns 404 for a violation that does not exist', async () => {
      const res = await adminRequest(app)
        .put('/admin/anticheat/status')
        .send({ violationId: 99999, isOk: true });

      expect(res.status).toBe(404);
    });
  });
});
