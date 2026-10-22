import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageSocketService } from '../../../src/sockets/message-socket.service';
import { DeviceKeyMap } from '../../../src/models/device-key-map.model';
import { User } from '../../../src/models/user.model';
import { CryptoService } from '../../../src/services/crypto.service';
import { buildAesKey, buildDeviceKey } from '../../fixtures/identity.fixture';

describe('message socket registration after an offline unbind', () => {
  let register: (data: any) => Promise<void>;
  let sendToSocket: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const handlers = new Map<string, (...args: any[]) => any>();
    sendToSocket = vi.fn();
    const namespace = {
      on: vi.fn((event: string, handler: (...args: any[]) => any) => handlers.set(event, handler)),
      to: vi.fn(() => ({ emit: sendToSocket })),
    };
    (MessageSocketService as any).instance = undefined;
    MessageSocketService.initialize(namespace as any);
    const socket = {
      id: 'returning-socket',
      on: vi.fn((event: string, handler: (...args: any[]) => any) => handlers.set(`socket:${event}`, handler)),
    };
    handlers.get('connection')!(socket);
    register = handlers.get('socket:register')!;
  });

  it('forces logout when a formerly bound device reconnects with its old token', async () => {
    const { raw, hex } = buildAesKey();
    await DeviceKeyMap.create({ ...buildDeviceKey({
      deviceUuid: 'old-device', clientAesKey: hex, testId: null
    }) });
    await User.create({ testId: 'student-1', name: 'Student', deviceUuid: null });
    const token = CryptoService.generateSessionToken(
      { testId: 'student-1', deviceUuid: 'old-device' }, raw
    );

    await register({ device_uuid: 'old-device', session_token: token });

    expect(sendToSocket).toHaveBeenCalledWith('exam-message', expect.objectContaining({
      data: expect.objectContaining({ type: 'force_logout' })
    }));
    expect((await DeviceKeyMap.findByPk('old-device'))!.socketId).toBeNull();
  });

  it('accepts the token while the bidirectional binding is intact', async () => {
    const { raw, hex } = buildAesKey();
    await DeviceKeyMap.create({ ...buildDeviceKey({
      deviceUuid: 'current-device', clientAesKey: hex, testId: 'student-1'
    }) });
    await User.create({ testId: 'student-1', name: 'Student', deviceUuid: 'current-device' });
    const token = CryptoService.generateSessionToken(
      { testId: 'student-1', deviceUuid: 'current-device' }, raw
    );

    await register({ device_uuid: 'current-device', session_token: token });

    expect(sendToSocket).not.toHaveBeenCalled();
    expect((await DeviceKeyMap.findByPk('current-device'))!.socketId).toBe('returning-socket');
  });
});
