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
      .rejects.toThrowError(new HttpError(403, "Your device ip is not match with the preset ip, please contact the TA"));
  });

  it('should allow login and consume approval state when TA approves new IP', async () => {
    await User.create({ testId: 'test_ip', name: 'IP User', ipAddress: '192.168.1.100' });
    await DeviceKeyMap.create({ deviceUuid: 'device_ip_1', clientAesKey: 'mock-key' });

    // TA approves new IP
    await UnblockedDevice.create({ targetType: 'IP', targetValue: '192.168.1.200' });

    const payload = { device_uuid: 'device_ip_1' } as any;

    const token = await AuthService.loginAndBind(payload, '192.168.1.200');
    expect(token).toBe('mock-token');

    // Verify approval state was consumed
    const approval = await UnblockedDevice.findOne({ where: { targetType: 'IP', targetValue: '192.168.1.200' } });
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
      .rejects.toThrowError(new HttpError(403, "BINDING_LOCKED", "This device is already bound to another student. Please ask TA to unbind it first."));
  });

  it('should allow device rebinding and consume approval state when TA approves', async () => {
    await User.create({ testId: 'test_old_student', name: 'Old Student' });
    await User.create({ testId: 'test_new_student', name: 'New Student' });

    await DeviceKeyMap.create({ deviceUuid: 'device_rebind_1', testId: 'test_old_student', clientAesKey: 'key' });

    // TA approves rebinding
    await UnblockedDevice.create({ targetType: 'UUID', targetValue: 'device_rebind_1' });

    const payload = { device_uuid: 'device_rebind_1' } as any;

    const token = await AuthService.loginAndBind(payload, '192.168.1.100');
    expect(token).toBe('mock-token');

    // Verify approval state was consumed
    const approval = await UnblockedDevice.findOne({ where: { targetType: 'UUID', targetValue: 'device_rebind_1' } });
    expect(approval).toBeNull();
  });
});
