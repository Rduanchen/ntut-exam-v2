import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../../../src/services/auth.service';
import { User } from '../../../src/models/user.model';
import { UnblockedDevice } from '../../../src/models/unblocked-device.model';
import { DeviceKeyMap } from '../../../src/models/device-key-map.model';
import { HttpError } from '../../../src/utils/http-error';

// Mock CryptoService since we don't want real AES/RSA in tests. The decrypted
// testId differs per suite, so it lives in hoisted state the factory reads at
// call time rather than being baked into the factory.
const cryptoState = vi.hoisted(() => ({ testId: 'test_ip' }));

vi.mock('../../../src/services/crypto.service', () => {
  return {
    CryptoService: {
      decryptAESGCM: vi.fn(() => JSON.stringify({ testId: cryptoState.testId })),
      generateSessionToken: vi.fn().mockReturnValue('mock-token'),
    }
  };
});

const resetBindingState = async () => {
  vi.clearAllMocks();
  await User.destroy({ where: {} });
  await DeviceKeyMap.destroy({ where: {} });
  await UnblockedDevice.destroy({ where: {} });
};

describe('AuthService - IP Fallback', () => {
  beforeEach(async () => {
    cryptoState.testId = 'test_ip';
    await resetBindingState();
  });

  it('should block login when IP does not match the bound user IP without TA approval', async () => {
    await User.create({ testId: 'test_ip', name: 'IP User', ipAddress: '192.168.1.100' });
    await DeviceKeyMap.create({ deviceUuid: 'device_ip_1', clientAesKey: 'mock-key' });

    // Attempting to login with a new IP
    const payload = { device_uuid: 'device_ip_1' } as any;

    await expect(AuthService.loginAndBind(payload, '192.168.1.200'))
      .rejects.toThrowError(new HttpError(403, "Your device ip is not match with the preset ip, please contact the TA", "IP_MISMATCH"));
  });

  it('allows a different roster IP only with an approval for that device and address', async () => {
    await User.create({ testId: 'test_ip', name: 'IP User', ipAddress: '192.168.1.100' });
    await DeviceKeyMap.create({ deviceUuid: 'device_ip_1', clientAesKey: 'mock-key' });

    await UnblockedDevice.create({
      targetType: 'UUID', targetValue: 'device_ip_1', approvalMode: 'NEW_USER',
      approvedIpAddress: '192.168.1.200'
    });

    const payload = { device_uuid: 'device_ip_1' } as any;

    const token = await AuthService.loginAndBind(payload, '192.168.1.200');
    expect(token).toBe('mock-token');

    // Verify approval state was consumed
    const approval = await UnblockedDevice.findOne({ where: { targetType: 'UUID', targetValue: 'device_ip_1' } });
    expect(approval).toBeNull();
  });
});

describe('AuthService - Device Rebinding', () => {
  beforeEach(async () => {
    cryptoState.testId = 'test_new_student';
    await resetBindingState();
  });

  it('should block login when a device is already bound to another student without TA approval', async () => {
    await User.create({ testId: 'test_old_student', name: 'Old Student' });
    await User.create({ testId: 'test_new_student', name: 'New Student' });

    await DeviceKeyMap.create({ deviceUuid: 'device_rebind_1', testId: 'test_old_student', clientAesKey: 'key' });

    const payload = { device_uuid: 'device_rebind_1' } as any;

    await expect(AuthService.loginAndBind(payload, '192.168.1.100'))
      .rejects.toThrowError(new HttpError(403, "This device is already bound to another student. Please ask TA to unbind it first.", "BINDING_LOCKED"));
  });

  /* Feature 007 bugfix BUG-04. `HttpError` is (status, message, code) and these
   * four throws had the last two the other way round, so the wire carried
   * `{ error: "BINDING_LOCKED", code: "This device is already..." }`. The
   * desktop reads `code` to decide whether a refusal is about the device or
   * about the binding — with a sentence there, every binding refusal looked
   * like an unregistered device, and the machine threw away a perfectly good
   * registration and rejoined the TA queue. Asserting the message alone,
   * which is all `toThrowError` compares, cannot see this. */
  it('carries the machine-readable code in code, not in message', async () => {
    await User.create({ testId: 'test_old_student', name: 'Old Student' });
    await User.create({ testId: 'test_new_student', name: 'New Student' });
    await DeviceKeyMap.create({ deviceUuid: 'device_rebind_1', testId: 'test_old_student', clientAesKey: 'key' });

    const payload = { device_uuid: 'device_rebind_1' } as any;

    await expect(AuthService.loginAndBind(payload, '192.168.1.100')).rejects.toMatchObject({
      statusCode: 403,
      code: 'BINDING_LOCKED',
      message: expect.stringContaining('already bound to another student')
    });
  });

  it('reports a second live session as ALREADY_LOGGED_IN in the code field', async () => {
    await DeviceKeyMap.create({ deviceUuid: 'device_elsewhere', clientAesKey: 'key', isOnline: true });
    await DeviceKeyMap.create({ deviceUuid: 'device_rebind_1', clientAesKey: 'key' });
    await User.create({
      testId: 'test_new_student',
      name: 'New Student',
      deviceUuid: 'device_elsewhere'
    });

    const payload = { device_uuid: 'device_rebind_1' } as any;

    await expect(AuthService.loginAndBind(payload, '192.168.1.100')).rejects.toMatchObject({
      statusCode: 403,
      code: 'ALREADY_LOGGED_IN'
    });
  });

  it('reports a binding held by an offline machine as BINDING_LOCKED in the code field', async () => {
    await DeviceKeyMap.create({ deviceUuid: 'device_elsewhere', clientAesKey: 'key', isOnline: false });
    await DeviceKeyMap.create({ deviceUuid: 'device_rebind_1', clientAesKey: 'key' });
    await User.create({
      testId: 'test_new_student',
      name: 'New Student',
      deviceUuid: 'device_elsewhere'
    });

    const payload = { device_uuid: 'device_rebind_1' } as any;

    await expect(AuthService.loginAndBind(payload, '192.168.1.100')).rejects.toMatchObject({
      statusCode: 403,
      code: 'BINDING_LOCKED',
      message: expect.stringContaining('another device')
    });
  });

  it('does not evict another student even with an old UUID pass', async () => {
    await User.create({ testId: 'test_old_student', name: 'Old Student' });
    await User.create({ testId: 'test_new_student', name: 'New Student' });

    await DeviceKeyMap.create({ deviceUuid: 'device_rebind_1', testId: 'test_old_student', clientAesKey: 'key' });

    await UnblockedDevice.create({
      targetType: 'UUID', targetValue: 'device_rebind_1', approvalMode: 'NEW_USER'
    });

    const payload = { device_uuid: 'device_rebind_1' } as any;

    await expect(AuthService.loginAndBind(payload, '192.168.1.100'))
      .rejects.toMatchObject({ statusCode: 403, code: 'BINDING_LOCKED' });
    const approval = await UnblockedDevice.findOne({ where: { targetType: 'UUID', targetValue: 'device_rebind_1' } });
    expect(approval).not.toBeNull();
  });

  it('permits only the original user in same-user mode', async () => {
    await DeviceKeyMap.create({ deviceUuid: 'device_rebind_1', testId: 'test_old_student', clientAesKey: 'key' });
    await User.create({ testId: 'test_old_student', name: 'Old Student', deviceUuid: 'device_rebind_1' });
    await User.create({ testId: 'test_new_student', name: 'New Student' });
    await UnblockedDevice.create({
      targetType: 'UUID', targetValue: 'device_rebind_1', approvalMode: 'SAME_USER',
      expectedTestId: 'test_old_student'
    });

    const payload = { device_uuid: 'device_rebind_1' } as any;
    await expect(AuthService.loginAndBind(payload, '192.168.1.100'))
      .rejects.toMatchObject({ statusCode: 403, code: 'BINDING_LOCKED' });
    cryptoState.testId = 'test_old_student';
    expect(await AuthService.loginAndBind(payload, '192.168.1.100')).toBe('mock-token');
    expect(await UnblockedDevice.count()).toBe(0);
  });
});
