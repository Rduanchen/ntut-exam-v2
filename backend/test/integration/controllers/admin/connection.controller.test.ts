import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';

import { createApp } from '../../../../src/app';
import { adminRequest } from '../../../helpers/admin-request';
import { buildUser, buildDeviceKey, buildAesKey } from '../../../fixtures/identity.fixture';
import { User } from '../../../../src/models/user.model';
import { DeviceKeyMap } from '../../../../src/models/device-key-map.model';
import { LoginRequest } from '../../../../src/models/login-request.model';
import { UnblockedDevice } from '../../../../src/models/unblocked-device.model';
import { SocketService } from '../../../../src/sockets/socket.service';
import { MessageSocketService } from '../../../../src/sockets/message-socket.service';
import { TestClient } from '../../../helpers/test-client';
import { seedExamPhase } from '../../../helpers/exam-phase';
import { ExamState } from '../../../../src/services/exam-state.service';
import { SystemSettingsService } from '../../../../src/services/system-settings.service';
import { buildExamConfig } from '../../../fixtures/exam-config.fixture';

describe('ConnectionController (integration)', () => {
  let app: express.Express;

  beforeEach(() => {
    app = createApp();
    vi.restoreAllMocks();
    vi.spyOn(SocketService, 'triggerDataUpdateEvent').mockImplementation(() => {});
    vi.spyOn(MessageSocketService, 'sendForceLogout').mockImplementation(() => {});
  });

  const seedDevice = async (overrides = {}) => {
    const { hex } = buildAesKey();
    return DeviceKeyMap.create({ ...buildDeviceKey({ clientAesKey: hex, ...overrides }) });
  };

  describe('GET/POST /admin/connection/settings', () => {
    it('reports and updates the device registration switch', async () => {
      const post = await adminRequest(app)
        .post('/admin/connection/settings')
        .send({ allowRegistration: true });
      expect(post.status).toBe(200);

      const get = await adminRequest(app).get('/admin/connection/settings');
      expect(get.status).toBe(200);
      expect(get.body.allowRegistration).toBe(true);
    });

    it('returns 401 without an admin token', async () => {
      const res = await request(app).get('/admin/connection/settings');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /admin/connection/devices', () => {
    it('lists registered devices', async () => {
      await seedDevice({ deviceUuid: 'dev-1' });

      const res = await adminRequest(app).get('/admin/connection/devices');

      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe('POST /admin/connection/devices/:uuid/unbind', () => {
    it('unbinds a device from its student', async () => {
      await seedDevice({ deviceUuid: 'dev-1', testId: 's-1', status: 'ONLINE' });
      await User.create({ ...buildUser({ testId: 's-1', deviceUuid: 'dev-1' }) });

      const res = await adminRequest(app).post('/admin/connection/devices/dev-1/unbind');

      expect(res.status).toBe(200);
      const device = await DeviceKeyMap.findOne({ where: { deviceUuid: 'dev-1' } });
      expect(device!.status).toBe('UNBOUND');
      expect((await User.findOne({ where: { testId: 's-1' } }))!.deviceUuid).toBeNull();
    });
  });

  describe('DELETE /admin/connection/devices/:uuid', () => {
    it('unregisters a device entirely', async () => {
      await seedDevice({ deviceUuid: 'dev-1' });

      const res = await adminRequest(app).delete('/admin/connection/devices/dev-1');

      expect(res.status).toBe(200);
      expect(await DeviceKeyMap.findOne({ where: { deviceUuid: 'dev-1' } })).toBeNull();
    });
  });

  describe('GET /admin/connection/requests', () => {
    it('lists pending login requests', async () => {
      await LoginRequest.create({
        ipAddress: '10.0.0.1', deviceUuid: 'dev-1', testId: null, type: 'FIRST_TIME', status: 'PENDING',
      });

      const res = await adminRequest(app).get('/admin/connection/requests');

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe('POST /admin/connection/requests/:id/approve', () => {
    it('does not grant entry or alter a seat when a pending machine reads languages', async () => {
      await seedExamPhase(ExamState.INITIALIZED);
      await SystemSettingsService.upsertSetting('exam_config', buildExamConfig());
      const machine = new TestClient(app);
      await machine.registerDevice('pending-language-device');
      await User.create({ ...buildUser({ testId: 's-1', deviceUuid: machine.uuid, ipAddress: '10.0.0.1' }) });
      const pending = await LoginRequest.create({
        ipAddress: '10.0.0.2', deviceUuid: machine.uuid, testId: 's-1',
        type: 'SECONDARY', status: 'PENDING',
      });
      await seedExamPhase(ExamState.SETUP_FINISHED);

      const languages = await machine.post('/user/exam/languages');

      expect(languages.status).toBe(200);
      expect(machine.decrypt(languages.body)).toEqual({ languages: ['Python'] });
      expect((await LoginRequest.findByPk(pending.id))?.status).toBe('PENDING');
      expect(await UnblockedDevice.count()).toBe(0);
      expect((await User.findOne({ where: { testId: 's-1' } }))?.deviceUuid).toBe(machine.uuid);
      expect((await User.findOne({ where: { testId: 's-1' } }))?.ipAddress).toBe('10.0.0.1');
    });

    it('approves a request and issues a single-use unblock pass', async () => {
      const req = await LoginRequest.create({
        ipAddress: '10.0.0.1', deviceUuid: 'dev-1', testId: null, type: 'FIRST_TIME', status: 'PENDING',
      });

      const res = await adminRequest(app).post(`/admin/connection/requests/${req.id}/approve`).send({});

      expect(res.status).toBe(200);
      expect((await LoginRequest.findByPk(req.id))!.status).toBe('ALLOWED');
      expect(await UnblockedDevice.findOne({ where: { targetValue: 'dev-1' } })).not.toBeNull();
    });

    it('unbinds the previous student when action is UNBIND_USER', async () => {
      await seedDevice({ deviceUuid: 'dev-1', testId: 's-1' });
      await User.create({ ...buildUser({ testId: 's-1', deviceUuid: 'dev-1', ipAddress: '10.0.0.1' }) });
      const req = await LoginRequest.create({
        ipAddress: '10.0.0.2', deviceUuid: 'dev-1', testId: 's-1', type: 'SECONDARY', status: 'PENDING',
      });

      const res = await adminRequest(app)
        .post(`/admin/connection/requests/${req.id}/approve`)
        .send({ action: 'UNBIND_USER' });

      expect(res.status).toBe(200);
      const user = await User.findOne({ where: { testId: 's-1' } });
      expect(user!.deviceUuid).toBeNull();
      expect(user!.ipAddress).toBeNull();
    });

    it('returns 404 for a request that does not exist', async () => {
      const res = await adminRequest(app).post('/admin/connection/requests/99999/approve').send({});

      expect(res.status).toBe(404);
    });
  });

  describe('POST /admin/connection/requests/:id/reject', () => {
    it('marks the request rejected without issuing a pass', async () => {
      const req = await LoginRequest.create({
        ipAddress: '10.0.0.1', deviceUuid: 'dev-1', testId: null, type: 'FIRST_TIME', status: 'PENDING',
      });

      const res = await adminRequest(app).post(`/admin/connection/requests/${req.id}/reject`);

      expect(res.status).toBe(200);
      expect((await LoginRequest.findByPk(req.id))!.status).toBe('REJECTED');
      // A rejection must never hand out an unblock pass.
      expect(await UnblockedDevice.findOne({ where: { targetValue: 'dev-1' } })).toBeNull();
    });

    it('returns 404 for a request that does not exist', async () => {
      const res = await adminRequest(app).post('/admin/connection/requests/99999/reject');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /admin/connection/unblock', () => {
    it('adds a UUID to the unblocked list', async () => {
      const res = await adminRequest(app)
        .post('/admin/connection/unblock')
        .send({ targetType: 'UUID', targetValue: 'dev-1' });

      expect(res.status).toBe(200);
      expect(await UnblockedDevice.findOne({ where: { targetValue: 'dev-1' } })).not.toBeNull();
    });

    it('unbinds the student behind an IP when action is UNBIND_USER', async () => {
      await seedDevice({ deviceUuid: 'dev-1', testId: 's-1' });
      await User.create({ ...buildUser({ testId: 's-1', deviceUuid: 'dev-1', ipAddress: '10.0.0.1' }) });

      const res = await adminRequest(app)
        .post('/admin/connection/unblock')
        .send({ targetType: 'IP', targetValue: '10.0.0.1', action: 'UNBIND_USER' });

      expect(res.status).toBe(200);
      const user = await User.findOne({ where: { testId: 's-1' } });
      expect(user!.deviceUuid).toBeNull();
    });

    it('returns 400 for an unsupported targetType', async () => {
      const res = await adminRequest(app)
        .post('/admin/connection/unblock')
        .send({ targetType: 'EMAIL', targetValue: 'a@b.c' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid targetType');
    });

    it('returns 400 when targetValue is missing', async () => {
      const res = await adminRequest(app).post('/admin/connection/unblock').send({ targetType: 'UUID' });

      expect(res.status).toBe(400);
    });
  });
});
