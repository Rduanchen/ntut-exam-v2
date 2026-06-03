import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { Sequelize } from 'sequelize-typescript';
import { AntiCheatService } from '../src/services/anti-cheat.service';
import { ViolationLog } from '../src/models/violation-log.model';
import { UserActionLog } from '../src/models/user-action-log.model';
import { User } from '../src/models/user.model';
import SocketService from '../src/sockets/socket.service';

import { ScoreBoard } from '../src/models/score-board.model';
import { DeviceKeyMap } from '../src/models/device-key-map.model';
import { Submission } from '../src/models/submission.model';
import { Message } from '../src/models/message.model';
import { SystemSettings } from '../src/models/system-settings.model';

describe('AntiCheatService', () => {
  let testSequelize: Sequelize;

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
    await ViolationLog.destroy({ where: {} });
    await User.destroy({ where: {} });

    await User.create({ testId: 'student-a', name: 'A', password: 'pwd', ipAddress: '1.1.1.1' });
    await User.create({ testId: 'student-b', name: 'B', password: 'pwd', ipAddress: '2.2.2.2' });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it('should trigger alert and log violation for APP_ON_QUIT', async () => {
    const triggerSpy = vi.spyOn(SocketService, 'triggerAlertEvent').mockImplementation(() => {});

    await AntiCheatService.checkUserAction('student-a', '1.1.1.1', 'APP_ON_QUIT');
    
    const logs = await AntiCheatService.getViolationLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe('APP_ON_QUIT');
    expect(logs[0].testId).toBe('student-a');
    expect(triggerSpy).toHaveBeenCalled();
  });

  it('should collapse same unresolved violation by updating time', async () => {
    vi.spyOn(SocketService, 'triggerAlertEvent').mockImplementation(() => {});

    await AntiCheatService.checkUserAction('student-a', '1.1.1.1', 'APP_ON_QUIT');
    const logs1 = await AntiCheatService.getViolationLogs();
    const firstTime = logs1[0].time;

    await new Promise(r => setTimeout(r, 100));

    await AntiCheatService.checkUserAction('student-a', '1.1.1.1', 'APP_ON_QUIT');
    const logs2 = await AntiCheatService.getViolationLogs();
    
    expect(logs2).toHaveLength(1);
    expect(logs2[0].time.getTime()).toBeGreaterThan(firstTime.getTime());
  });

  it('should detect same user on multiple IPs', async () => {
    vi.spyOn(SocketService, 'triggerAlertEvent').mockImplementation(() => {});

    await UserActionLog.create({ testId: 'student-a', ipAddress: '1.1.1.1', actionType: 'LOGIN', details: '' });
    await AntiCheatService.checkUserAction('student-a', '2.2.2.2', 'API_REQUEST');
    
    const logs = await AntiCheatService.getViolationLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe('MULTIPLE_IPS');
  });

  it('should detect multiple users on same IP', async () => {
    vi.spyOn(SocketService, 'triggerAlertEvent').mockImplementation(() => {});

    await UserActionLog.create({ testId: 'student-a', ipAddress: '3.3.3.3', actionType: 'LOGIN', details: '' });
    await AntiCheatService.checkUserAction('student-b', '3.3.3.3', 'API_REQUEST');
    
    const logs = await AntiCheatService.getViolationLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe('MULTIPLE_USERS_ON_IP');
  });

  it('should set alert status to ok', async () => {
    vi.spyOn(SocketService, 'triggerAlertEvent').mockImplementation(() => {});

    await AntiCheatService.checkUserAction('student-a', '1.1.1.1', 'APP_ON_QUIT');
    const logs = await AntiCheatService.getViolationLogs();
    
    const result = await AntiCheatService.setAlertOkStatus(logs[0].id, true);
    expect(result).toBe(true);
    
    const updatedLogs = await AntiCheatService.getViolationLogs();
    expect(updatedLogs[0].isOk).toBe(true);
  });
});
