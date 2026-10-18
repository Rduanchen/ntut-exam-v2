import { describe, it, expect, beforeEach, vi } from 'vitest';
import type express from 'express';

import { createApp } from '../../../../src/app';
import { TestClient } from '../../../helpers/test-client';
import { seedExamPhase } from '../../../helpers/exam-phase';
import { ExamState } from '../../../../src/services/exam-state.service';
import { DeviceKeyMap } from '../../../../src/models/device-key-map.model';
import { DeviceService } from '../../../../src/services/device.service';
import { SocketService } from '../../../../src/sockets/socket.service';

describe('POST /user/exam/environment-report (integration)', () => {
  let app: express.Express;
  let client: TestClient;
  const deviceUuid = 'device-env-1';

  beforeEach(async () => {
    app = createApp();
    vi.restoreAllMocks();
    vi.spyOn(SocketService, 'triggerDataUpdateEvent').mockImplementation(() => {});

    /* The environment check runs in INITIALIZED — machines in the room,
     * students not. Nothing has logged in yet, and that is the point. */
    await seedExamPhase(ExamState.INITIALIZED);

    client = new TestClient(app);
    await client.registerDevice(deviceUuid);
  });

  it('accepts a report from a registered device that has never logged in', async () => {
    const res = await client.post('/user/exam/environment-report', {
      status: 'PASSED',
      failedLanguages: [],
    });

    expect(res.status).toBe(200);

    const device = await DeviceKeyMap.findOne({ where: { deviceUuid } });
    expect(device?.envCheckStatus).toBe('PASSED');
    expect(device?.testId).toBeNull();
  });

  it('ignores delayed RUNNING and duplicate reports after the terminal sequence', async () => {
    await client.post('/user/exam/environment-report', { status: 'PASSED', failedLanguages: [], sequence: 2 });
    await client.post('/user/exam/environment-report', { status: 'RUNNING', failedLanguages: [], sequence: 1 });
    await client.post('/user/exam/environment-report', { status: 'FAILED', failedLanguages: ['Cpp'], sequence: 2 });
    expect((await DeviceKeyMap.findByPk(deviceUuid))?.envCheckStatus).toBe('PASSED');
  });

  it('records which languages failed', async () => {
    await client.post('/user/exam/environment-report', {
      status: 'FAILED',
      failedLanguages: ['Cpp', 'Java'],
    });

    const device = await DeviceKeyMap.findOne({ where: { deviceUuid } });
    expect(device?.envCheckStatus).toBe('FAILED');
    expect(JSON.parse(device!.envCheckFailedLanguages!)).toEqual(['Cpp', 'Java']);
    expect(device?.envCheckReportedAt).toBeInstanceOf(Date);
  });

  it('overwrites the previous report rather than accumulating', async () => {
    await client.post('/user/exam/environment-report', {
      status: 'FAILED',
      failedLanguages: ['Cpp'],
    });
    await client.post('/user/exam/environment-report', {
      status: 'PASSED',
      failedLanguages: [],
    });

    const device = await DeviceKeyMap.findOne({ where: { deviceUuid } });
    expect(device?.envCheckStatus).toBe('PASSED');
    expect(device?.envCheckFailedLanguages).toBeNull();
  });

  it('refuses a status outside the three it knows', async () => {
    const res = await client.post('/user/exam/environment-report', {
      status: 'PROBABLY_FINE',
      failedLanguages: [],
    });

    expect(res.status).toBe(400);
  });

  it('refuses a device that has not registered', async () => {
    const stranger = new TestClient(app);
    await stranger.registerDevice('device-env-other');
    await DeviceKeyMap.destroy({ where: { deviceUuid: 'device-env-other' } });

    const res = await stranger.post('/user/exam/environment-report', {
      status: 'PASSED',
      failedLanguages: [],
    });

    expect(res.status).toBe(401);
  });

  it('refuses an unencrypted body', async () => {
    const res = await client.postRaw('/user/exam/environment-report', {
      device_uuid: deviceUuid,
      status: 'PASSED',
    });

    expect(res.status).toBe(400);
  });

  it('bounds how many failing languages it will store', async () => {
    // The payload is student-supplied. Nothing here is trusted to be small.
    const many = Array.from({ length: 100 }, (_, i) => `Lang${i}`);

    await client.post('/user/exam/environment-report', {
      status: 'FAILED',
      failedLanguages: many,
    });

    const device = await DeviceKeyMap.findOne({ where: { deviceUuid } });
    expect(JSON.parse(device!.envCheckFailedLanguages!)).toHaveLength(20);
  });

  it('bounds each untrusted failed-language label before storing it', async () => {
    await client.post('/user/exam/environment-report', {
      status: 'FAILED', failedLanguages: ['X'.repeat(1000)], sequence: 1,
    });

    const device = await DeviceKeyMap.findOne({ where: { deviceUuid } });
    expect(JSON.parse(device!.envCheckFailedLanguages!)).toEqual(['X'.repeat(32)]);
  });

  it('is refused before the machines are meant to be set up', async () => {
    await seedExamPhase(ExamState.UNINITIALIZED);

    const res = await client.post('/user/exam/environment-report', {
      status: 'PASSED',
      failedLanguages: [],
    });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'phase_not_allowed' });
  });
  it('rejects an already authenticated old registration at the atomic write', async () => {
    const old = await DeviceKeyMap.findByPk(deviceUuid);
    await client.registerDevice(deviceUuid);
    await expect(DeviceService.recordOrderedEnvironmentReport(deviceUuid, old!.clientAesKey, 99, 'FAILED', ['C'])).rejects.toMatchObject({ statusCode: 401 });
    const fresh = await DeviceKeyMap.findByPk(deviceUuid);
    expect(fresh?.envCheckStatus).toBe('UNKNOWN');
    expect(fresh?.envCheckSequence).toBe(0);
  });

  it.each([undefined, 0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1])('rejects invalid report sequence %s', async sequence => {
    expect((await client.post('/user/exam/environment-report', { status: 'PASSED', failedLanguages: [], sequence })).status).toBe(400);
  });

});
