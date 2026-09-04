import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';

import { createApp } from '../../../../src/app';
import { adminRequest } from '../../../helpers/admin-request';
import { seedExamPhase } from '../../../helpers/exam-phase';
import { ExamState } from '../../../../src/services/exam-state.service';
import { User } from '../../../../src/models/user.model';
import { DeviceKeyMap } from '../../../../src/models/device-key-map.model';

describe('AdminReadinessController (integration)', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = createApp();
    vi.restoreAllMocks();
    await seedExamPhase(ExamState.SETUP_FINISHED);
  });

  const seedStudent = async (
    testId: string,
    device?: Partial<{
      isOnline: boolean;
      envCheckStatus: string;
      envCheckFailedLanguages: string | null;
      bound: boolean;
    }>
  ) => {
    if (device) {
      await DeviceKeyMap.create({
        deviceUuid: `dev-${testId}`,
        clientAesKey: 'x'.repeat(64),
        ipAddress: '192.168.1.5',
        isOnline: device.isOnline ?? false,
        envCheckStatus: device.envCheckStatus ?? 'UNKNOWN',
        envCheckFailedLanguages: device.envCheckFailedLanguages ?? null,
        testId: device.bound ? testId : null,
      });
    }
    await User.create({
      testId,
      name: `Student ${testId}`,
      deviceUuid: device?.bound ? `dev-${testId}` : null,
      ipAddress: null,
    });
  };

  it('requires an admin token', async () => {
    const res = await request(app).get('/admin/readiness');

    expect(res.status).toBe(401);
  });

  it('reports a student as ready only when all four conditions hold', async () => {
    await seedStudent('s-ready', { isOnline: true, envCheckStatus: 'PASSED', bound: true });

    const res = await adminRequest(app).get('/admin/readiness');

    expect(res.status).toBe(200);
    expect(res.body.students[0]).toMatchObject({ testId: 's-ready', ready: true });
    expect(res.body.summary).toMatchObject({ total: 1, ready: 1 });
  });

  it('is not ready when the machine passed its check but nobody logged in', async () => {
    await seedStudent('s-nologin', { isOnline: true, envCheckStatus: 'PASSED', bound: false });

    const res = await adminRequest(app).get('/admin/readiness');

    expect(res.body.students[0]).toMatchObject({ ready: false, isLoggedIn: false });
  });

  it('is not ready when the student logged in on a machine that cannot run the exam', async () => {
    /* The condition this system could not see before: a seat that is logged in
     * and online, but whose toolchain failed its check. */
    await seedStudent('s-badenv', {
      isOnline: true,
      envCheckStatus: 'FAILED',
      envCheckFailedLanguages: JSON.stringify(['Cpp']),
      bound: true,
    });

    const res = await adminRequest(app).get('/admin/readiness');

    expect(res.body.students[0]).toMatchObject({ ready: false, envCheckStatus: 'FAILED' });
    expect(res.body.students[0].envCheckFailedLanguages).toEqual(['Cpp']);
    expect(res.body.summary.environmentFailed).toBe(1);
  });

  it('is not ready when the machine has dropped offline', async () => {
    await seedStudent('s-offline', { isOnline: false, envCheckStatus: 'PASSED', bound: true });

    const res = await adminRequest(app).get('/admin/readiness');

    expect(res.body.students[0]).toMatchObject({ ready: false, isOnline: false });
  });

  it('reports a student with no device at all', async () => {
    await seedStudent('s-none');

    const res = await adminRequest(app).get('/admin/readiness');

    expect(res.body.students[0]).toMatchObject({
      ready: false,
      isRegistered: false,
      envCheckStatus: 'UNKNOWN',
    });
    expect(res.body.summary).toMatchObject({ registered: 0 });
  });

  it('survives a malformed failed-language list', async () => {
    await seedStudent('s-corrupt', {
      isOnline: true,
      envCheckStatus: 'FAILED',
      envCheckFailedLanguages: '{not json',
      bound: true,
    });

    const res = await adminRequest(app).get('/admin/readiness');

    expect(res.status).toBe(200);
    expect(res.body.students[0].envCheckFailedLanguages).toEqual([]);
  });

  it('marks the phase where readiness is the question being asked', async () => {
    const settling = await adminRequest(app).get('/admin/readiness');
    expect(settling.body.isSettlingPhase).toBe(true);

    await seedExamPhase(ExamState.IN_PROGRESS);
    const running = await adminRequest(app).get('/admin/readiness');
    expect(running.body.isSettlingPhase).toBe(false);
    expect(running.body.phase).toBe(ExamState.IN_PROGRESS);
  });
});
