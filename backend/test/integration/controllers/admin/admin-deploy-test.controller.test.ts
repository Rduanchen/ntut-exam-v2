import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { PistonJudger } from 'piston-judger';
import { createApp } from '../../../../src/app';
import { DeployTestService } from '../../../../src/services/deploy-test.service';
import { ExamState } from '../../../../src/services/exam-state.service';
import { accepted, executionOk } from '../../../fixtures/judge-verdicts.fixture';

const app = createApp();
const runtimes = [{ language: 'c', version: '10', aliases: ['gcc'] }, { language: 'c++', version: '10', aliases: ['cpp'] }, { language: 'python', version: '3', aliases: ['python3'] }];
const client: PistonJudger = { runtimes: vi.fn(async () => runtimes), execute: vi.fn(async () => executionOk()), judge: vi.fn(() => accepted()) };
const profile = { phases: ['smoke'], languages: ['c', 'cpp', 'python'], concurrencyLevels: [1], jobCount: 1, deadlineMs: 60_000 };
const admin = () => request(app).post('/admin/judger/deploy-tests').set('x-admin-token', process.env.ADMIN_TOKEN!);

beforeEach(() => DeployTestService.configureForTests({ examState: async () => ExamState.NOT_STARTED, health: async () => ({ reachable: true, url: 'piston', runtimes }), client: () => client }));
describe('admin deployment-test contract', () => {
  it('inherits admin authentication', async () => expect((await request(app).get('/admin/judger/deploy-tests/profile')).status).toBe(401));
  it('returns the authoritative profile and strict validation errors', async () => {
    const descriptor = await request(app).get('/admin/judger/deploy-tests/profile').set('x-admin-token', process.env.ADMIN_TOKEN!);
    expect(descriptor.status).toBe(200); expect(descriptor.body.defaults.jobCount).toBe(100);
    const invalid = await admin().send({ ...profile, surprise: true });
    expect(invalid.status).toBe(400); expect(invalid.body.issues).toEqual(expect.any(Array));
  });
  it('accepts asynchronously, exposes latest/status, and returns an active run idempotently', async () => {
    const first = await admin().send(profile); expect(first.status).toBe(202); expect(first.body.run.state).toBe('queued');
    const second = await admin().send(profile); expect([200, 202]).toContain(second.status);
    const latest = await request(app).get('/admin/judger/deploy-tests/latest').set('x-admin-token', process.env.ADMIN_TOKEN!);
    expect(latest.status).toBe(200); expect(latest.body.run.id).toBe(first.body.run.id);
    const status = await request(app).get(`/admin/judger/deploy-tests/${first.body.run.id}`).set('x-admin-token', process.env.ADMIN_TOKEN!);
    expect(status.status).toBe(200);
  });
  it('returns 503 without creating partial evidence when Piston is unavailable', async () => {
    DeployTestService.configureForTests({ health: async () => ({ reachable: false, url: 'piston', runtimes: [], error: 'down' }) });
    expect((await admin().send(profile)).status).toBe(503);
  });
  it('returns 404 for a run outside latest-only retention', async () => {
    const response = await request(app).get('/admin/judger/deploy-tests/2c1bd6fa-2a3f-48eb-b103-e5829578a33f').set('x-admin-token', process.env.ADMIN_TOKEN!);
    expect(response.status).toBe(404);
  });
  it('contains unexpected orchestration errors at the HTTP boundary', async () => {
    vi.spyOn(DeployTestService, 'start').mockRejectedValueOnce('broken');
    const response = await admin().send(profile);
    expect(response.status).toBe(500); expect(response.body.error).toBe('Internal Server Error');
  });
});
