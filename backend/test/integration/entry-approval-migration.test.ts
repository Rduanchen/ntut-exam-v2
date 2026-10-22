import { describe, expect, it } from 'vitest';
import { initDatabase, sequelize } from '../../src/config/database.config';
import { UnblockedDevice } from '../../src/models/unblocked-device.model';

describe('entry approval migration', () => {
  it('adds scoped approval fields and discards legacy unrestricted passes', async () => {
    await UnblockedDevice.create({ targetType: 'IP', targetValue: '10.0.0.5' });
    const query = sequelize.getQueryInterface();
    await query.removeColumn('unblocked_devices', 'approval_mode');
    await query.removeColumn('unblocked_devices', 'expected_test_id');
    await query.removeColumn('unblocked_devices', 'approved_ip_address');

    await initDatabase();
    await initDatabase();

    const columns = await query.describeTable('unblocked_devices');
    expect(columns.approval_mode).toBeDefined();
    expect(columns.expected_test_id).toBeDefined();
    expect(columns.approved_ip_address).toBeDefined();
    expect(await UnblockedDevice.count()).toBe(0);
  });
});
