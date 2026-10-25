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

    it('lets a machine re-key itself while self-service is open', async () => {
      /* The phase where machines set themselves up in an empty room. A restart
       * here has no TA to ask and needs none — refusing it on the grounds that
       * the device already exists is what used to make a crash unrecoverable. */
      await SystemSettingsService.setAllowDeviceRegistration(true);
      const { hex } = buildAesKey();
      await DeviceKeyMap.create({ ...buildDeviceKey({ deviceUuid: 'dev-again', clientAesKey: hex }) });

      const newKey = crypto.randomBytes(32);
      await DeviceService.registerKey('dev-again', wrapKey(newKey), '10.0.0.1');

      const record = await DeviceKeyMap.findOne({ where: { deviceUuid: 'dev-again' } });
      expect(record!.clientAesKey).toBe(newKey.toString('hex'));
      expect(await LoginRequest.count()).toBe(0);
    });

    describe('when the entry gate has closed', () => {
      beforeEach(async () => {
        await SystemSettingsService.setAllowDeviceRegistration(false);
      });

      it('files a NEW_DEVICE request for a machine nobody has seen', async () => {
        await User.create({ ...buildUser({ testId: 's-1', ipAddress: '10.0.0.7' }) });

        await expect(DeviceService.registerKey('dev-closed', wrapKey(crypto.randomBytes(32)), '10.0.0.7'))
          .rejects.toThrowError(HttpError);

        const req = await LoginRequest.findOne({ where: { deviceUuid: 'dev-closed' } });
        expect(req).toMatchObject({ type: 'NEW_DEVICE', status: 'PENDING', previousTestId: null });
        // Attributed to whoever is assigned that seat, to save the TA a lookup.
        expect(req!.testId).toBe('s-1');
      });

      it('files a REBIND request naming the student the machine was bound to', async () => {
        const { hex } = buildAesKey();
        await DeviceKeyMap.create({ ...buildDeviceKey({ deviceUuid: 'dev-dup', clientAesKey: hex, testId: 's-1' }) });
        await User.create({ ...buildUser({ testId: 's-1' }) });

        await expect(DeviceService.registerKey('dev-dup', wrapKey(crypto.randomBytes(32)), '10.0.0.9'))
          .rejects.toThrowError(HttpError);

        const req = await LoginRequest.findOne({ where: { deviceUuid: 'dev-dup' } });
        expect(req).toMatchObject({ type: 'REBIND', previousTestId: 's-1' });
      });

      it('files an UNBOUND_DEVICE request for a machine registered but never claimed', async () => {
        /* Different from REBIND in what the TA has to decide: nobody's work is
         * attached to this seat, so there is no binding to move. */
        const { hex } = buildAesKey();
        await DeviceKeyMap.create({ ...buildDeviceKey({ deviceUuid: 'dev-idle', clientAesKey: hex }) });

        await expect(DeviceService.registerKey('dev-idle', wrapKey(crypto.randomBytes(32)), '10.0.0.9'))
          .rejects.toThrowError(HttpError);

        const req = await LoginRequest.findOne({ where: { deviceUuid: 'dev-idle' } });
        expect(req).toMatchObject({ type: 'UNBOUND_DEVICE', previousTestId: null });
      });

      it('changes nothing about the device it refuses', async () => {
        /* A device UUID travels in clear text on every request, so anyone can
         * send one that is not theirs. If a refused request could alter a
         * device, a student mid-exam could be shown as disconnected on the TA's
         * console by somebody else's request. */
        const { hex } = buildAesKey();
        await DeviceKeyMap.create({
          ...buildDeviceKey({ deviceUuid: 'dev-live', clientAesKey: hex, testId: 's-1' }),
          status: 'ONLINE',
          isOnline: true,
        });
        const before = (await DeviceKeyMap.findOne({ where: { deviceUuid: 'dev-live' } }))!.toJSON();

        await expect(DeviceService.registerKey('dev-live', wrapKey(crypto.randomBytes(32)), '10.0.0.9'))
          .rejects.toThrowError(HttpError);

        const after = (await DeviceKeyMap.findOne({ where: { deviceUuid: 'dev-live' } }))!.toJSON();
        expect(after).toEqual(before);
      });

      it('files one request per machine however many times it asks', async () => {
        /* A restarted client retries on a timer. Each retry becoming a row
         * would bury the TA at the moment their attention matters most. */
        const { hex } = buildAesKey();
        await DeviceKeyMap.create({ ...buildDeviceKey({ deviceUuid: 'dev-dup', clientAesKey: hex }) });

        for (const ip of ['10.0.0.9', '10.0.0.9', '10.0.0.44']) {
          await expect(
            DeviceService.registerKey('dev-dup', wrapKey(crypto.randomBytes(32)), ip),
          ).rejects.toThrow();
        }

        expect(await LoginRequest.count({ where: { deviceUuid: 'dev-dup', status: 'PENDING' } })).toBe(1);
      });

      it('reports a TA rejection without creating another request until explicit resubmission', async () => {
        const deviceUuid = 'dev-rejected';
        const key = wrapKey(crypto.randomBytes(32));
        await expect(DeviceService.registerKey(deviceUuid, key, '10.0.0.9'))
          .rejects.toMatchObject({ code: 'entry_pending' });
        const rejected = await LoginRequest.findOne({ where: { deviceUuid } });
        rejected!.status = 'REJECTED';
        await rejected!.save();

        await expect(DeviceService.registerKey(deviceUuid, key, '10.0.0.9'))
          .rejects.toMatchObject({ statusCode: 403, code: 'entry_rejected' });
        expect(await LoginRequest.count({ where: { deviceUuid } })).toBe(1);

        await expect(DeviceService.registerKey(deviceUuid, key, '10.0.0.9', true))
          .rejects.toMatchObject({ code: 'entry_pending' });
        expect(await LoginRequest.count({ where: { deviceUuid, status: 'PENDING' } })).toBe(1);
        expect(await LoginRequest.count({ where: { deviceUuid, status: 'REJECTED' } })).toBe(1);

        await expect(DeviceService.registerKey(deviceUuid, key, '10.0.0.9', true))
          .rejects.toMatchObject({ code: 'entry_pending' });
        expect(await LoginRequest.count({ where: { deviceUuid } })).toBe(2);
        expect(await DeviceKeyMap.findOne({ where: { deviceUuid } })).toBeNull();
      });

      it('carries a code the client can route on', async () => {
        const { hex } = buildAesKey();
        await DeviceKeyMap.create({ ...buildDeviceKey({ deviceUuid: 'dev-code', clientAesKey: hex }) });

        try {
          await DeviceService.registerKey('dev-code', wrapKey(crypto.randomBytes(32)), '10.0.0.9');
          expect.unreachable('expected a refusal');
        } catch (err: any) {
          expect(err.statusCode).toBe(403);
          expect(err.code).toBe('entry_pending');
        }
      });
    });

    it('keeps a scoped TA approval until the approved student logs in', async () => {
      const { hex } = buildAesKey();
      await DeviceKeyMap.create({ ...buildDeviceKey({ deviceUuid: 'dev-ok', clientAesKey: hex }) });
      await UnblockedDevice.create({
        targetType: 'UUID', targetValue: 'dev-ok', approvalMode: 'NEW_USER',
        approvedIpAddress: '10.0.0.9'
      });

      const newKey = crypto.randomBytes(32);
      await DeviceService.registerKey('dev-ok', wrapKey(newKey), '10.0.0.9');

      const record = await DeviceKeyMap.findOne({ where: { deviceUuid: 'dev-ok' } });
      expect(record!.clientAesKey).toBe(newKey.toString('hex'));

      expect(await UnblockedDevice.findOne({ where: { targetValue: 'dev-ok' } })).not.toBeNull();
    });

    it('does not accept a machine approval from a different address', async () => {
      const { hex } = buildAesKey();
      await DeviceKeyMap.create({ ...buildDeviceKey({ deviceUuid: 'dev-ok', clientAesKey: hex }) });
      await UnblockedDevice.create({
        targetType: 'UUID', targetValue: 'dev-ok', approvalMode: 'NEW_USER',
        approvedIpAddress: '10.0.0.9'
      });

      await expect(DeviceService.registerKey('dev-ok', wrapKey(crypto.randomBytes(32)), '10.0.0.10'))
        .rejects.toMatchObject({ statusCode: 403, code: 'entry_pending' });
      expect((await DeviceKeyMap.findByPk('dev-ok'))!.clientAesKey).toBe(hex);
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
