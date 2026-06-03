import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { Sequelize } from 'sequelize-typescript';
import { UserActionLogService } from '../src/services/user-action-log.service';
import { UserActionLog } from '../src/models/user-action-log.model';
import { User } from '../src/models/user.model';

import { ScoreBoard } from '../src/models/score-board.model';
import { DeviceKeyMap } from '../src/models/device-key-map.model';
import { Submission } from '../src/models/submission.model';
import { Message } from '../src/models/message.model';
import { SystemSettings } from '../src/models/system-settings.model';
import { ViolationLog } from '../src/models/violation-log.model';

describe('UserActionLogService', () => {
  let testSequelize: Sequelize;
  const testId = 'test-student-log';

  beforeAll(async () => {
    testSequelize = new Sequelize({
      dialect: "sqlite",
      storage: ":memory:",
      models: [DeviceKeyMap, User, Submission, ScoreBoard, UserActionLog, ViolationLog, Message, SystemSettings],
      logging: false,
    });
    await testSequelize.sync();
  });

  afterAll(async () => {
    await testSequelize.close();
  });

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
