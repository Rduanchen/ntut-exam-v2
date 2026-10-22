import { describe, it, expect, beforeEach, vi } from 'vitest';
import type express from 'express';

import { createApp } from '../../../../src/app';
import { adminRequest } from '../../../helpers/admin-request';
import { seedExamPhase } from '../../../helpers/exam-phase';
import { ExamState } from '../../../../src/services/exam-state.service';
import { User } from '../../../../src/models/user.model';
import { DeviceKeyMap } from '../../../../src/models/device-key-map.model';
import { LoginRequest } from '../../../../src/models/login-request.model';
import { UnblockedDevice } from '../../../../src/models/unblocked-device.model';
import { SocketService } from '../../../../src/sockets/socket.service';
import { MessageSocketService } from '../../../../src/sockets/message-socket.service';
import { buildDeviceKey, buildAesKey } from '../../../fixtures/identity.fixture';
import { TestClient } from '../../../helpers/test-client';
import { SystemSettingsService } from '../../../../src/services/system-settings.service';

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

    it('releases only this machine when a new student may use it', async () => {
      const request = await swapSetup();

      const res = await adminRequest(app)
        .post(`/admin/connection/requests/${request.id}/approve`)
        .send({ mode: 'NEW_USER' });

      expect(res.status).toBe(200);
      expect((await User.findOne({ where: { testId: 'old' } }))!.deviceUuid).toBeNull();
      expect((await User.findOne({ where: { testId: 'new' } }))!.deviceUuid).toBe('dev-broken');
    });

    it('leaves the binding alone when the same student comes back', async () => {
      const request = await swapSetup();

      const res = await adminRequest(app)
        .post(`/admin/connection/requests/${request.id}/approve`)
        .send({ mode: 'SAME_USER' });

      expect(res.status).toBe(200);
      expect((await User.findOne({ where: { testId: 'old' } }))!.deviceUuid).toBe('dev-seat');
      expect(await UnblockedDevice.findOne({ where: { targetValue: 'dev-seat' } }))
        .toMatchObject({ approvalMode: 'SAME_USER', expectedTestId: 'old' });
    });

    it('marks the request allowed and lets the machine through', async () => {
      const request = await swapSetup();

      await adminRequest(app)
        .post(`/admin/connection/requests/${request.id}/approve`)
        .send({ mode: 'SAME_USER' });

      expect((await LoginRequest.findByPk(request.id))!.status).toBe('ALLOWED');
    });

    it('scopes the pass to the machine and its requested address', async () => {
      const request = await swapSetup();

      await adminRequest(app)
        .post(`/admin/connection/requests/${request.id}/approve`)
        .send({ mode: 'NEW_USER' });

      const pass = await UnblockedDevice.findOne({
        where: { targetType: 'UUID', targetValue: 'dev-seat' }
      });
      expect(pass).toMatchObject({ approvalMode: 'NEW_USER', approvedIpAddress: '10.0.0.5' });
      expect(await UnblockedDevice.count({ where: { targetType: 'IP' } })).toBe(0);
    });

    it('cannot approve the same request twice', async () => {
      const request = await swapSetup();

      await adminRequest(app)
        .post(`/admin/connection/requests/${request.id}/approve`)
        .send({ mode: 'NEW_USER' });
      const second = await adminRequest(app)
        .post(`/admin/connection/requests/${request.id}/approve`)
        .send({ mode: 'NEW_USER' });

      expect(second.status).toBe(409);
      expect(await UnblockedDevice.count({ where: { targetType: 'UUID', targetValue: 'dev-seat' } })).toBe(1);
    });

    it('does not preassign a student in new-user mode', async () => {
      const request = await swapSetup();

      await adminRequest(app)
        .post(`/admin/connection/requests/${request.id}/approve`)
        .send({ mode: 'NEW_USER' });

      expect((await LoginRequest.findByPk(request.id))!.testId).toBeNull();
    });

    it('returns 404 for a request that does not exist', async () => {
      const res = await adminRequest(app).post('/admin/connection/requests/9999/approve').send({ mode: 'NEW_USER' });

      expect(res.status).toBe(404);
    });

    it('rejects same-user mode for an unbound machine', async () => {
      const request = await LoginRequest.create({
        deviceUuid: 'dev-new', ipAddress: '10.0.0.5', testId: null,
        type: 'NEW_DEVICE', status: 'PENDING'
      });
      const res = await adminRequest(app)
        .post(`/admin/connection/requests/${request.id}/approve`)
        .send({ mode: 'SAME_USER' });
      expect(res.status).toBe(409);
      expect(await UnblockedDevice.count()).toBe(0);
    });

    it('rejects an offline binding elsewhere until the TA unbinds it, then revokes the old session', async () => {
      await SystemSettingsService.setAllowDeviceRegistration(true);
      const oldMachine = new TestClient(app);
      const newMachine = new TestClient(app);
      await oldMachine.registerDevice('old-machine');
      await newMachine.registerDevice('new-machine');
      await User.create({ testId: 'student-1', name: 'Student', ipAddress: null });
      expect((await oldMachine.login('student-1')).response.status).toBe(200);
      await DeviceKeyMap.update({ isOnline: false, socketId: null }, { where: { deviceUuid: 'old-machine' } });
      await SystemSettingsService.setAllowDeviceRegistration(false);

      const registered = await DeviceKeyMap.findByPk('new-machine');
      const entry = await LoginRequest.create({
        deviceUuid: 'new-machine', ipAddress: registered!.ipAddress,
        testId: null, type: 'UNBOUND_DEVICE', status: 'PENDING'
      });
      const approval = await adminRequest(app)
        .post(`/admin/connection/requests/${entry.id}/approve`)
        .send({ mode: 'NEW_USER' });
      expect(approval.status).toBe(200);
      expect((await newMachine.attemptLogin('student-1')).status).toBe(403);
      expect(await UnblockedDevice.count()).toBe(1);

      await adminRequest(app).post('/admin/connection/devices/old-machine/unbind');
      expect((await newMachine.login('student-1')).response.status).toBe(200);
      expect(await UnblockedDevice.count()).toBe(0);
      const staleSession = await oldMachine.post('/user/exam/messages');
      expect(staleSession.status).toBe(401);
      expect(staleSession.body.code).toBe('SESSION_REVOKED');
    });

    it('lets the same student re-register and log in once, then consumes the approval', async () => {
      await SystemSettingsService.setAllowDeviceRegistration(true);
      const firstSession = new TestClient(app);
      await firstSession.registerDevice('same-machine');
      await User.create({ testId: 'student-1', name: 'Student', ipAddress: null });
      expect((await firstSession.login('student-1')).response.status).toBe(200);
      await SystemSettingsService.setAllowDeviceRegistration(false);

      const returning = new TestClient(app);
      await expect(returning.registerDevice('same-machine')).rejects.toThrow('entry_pending');
      const pending = await LoginRequest.findOne({ where: {
        deviceUuid: 'same-machine', status: 'PENDING'
      } });
      expect(pending?.previousTestId).toBe('student-1');
      expect((await adminRequest(app)
        .post(`/admin/connection/requests/${pending!.id}/approve`)
        .send({ mode: 'SAME_USER' })).status).toBe(200);

      await returning.registerDevice('same-machine');
      expect((await returning.login('student-1')).response.status).toBe(200);
      expect(await UnblockedDevice.count()).toBe(0);
      expect((await User.findOne({ where: { testId: 'student-1' } }))!.deviceUuid).toBe('same-machine');
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
