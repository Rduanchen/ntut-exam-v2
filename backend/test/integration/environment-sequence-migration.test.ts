import { describe, it, expect } from 'vitest';
import { initDatabase, sequelize } from '../../src/config/database.config';
import { DeviceKeyMap } from '../../src/models/device-key-map.model';

describe('environment sequence migration', () => {
  it('adds the column to an existing database without erasing device data and is repeatable', async () => {
    await DeviceKeyMap.create({ deviceUuid: 'existing', clientAesKey: 'key', envCheckStatus: 'PASSED' });
    await sequelize.getQueryInterface().removeColumn('device_key_maps', 'env_check_sequence');
    await initDatabase();
    await initDatabase();
    const device = await DeviceKeyMap.findByPk('existing');
    expect(device?.envCheckStatus).toBe('PASSED');
    expect(device?.envCheckSequence).toBe(0);
  });
});
