import crypto from 'crypto';

/*
 * Usage note: pass fixtures to Sequelize as `Model.create({ ...buildUser() })`.
 * `Model.create` is typed as `Optional<any, string>`, which rejects a named
 * interface but accepts a fresh object literal.
 */

export interface UserAttrs {
  testId: string;
  name: string;
  ipAddress?: string | null;
  deviceUuid?: string | null;
}

export const buildUser = (overrides: Partial<UserAttrs> = {}): UserAttrs => ({
  testId: '109590001',
  name: 'Alice',
  ipAddress: null,
  deviceUuid: null,
  ...overrides,
});

export interface DeviceKeyAttrs {
  deviceUuid: string;
  ipAddress: string;
  clientAesKey: string;
  isOnline: boolean;
  status: string;
  testId: string | null;
  socketId: string | null;
}

/**
 * `DeviceService.getAesKey` does `Buffer.from(clientAesKey, "hex")`, so the key
 * must be hex-encoded — a raw string here yields a silently truncated key.
 */
export const buildDeviceKey = (overrides: Partial<DeviceKeyAttrs> = {}): DeviceKeyAttrs => ({
  deviceUuid: 'device-test-0001',
  ipAddress: '127.0.0.1',
  clientAesKey: crypto.randomBytes(32).toString('hex'),
  isOnline: false,
  status: 'UNBOUND',
  testId: null,
  socketId: null,
  ...overrides,
});

/** Generate an AES-256 key as both raw buffer and the hex form the DB stores. */
export const buildAesKey = (): { raw: Buffer; hex: string } => {
  const raw = crypto.randomBytes(32);
  return { raw, hex: raw.toString('hex') };
};
