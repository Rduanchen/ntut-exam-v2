import { describe, it, expect, vi, beforeEach } from 'vitest';

import { BindingService } from '../../../src/services/binding.service';
import { DeviceKeyMap } from '../../../src/models/device-key-map.model';
import { User } from '../../../src/models/user.model';
import { HttpError } from '../../../src/utils/http-error';
import { SocketService } from '../../../src/sockets/socket.service';
import { MessageSocketService } from '../../../src/sockets/message-socket.service';
import { SystemSettingsService } from '../../../src/services/system-settings.service';
import { buildUser, buildDeviceKey, buildAesKey } from '../../fixtures/identity.fixture';
import type { DeviceKeyAttrs } from '../../fixtures/identity.fixture';

describe('BindingService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(SocketService, 'triggerDataUpdateEvent').mockImplementation(() => {});
  });

  const seedDevice = async (overrides: Partial<DeviceKeyAttrs> = {}) => {
    const { hex } = buildAesKey();
    return DeviceKeyMap.create({ ...buildDeviceKey({ clientAesKey: hex, ...overrides }) });
  };

  describe('bindDeviceToUser', () => {
    it('binds both sides and propagates the IP address', async () => {
      await seedDevice({ deviceUuid: 'dev-1' });
      await User.create({ ...buildUser({ testId: 's-1' }) });

      await BindingService.bindDeviceToUser('dev-1', 's-1', '10.0.0.5');

      const device = await DeviceKeyMap.findOne({ where: { deviceUuid: 'dev-1' } });
      expect(device!.testId).toBe('s-1');
      expect(device!.status).toBe('ONLINE');
      expect(device!.ipAddress).toBe('10.0.0.5');

      const user = await User.findOne({ where: { testId: 's-1' } });
      expect(user!.deviceUuid).toBe('dev-1');
      expect(user!.ipAddress).toBe('10.0.0.5');
    });

    it('notifies the admin dashboard of both connection and student changes', async () => {
      await seedDevice({ deviceUuid: 'dev-1' });
      await User.create({ ...buildUser({ testId: 's-1' }) });

      await BindingService.bindDeviceToUser('dev-1', 's-1', '10.0.0.5');

      expect(SocketService.triggerDataUpdateEvent).toHaveBeenCalledWith('connection');
      expect(SocketService.triggerDataUpdateEvent).toHaveBeenCalledWith('student');
    });

    it('throws 404 when the device is unknown', async () => {
      await User.create({ ...buildUser({ testId: 's-1' }) });

      await expect(BindingService.bindDeviceToUser('ghost', 's-1', '10.0.0.5'))
        .rejects.toThrowError(HttpError);
    });

    it('throws 404 when the user is unknown', async () => {
      await seedDevice({ deviceUuid: 'dev-1' });

      await expect(BindingService.bindDeviceToUser('dev-1', 'ghost', '10.0.0.5'))
        .rejects.toThrowError(HttpError);
    });

    it('keeps the existing IP when an empty address is supplied', async () => {
      await seedDevice({ deviceUuid: 'dev-1', ipAddress: '192.168.0.9' });
      await User.create({ ...buildUser({ testId: 's-1', ipAddress: '192.168.0.9' }) });

      await BindingService.bindDeviceToUser('dev-1', 's-1', '');

      const device = await DeviceKeyMap.findOne({ where: { deviceUuid: 'dev-1' } });
      expect(device!.ipAddress).toBe('192.168.0.9');
    });
  });

  describe('unbindDevice', () => {
    it('clears both sides and marks the device UNBOUND', async () => {
      await seedDevice({ deviceUuid: 'dev-1', testId: 's-1', status: 'ONLINE' });
      await User.create({ ...buildUser({ testId: 's-1', deviceUuid: 'dev-1' }) });

      await BindingService.unbindDevice('dev-1');

      const device = await DeviceKeyMap.findOne({ where: { deviceUuid: 'dev-1' } });
      expect(device!.testId).toBeNull();
      expect(device!.status).toBe('UNBOUND');

      const user = await User.findOne({ where: { testId: 's-1' } });
      expect(user!.deviceUuid).toBeNull();
    });

    it('is a no-op for an unknown device', async () => {
      await expect(BindingService.unbindDevice('ghost')).resolves.toBeUndefined();
    });

    it('force-logs-out an online device before unbinding', async () => {
      const spy = vi.spyOn(MessageSocketService, 'sendForceLogout').mockImplementation(() => {});
      await seedDevice({ deviceUuid: 'dev-1', status: 'ONLINE', socketId: 'socket-1' });

      await BindingService.unbindDevice('dev-1');

      expect(spy).toHaveBeenCalledWith('socket-1', expect.stringContaining('TA'));
    });
  });

  describe('unbindUser', () => {
    it('clears the device binding and returns the IP to what the roster says', async () => {
      await seedDevice({ deviceUuid: 'dev-1', testId: 's-1' });
      await User.create({ ...buildUser({ testId: 's-1', deviceUuid: 'dev-1', ipAddress: '10.0.0.5' }) });

      await BindingService.unbindUser('s-1');

      const user = await User.findOne({ where: { testId: 's-1' } });
      expect(user!.deviceUuid).toBeNull();
      /* Feature 007 bugfix BUG-04. This used to be nulled, and `user.ipAddress`
       * carries two things: the seat the config assigns and the address last
       * logged in from. Login reads it as `if (user.ipAddress)`, so nulling it
       * disarmed the seat check for that student for the rest of the exam —
       * one TA approval and the ID could sign in from anywhere. With no roster
       * entry there is nothing to restore, and null is the honest answer. */
      expect(user!.ipAddress).toBeNull();

      const device = await DeviceKeyMap.findOne({ where: { deviceUuid: 'dev-1' } });
      expect(device!.testId).toBeNull();
      expect(device!.status).toBe('UNBOUND');
    });

    it('restores the seat the exam config assigns rather than clearing it', async () => {
      vi.spyOn(SystemSettingsService, 'getExamConfig').mockResolvedValue({
        accessibleUsers: [{ id: 's-1', name: 'Student One', ip: '192.168.0.11' }]
      } as any);

      await seedDevice({ deviceUuid: 'dev-1', testId: 's-1' });
      await User.create({ ...buildUser({ testId: 's-1', deviceUuid: 'dev-1', ipAddress: '10.0.0.5' }) });

      await BindingService.unbindUser('s-1');

      const user = await User.findOne({ where: { testId: 's-1' } });
      expect(user!.ipAddress).toBe('192.168.0.11');
    });

    it('falls back to no seat when the config cannot be read', async () => {
      vi.spyOn(SystemSettingsService, 'getExamConfig').mockRejectedValue(new Error('boom'));

      await seedDevice({ deviceUuid: 'dev-1', testId: 's-1' });
      await User.create({ ...buildUser({ testId: 's-1', deviceUuid: 'dev-1', ipAddress: '10.0.0.5' }) });

      await expect(BindingService.unbindUser('s-1')).resolves.toBeUndefined();

      const user = await User.findOne({ where: { testId: 's-1' } });
      expect(user!.ipAddress).toBeNull();
    });

    it('is a no-op for an unknown user', async () => {
      await expect(BindingService.unbindUser('ghost')).resolves.toBeUndefined();
    });
  });

  describe('unregisterDevice', () => {
    it('deletes the device row and returns the user IP to the roster value', async () => {
      vi.spyOn(SystemSettingsService, 'getExamConfig').mockResolvedValue({
        accessibleUsers: [{ id: 's-1', name: 'Student One', ip: '192.168.0.11' }]
      } as any);

      await seedDevice({ deviceUuid: 'dev-1', testId: 's-1' });
      await User.create({ ...buildUser({ testId: 's-1', deviceUuid: 'dev-1', ipAddress: '10.0.0.5' }) });

      await BindingService.unregisterDevice('dev-1');

      expect(await DeviceKeyMap.findOne({ where: { deviceUuid: 'dev-1' } })).toBeNull();

      const user = await User.findOne({ where: { testId: 's-1' } });
      expect(user!.deviceUuid).toBeNull();
      expect(user!.ipAddress).toBe('192.168.0.11');
    });

    it('is a no-op for an unknown device', async () => {
      await expect(BindingService.unregisterDevice('ghost')).resolves.toBeUndefined();
    });
  });

  describe('getDeviceStatus', () => {
    it('reports UNREGISTERED for a device that was never registered', async () => {
      expect(await BindingService.getDeviceStatus('ghost')).toBe('UNREGISTERED');
    });

    it('reports the stored status for a known device', async () => {
      await seedDevice({ deviceUuid: 'dev-1', status: 'AWAITING_LOGIN' });

      expect(await BindingService.getDeviceStatus('dev-1')).toBe('AWAITING_LOGIN');
    });
  });

  describe('forceLogoutDevice', () => {
    it('does nothing when the device has no active socket', async () => {
      const spy = vi.spyOn(MessageSocketService, 'sendForceLogout').mockImplementation(() => {});
      await seedDevice({ deviceUuid: 'dev-1' });

      await BindingService.forceLogoutDevice('dev-1', 'reason');

      expect(spy).not.toHaveBeenCalled();
    });
  });
});
