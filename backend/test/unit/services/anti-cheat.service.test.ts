import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AntiCheatService } from '../../../src/services/anti-cheat.service';
import { ViolationLog } from '../../../src/models/violation-log.model';
import { UserActionLog } from '../../../src/models/user-action-log.model';
import { User } from '../../../src/models/user.model';
import { SocketService } from '../../../src/sockets/socket.service';


describe('AntiCheatService', () => {

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

    await AntiCheatService.checkUserAction('student-a', '1.1.1.1', 'alert', { type: 'APP_ON_QUIT', message: 'Application quit unexpectedly' });
    
    const logs = await AntiCheatService.getViolationLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe('APP_ON_QUIT');
    expect(logs[0].testId).toBe('student-a');
    expect(triggerSpy).toHaveBeenCalled();
  });

  it('should collapse same unresolved violation by updating time', async () => {
    vi.spyOn(SocketService, 'triggerAlertEvent').mockImplementation(() => {});

    await AntiCheatService.checkUserAction('student-a', '1.1.1.1', 'alert', { type: 'APP_ON_QUIT', message: 'Application quit unexpectedly' });
    const logs1 = await AntiCheatService.getViolationLogs();
    const firstTime = logs1[0].time;

    await new Promise(r => setTimeout(r, 100));

    await AntiCheatService.checkUserAction('student-a', '1.1.1.1', 'alert', { type: 'APP_ON_QUIT', message: 'Application quit unexpectedly' });
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

  it('falls back to the stored user IP when the request has none', async () => {
    vi.spyOn(SocketService, 'triggerAlertEvent').mockImplementation(() => {});

    // student-a is seeded with ipAddress 1.1.1.1; passing null must not lose it.
    await AntiCheatService.checkUserAction('student-a', null, 'alert', { type: 'APP_ON_QUIT', message: 'quit' });

    const logs = await AntiCheatService.getViolationLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].ipAddress).toBe('1.1.1.1');
  });

  it('does not fire a second socket alert when the same violation repeats', async () => {
    const triggerSpy = vi.spyOn(SocketService, 'triggerAlertEvent').mockImplementation(() => {});

    const details = { type: 'APP_ON_QUIT', message: 'Application quit unexpectedly' };
    await AntiCheatService.checkUserAction('student-a', '1.1.1.1', 'alert', details);
    await AntiCheatService.checkUserAction('student-a', '1.1.1.1', 'alert', details);

    // The violation collapses into one row, and the TA is alerted only once.
    expect(await AntiCheatService.getViolationLogs()).toHaveLength(1);
    expect(triggerSpy).toHaveBeenCalledTimes(1);
  });

  it('alerts again once a collapsed violation has been marked ok', async () => {
    const triggerSpy = vi.spyOn(SocketService, 'triggerAlertEvent').mockImplementation(() => {});

    const details = { type: 'APP_ON_QUIT', message: 'Application quit unexpectedly' };
    await AntiCheatService.checkUserAction('student-a', '1.1.1.1', 'alert', details);

    const [first] = await AntiCheatService.getViolationLogs();
    await AntiCheatService.setAlertOkStatus(first.id, true);

    await AntiCheatService.checkUserAction('student-a', '1.1.1.1', 'alert', details);

    // Resolving a violation must not silence a genuine recurrence.
    expect(await AntiCheatService.getViolationLogs()).toHaveLength(2);
    expect(triggerSpy).toHaveBeenCalledTimes(2);
  });

  it('returns false when marking a violation that does not exist', async () => {
    expect(await AntiCheatService.setAlertOkStatus(99999, true)).toBe(false);
  });

  it('should set alert status to ok', async () => {
    vi.spyOn(SocketService, 'triggerAlertEvent').mockImplementation(() => {});

    await AntiCheatService.checkUserAction('student-a', '1.1.1.1', 'alert', { type: 'APP_ON_QUIT', message: 'Application quit unexpectedly' });
    const logs = await AntiCheatService.getViolationLogs();
    
    const result = await AntiCheatService.setAlertOkStatus(logs[0].id, true);
    expect(result).toBe(true);
    
    const updatedLogs = await AntiCheatService.getViolationLogs();
    expect(updatedLogs[0].isOk).toBe(true);
  });
});
