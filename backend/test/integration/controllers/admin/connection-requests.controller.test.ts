import { describe, it, expect, beforeEach, vi } from 'vitest';
import type express from 'express';

import { createApp } from '../../../../src/app';
import { adminRequest } from '../../../helpers/admin-request';
import { seedExamPhase } from '../../../helpers/exam-phase';
import { ExamState } from '../../../../src/services/exam-state.service';
import { User } from '../../../../src/models/user.model';
import { DeviceKeyMap } from '../../../../src/models/device-key-map.model';
import { LoginRequest } from '../../../../src/models/login-request.model';
import { SocketService } from '../../../../src/sockets/socket.service';
import { MessageSocketService } from '../../../../src/sockets/message-socket.service';
import { buildDeviceKey, buildAesKey } from '../../../fixtures/identity.fixture';

/**
 * The entry gate is only as good as the decision behind it. A TA who cannot see
 * why a machine is asking approves everything under time pressure, and the gate
 * stops meaning anything.
 */
describe('admin entry requests (integration)', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = createApp();
    vi.restoreAllMocks();
    vi.spyOn(SocketService, 'triggerDataUpdateEvent').mockImplementation(() => {});
    vi.spyOn(MessageSocketService, 'sendForceLogout').mockImplementation(() => {});
    await seedExamPhase(ExamState.IN_PROGRESS, { allowRegistration: false });
  });

  const seedDevice = async (
    deviceUuid: string,
    over: Partial<{ testId: string | null; isOnline: boolean; lastDisconnectedAt: Date }> = {},
  ) => {
    const { hex } = buildAesKey();
    return DeviceKeyMap.create({
      ...buildDeviceKey({ deviceUuid, clientAesKey: hex, testId: over.testId ?? null }),
      isOnline: over.isOnline ?? false,
      lastDisconnectedAt: over.lastDisconnectedAt ?? null,
    });
  };

  describe('GET /admin/connection/requests', () => {
    it('names the student a rebinding machine was bound to', async () => {
      await seedDevice('dev-a', { testId: 's-1', lastDisconnectedAt: new Date() });
      await User.create({ testId: 's-1', name: '王小明', deviceUuid: 'dev-a', ipAddress: '10.0.0.5' });
      await LoginRequest.create({
        deviceUuid: 'dev-a',
        ipAddress: '10.0.0.5',
        testId: 's-1',
        previousTestId: 's-1',
        type: 'REBIND',
        status: 'PENDING',
      });

      const res = await adminRequest(app).get('/admin/connection/requests');

      expect(res.status).toBe(200);
      expect(res.body[0]).toMatchObject({
        type: 'REBIND',
        previousTestId: 's-1',
        previousStudentName: '王小明',
        ipMatchesRoster: true,
      });
      expect(res.body[0].lastDisconnectedAt).not.toBeNull();
    });

    it('says when that student is already answering somewhere else', async () => {
      /* The difference between "their machine restarted" and "someone is
       * claiming a seat that is in use" — which need opposite decisions. */
      await seedDevice('dev-live', { testId: 's-2', isOnline: true });
      await seedDevice('dev-new', { testId: null });
      await User.create({ testId: 's-2', name: '陳大文', deviceUuid: 'dev-live', ipAddress: null });
      await LoginRequest.create({
        deviceUuid: 'dev-new',
        ipAddress: '10.0.0.9',
        testId: 's-2',
        previousTestId: 's-2',
        type: 'REBIND',
        status: 'PENDING',
      });

      const res = await adminRequest(app).get('/admin/connection/requests');

      expect(res.body[0].previousStudentOnlineElsewhere).toBe(true);
    });

    it('does not call a restarted machine a second claimant', async () => {
      await seedDevice('dev-b', { testId: 's-3', isOnline: false });
      await User.create({ testId: 's-3', name: '李小華', deviceUuid: 'dev-b', ipAddress: null });
      await LoginRequest.create({
        deviceUuid: 'dev-b',
        ipAddress: '10.0.0.9',
        testId: 's-3',
        previousTestId: 's-3',
        type: 'REBIND',
        status: 'PENDING',
      });

      const res = await adminRequest(app).get('/admin/connection/requests');

      expect(res.body[0].previousStudentOnlineElsewhere).toBe(false);
    });

    it('flags a machine asking from a seat the roster does not expect', async () => {
      await User.create({ testId: 's-4', name: 'Roamer', deviceUuid: null, ipAddress: '10.0.0.5' });
      await LoginRequest.create({
        deviceUuid: 'dev-c',
        ipAddress: '10.0.0.99',
        testId: null,
        previousTestId: null,
        type: 'NEW_DEVICE',
        status: 'PENDING',
      });

      const res = await adminRequest(app).get('/admin/connection/requests');

      expect(res.body[0]).toMatchObject({ type: 'NEW_DEVICE', ipMatchesRoster: false });
    });

    it('handles a machine nobody has ever seen without inventing detail', async () => {
      await LoginRequest.create({
        deviceUuid: 'dev-unknown',
        ipAddress: '10.0.0.44',
        testId: null,
        previousTestId: null,
        type: 'NEW_DEVICE',
        status: 'PENDING',
      });

      const res = await adminRequest(app).get('/admin/connection/requests');

      expect(res.body[0]).toMatchObject({
        previousTestId: null,
        previousStudentName: null,
        previousStudentOnlineElsewhere: false,
        lastDisconnectedAt: null,
      });
    });
  });

  describe('POST /admin/connection/requests/:id/approve', () => {
    const swapSetup = async () => {
      await seedDevice('dev-seat', { testId: 'old' });
      await seedDevice('dev-broken', { testId: 'new' });
      await User.create({ testId: 'old', name: 'Old', deviceUuid: 'dev-seat', ipAddress: null });
      await User.create({ testId: 'new', name: 'New', deviceUuid: 'dev-broken', ipAddress: null });
      return LoginRequest.create({
        deviceUuid: 'dev-seat',
        ipAddress: '10.0.0.5',
        testId: 'old',
        previousTestId: 'old',
        type: 'REBIND',
        status: 'PENDING',
      });
    };

    it('releases both sides in one call when the seat changes hands', async () => {
      /* Undoing only this machine's binding leaves the new student still held
       * by their own broken seat — so they fail to log in and the TA runs the
       * whole approval again. Twice, for one swapped machine. */
      const request = await swapSetup();

      const res = await adminRequest(app)
        .post(`/admin/connection/requests/${request.id}/approve`)
        .send({ targetTestId: 'new' });

      expect(res.status).toBe(200);
      expect(res.body.unbound).toEqual(expect.arrayContaining(['old', 'new']));
      expect((await User.findOne({ where: { testId: 'old' } }))!.deviceUuid).toBeNull();
      expect((await User.findOne({ where: { testId: 'new' } }))!.deviceUuid).toBeNull();
    });

    it('leaves the binding alone when the same student comes back', async () => {
      const request = await swapSetup();

      const res = await adminRequest(app)
        .post(`/admin/connection/requests/${request.id}/approve`)
        .send({ targetTestId: 'old' });

      expect(res.body.unbound).toEqual([]);
      expect((await User.findOne({ where: { testId: 'old' } }))!.deviceUuid).toBe('dev-seat');
    });

    it('marks the request allowed and lets the machine through', async () => {
      const request = await swapSetup();

      await adminRequest(app)
        .post(`/admin/connection/requests/${request.id}/approve`)
        .send({ targetTestId: 'old' });

      expect((await LoginRequest.findByPk(request.id))!.status).toBe('ALLOWED');
    });

    it('returns 404 for a request that does not exist', async () => {
      const res = await adminRequest(app).post('/admin/connection/requests/9999/approve').send({});

      expect(res.status).toBe(404);
    });
  });

  describe('POST /admin/connection/requests/:id/reject', () => {
    it('changes nothing about the device or the student', async () => {
      /* A refusal is a decision not to act. Anything it altered would be a
       * change nobody asked for, on a seat that may be mid-exam. */
      await seedDevice('dev-x', { testId: 's-9', isOnline: true });
      await User.create({ testId: 's-9', name: 'Bystander', deviceUuid: 'dev-x', ipAddress: null });
      // Read it back, so the snapshot is what the database holds rather than
      // what the freshly built instance happened to carry.
      const before = (await DeviceKeyMap.findOne({ where: { deviceUuid: 'dev-x' } }))!.toJSON();
      const request = await LoginRequest.create({
        deviceUuid: 'dev-x',
        ipAddress: '10.0.0.5',
        testId: 's-9',
        previousTestId: 's-9',
        type: 'REBIND',
        status: 'PENDING',
      });

      const res = await adminRequest(app).post(
        `/admin/connection/requests/${request.id}/reject`,
      );

      expect(res.status).toBe(200);
      expect((await DeviceKeyMap.findOne({ where: { deviceUuid: 'dev-x' } }))!.toJSON()).toEqual(before);
      expect((await User.findOne({ where: { testId: 's-9' } }))!.deviceUuid).toBe('dev-x');
      expect((await LoginRequest.findByPk(request.id))!.status).toBe('REJECTED');
    });
  });
});
