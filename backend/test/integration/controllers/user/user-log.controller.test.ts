import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';

import { createApp } from '../../../../src/app';
import { TestClient } from '../../../helpers/test-client';
import { User } from '../../../../src/models/user.model';
import { UserActionLog } from '../../../../src/models/user-action-log.model';
import { ViolationLog } from '../../../../src/models/violation-log.model';
import { AntiCheatService } from '../../../../src/services/anti-cheat.service';
import { SocketService } from '../../../../src/sockets/socket.service';

/**
 * The controller logs fire-and-forget inside setImmediate and awaits two async
 * service calls in turn, so a single tick is not enough. Poll until the
 * expectation holds, or give up after a short budget.
 */
const waitFor = async (predicate: () => Promise<boolean>, budgetMs = 1000) => {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

describe('UserLogController (integration)', () => {
  let app: express.Express;
  let client: TestClient;
  const studentId = '112590010';

  beforeEach(async () => {
    app = createApp();
    vi.restoreAllMocks();
    vi.spyOn(SocketService, 'triggerAlertEvent').mockImplementation(() => {});

    await User.create({ testId: studentId, name: 'Logger', ipAddress: null });
    client = new TestClient(app);
    await client.registerDevice('device-log-1');
    await client.login(studentId);
  });

  describe('POST /user/log', () => {
    it('records a plain client action', async () => {
      const res = await client.post('/user/log', { actionType: 'PAGE_VIEW', details: { page: 'Q1' } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      await waitFor(async () => (await UserActionLog.count({ where: { testId: studentId } })) > 0);
      const logs = await UserActionLog.findAll({ where: { testId: studentId } });
      expect(logs.length).toBeGreaterThan(0);
    });

    it('routes an alert into a violation via the actionType/details contract', async () => {
      const spy = vi.spyOn(AntiCheatService, 'checkUserAction');

      const res = await client.post('/user/log', {
        actionType: 'alert',
        details: { type: 'APP_ON_QUIT', message: 'Application quit unexpectedly' },
      });

      expect(res.status).toBe(200);
      await waitFor(async () => (await ViolationLog.count({ where: { testId: studentId } })) > 0);

      // The wire contract is actionType='alert' with the violation kind in
      // details.type — not the violation kind as the actionType.
      expect(spy).toHaveBeenCalledWith(
        studentId,
        expect.anything(),
        'alert',
        expect.objectContaining({ type: 'APP_ON_QUIT' }),
      );

      const violations = await ViolationLog.findAll({ where: { testId: studentId } });
      expect(violations).toHaveLength(1);
      expect(violations[0].type).toBe('APP_ON_QUIT');
    });

    it('returns 400 when actionType is missing', async () => {
      const res = await client.post('/user/log', {});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing actionType');
    });

    it('returns 400 when the request is not encrypted', async () => {
      const res = await request(app).post('/user/log').send({ actionType: 'PAGE_VIEW' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing required cryptographic fields');
    });
  });
});
