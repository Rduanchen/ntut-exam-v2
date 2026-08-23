import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';

import { createApp } from '../../../../src/app';
import { adminRequest } from '../../../helpers/admin-request';
import { Message } from '../../../../src/models/message.model';

describe('AdminMessageController (integration)', () => {
  let app: express.Express;

  beforeEach(() => {
    app = createApp();
    vi.restoreAllMocks();
  });

  describe('POST /admin/messages', () => {
    it('stores and broadcasts a notification', async () => {
      await Message.destroy({ where: {} });

      const res = await adminRequest(app)
        .post('/admin/messages')
        .send({ message: 'Exam starts in 5 minutes' });

      expect(res.status).toBe(200);

      const stored = await Message.findAll();
      expect(stored).toHaveLength(1);
      expect(stored[0].message).toBe('Exam starts in 5 minutes');
    });

    it('returns 400 when the message text is missing', async () => {
      const res = await adminRequest(app).post('/admin/messages').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing message text');
    });

    it('returns 401 without an admin token', async () => {
      const res = await request(app).post('/admin/messages').send({ message: 'hi' });

      expect(res.status).toBe(401);
    });
  });
});
