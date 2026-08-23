import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

import { DeviceService } from '../../../src/services/device.service';
import { CryptoService } from '../../../src/services/crypto.service';
import { SystemSettingsService } from '../../../src/services/system-settings.service';
import { DeviceKeyMap } from '../../../src/models/device-key-map.model';
import { LoginRequest } from '../../../src/models/login-request.model';
import { UnblockedDevice } from '../../../src/models/unblocked-device.model';
import { User } from '../../../src/models/user.model';
import { SocketService } from '../../../src/sockets/socket.service';
import { HttpError } from '../../../src/utils/http-error';
import { buildUser, buildDeviceKey, buildAesKey } from '../../fixtures/identity.fixture';

/** Wrap an AES key the way the desktop client does, so registerKey can unwrap it. */
const wrapKey = (key: Buffer) =>
  crypto
    .publicEncrypt(
      {
        key: CryptoService.getRsaPublicKey(),
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      key,
    )
    .toString('base64');

describe('DeviceService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(SocketService, 'triggerDataUpdateEvent').mockImplementation(() => {});
  });

  describe('registerKey', () => {
    it('registers a first-time device when registration is open', async () => {
      await SystemSettingsService.setAllowDeviceRegistration(true);
      const key = crypto.randomBytes(32);

      await DeviceService.registerKey('dev-new', wrapKey(key), '10.0.0.1');

      const record = await DeviceKeyMap.findOne({ where: { deviceUuid: 'dev-new' } });
      expect(record).not.toBeNull();
      expect(record!.clientAesKey).toBe(key.toString('hex'));
      expect(record!.status).toBe('UNBOUND');
      expect(record!.isOnline).toBe(true);
    });

    it('throws 400 when the wrapped key cannot be decrypted', async () => {
      await SystemSettingsService.setAllowDeviceRegistration(true);

      await expect(DeviceService.registerKey('dev-bad', 'not-base64-rsa', '10.0.0.1'))
        .rejects.toThrowError(HttpError);
    });

    it('throws 400 when the decrypted key is not 32 bytes', async () => {
      await SystemSettingsService.setAllowDeviceRegistration(true);

      await expect(DeviceService.registerKey('dev-short', wrapKey(crypto.randomBytes(16)), '10.0.0.1'))
        .rejects.toThrowError(HttpError);
    });

    it('blocks first-time registration when registration is closed and files a TA request', async () => {
      await SystemSettingsService.setAllowDeviceRegistration(false);
      await User.create({ ...buildUser({ testId: 's-1', ipAddress: '10.0.0.7' }) });

      await expect(DeviceService.registerKey('dev-closed', wrapKey(crypto.randomBytes(32)), '10.0.0.7'))
        .rejects.toThrowError(HttpError);

      const req = await LoginRequest.findOne({ where: { deviceUuid: 'dev-closed' } });
      expect(req).not.toBeNull();
      expect(req!.type).toBe('FIRST_TIME');
      expect(req!.status).toBe('PENDING');
      // The request is attributed to the student assigned that IP.
      expect(req!.testId).toBe('s-1');
    });

    it('blocks a secondary binding and records a SECONDARY request', async () => {
      const { hex } = buildAesKey();
      await DeviceKeyMap.create({ ...buildDeviceKey({ deviceUuid: 'dev-dup', clientAesKey: hex, testId: 's-1' }) });
      await User.create({ ...buildUser({ testId: 's-1' }) });

      await expect(DeviceService.registerKey('dev-dup', wrapKey(crypto.randomBytes(32)), '10.0.0.9'))
        .rejects.toThrowError(HttpError);

      const req = await LoginRequest.findOne({ where: { deviceUuid: 'dev-dup' } });
      expect(req).not.toBeNull();
      expect(req!.type).toBe('SECONDARY');

      // The device is moved out of ONLINE so the dashboard stops showing it connected.
      const record = await DeviceKeyMap.findOne({ where: { deviceUuid: 'dev-dup' } });
      expect(record!.status).toBe('AWAITING_LOGIN');
    });

    it('does not stack duplicate pending requests for the same device and IP', async () => {
      const { hex } = buildAesKey();
      await DeviceKeyMap.create({ ...buildDeviceKey({ deviceUuid: 'dev-dup', clientAesKey: hex }) });

      await expect(DeviceService.registerKey('dev-dup', wrapKey(crypto.randomBytes(32)), '10.0.0.9')).rejects.toThrow();
      await expect(DeviceService.registerKey('dev-dup', wrapKey(crypto.randomBytes(32)), '10.0.0.9')).rejects.toThrow();

      expect(await LoginRequest.count({ where: { deviceUuid: 'dev-dup', status: 'PENDING' } })).toBe(1);
    });

    it('consumes a TA approval to allow a secondary binding', async () => {
      const { hex } = buildAesKey();
      await DeviceKeyMap.create({ ...buildDeviceKey({ deviceUuid: 'dev-ok', clientAesKey: hex }) });
      await UnblockedDevice.create({ targetType: 'UUID', targetValue: 'dev-ok' });

      const newKey = crypto.randomBytes(32);
      await DeviceService.registerKey('dev-ok', wrapKey(newKey), '10.0.0.9');

      const record = await DeviceKeyMap.findOne({ where: { deviceUuid: 'dev-ok' } });
      expect(record!.clientAesKey).toBe(newKey.toString('hex'));

      // The approval is single-use.
      expect(await UnblockedDevice.findOne({ where: { targetValue: 'dev-ok' } })).toBeNull();
    });
  });

  describe('getAesKey', () => {
    it('returns the stored key decoded from hex', async () => {
      const { raw, hex } = buildAesKey();
      await DeviceKeyMap.create({ ...buildDeviceKey({ deviceUuid: 'dev-1', clientAesKey: hex }) });

      expect(await DeviceService.getAesKey('dev-1')).toEqual(raw);
    });

    it('throws 401 for an unregistered device', async () => {
      try {
        await DeviceService.getAesKey('ghost');
        expect.unreachable('expected a 401');
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpError);
        expect(err.statusCode).toBe(401);
      }
    });
  });

  describe('deleteKey', () => {
    it('removes the device record', async () => {
      const { hex } = buildAesKey();
      await DeviceKeyMap.create({ ...buildDeviceKey({ deviceUuid: 'dev-1', clientAesKey: hex }) });

      await DeviceService.deleteKey('dev-1');

      expect(await DeviceKeyMap.findOne({ where: { deviceUuid: 'dev-1' } })).toBeNull();
    });

    it('throws 404 for a device that does not exist', async () => {
      try {
        await DeviceService.deleteKey('ghost');
        expect.unreachable('expected a 404');
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpError);
        expect(err.statusCode).toBe(404);
      }
    });
  });
});
