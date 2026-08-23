import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type express from 'express';

import { createApp } from '../../../../src/app';
import { adminRequest } from '../../../helpers/admin-request';
import { buildUser } from '../../../fixtures/identity.fixture';
import { buildScoreBoard } from '../../../fixtures/exam-data.fixture';
import { User } from '../../../../src/models/user.model';
import { ScoreBoard } from '../../../../src/models/score-board.model';

describe('ScoreController (integration)', () => {
  let app: express.Express;

  beforeEach(() => {
    app = createApp();
  });

  describe('GET /admin/scores', () => {
    it('returns an empty list when nobody has a scoreboard', async () => {
      const res = await adminRequest(app).get('/admin/scores');

      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body).toHaveLength(0);
    });

    it('returns the stored scoreboards', async () => {
      await User.create({ ...buildUser({ testId: 's-1', name: 'Alice' }) });
      await ScoreBoard.create({ ...buildScoreBoard({ testId: 's-1', score: 87 }) });

      const res = await adminRequest(app).get('/admin/scores');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].score).toBe(87);
    });

    it('returns 401 without an admin token', async () => {
      const res = await request(app).get('/admin/scores');

      expect(res.status).toBe(401);
    });
  });
});
