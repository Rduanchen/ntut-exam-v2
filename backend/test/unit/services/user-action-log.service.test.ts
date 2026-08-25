import { describe, it, expect, beforeEach } from 'vitest';
import { UserActionLogService } from '../../../src/services/user-action-log.service';
import { UserActionLog } from '../../../src/models/user-action-log.model';
import { User } from '../../../src/models/user.model';


describe('UserActionLogService', () => {
  const testId = 'test-student-log';

  beforeEach(async () => {
    await UserActionLog.destroy({ where: {} });
    await User.destroy({ where: {} });
    await User.create({ testId, name: 'Log Student', password: 'password', ipAddress: '127.0.0.1' });
  });

  it('should create an action log without blocking', async () => {
    await UserActionLogService.createLog(testId, '192.168.1.1', 'API_REQUEST', { foo: 'bar' });
    const logs = await UserActionLogService.getLogs();
    
    expect(logs).toHaveLength(1);
    expect(logs[0].testId).toBe(testId);
    expect(logs[0].actionType).toBe('API_REQUEST');
    expect(logs[0].details).toContain('bar');
  });
});
