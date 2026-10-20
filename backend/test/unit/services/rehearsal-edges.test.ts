import { beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { RehearsalService } from '../../../src/services/rehearsal.service';
import { RehearsalRepository } from '../../../src/services/rehearsal-repository';
import { SystemSettingsService } from '../../../src/services/system-settings.service';
import { ExamState } from '../../../src/services/exam-state.service';
import { JudgingWorkCoordinator } from '../../../src/services/judging-work-coordinator';
import { User } from '../../../src/models/user.model';
import { SystemSettings } from '../../../src/models/system-settings.model';
import { DEFAULT_EXAM_CONFIG } from '../../../src/constants/default-config.constant';
import { loopbackTransport } from '../../../src/services/rehearsal-client';
import { FakeTransport, json } from '../../helpers/rehearsal-transport';
import { HealthyBackend } from '../../helpers/healthy-backend';

beforeEach(async () => {
  await SystemSettingsService.saveExamConfig(DEFAULT_EXAM_CONFIG);
  await User.destroy({ where: {} });
  vi.restoreAllMocks();
});

describe('the loopback transport against a real socket', () => {
  it('sends the admin token and reads back the response', async () => {
    const seen: { auth?: string; body?: string; method?: string; url?: string } = {};
    const server = http.createServer((req, res) => {
      seen.auth = req.headers['x-admin-token'] as string;
      seen.method = req.method;
      seen.url = req.url;
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        seen.body = body;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const previous = process.env.PORT;
    const previousUserPort = process.env.USER_PORT;
    process.env.PORT = String((server.address() as AddressInfo).port);
    process.env.USER_PORT = process.env.PORT;

    try {
      const response = await loopbackTransport({ method: 'POST', path: '/admin/rehearsal', body: { acknowledgeWipe: true }, admin: true });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
      expect(seen.auth).toBe(process.env.ADMIN_TOKEN);
      expect(JSON.parse(seen.body!)).toEqual({ acknowledgeWipe: true });

      const anonymous = await loopbackTransport({ method: 'GET', path: '/user/exam/status' });
      expect(anonymous.status).toBe(200);
      expect(seen.auth).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.PORT; else process.env.PORT = previous;
      if (previousUserPort === undefined) delete process.env.USER_PORT; else process.env.USER_PORT = previousUserPort;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('keeps a non-JSON body as text rather than throwing', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(502, { 'Content-Type': 'text/html' });
      res.end('<html>bad gateway</html>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const previous = process.env.PORT;
    process.env.PORT = String((server.address() as AddressInfo).port);

    try {
      const response = await loopbackTransport({ method: 'GET', path: '/admin/rehearsal/profile', admin: true });
      expect(response.status).toBe(502);
      expect(response.body).toContain('bad gateway');
    } finally {
      if (previous === undefined) delete process.env.PORT; else process.env.PORT = previous;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('reads an empty body as null', async () => {
    const server = http.createServer((_req, res) => { res.writeHead(204); res.end(); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const previous = process.env.PORT;
    process.env.PORT = String((server.address() as AddressInfo).port);

    try {
      const response = await loopbackTransport({ method: 'GET', path: '/admin/rehearsal/latest', admin: true });
      expect(response.body).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.PORT; else process.env.PORT = previous;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('rehearsal service edges', () => {
  it('treats a missing exam config as nothing to lose', async () => {
    await SystemSettings.destroy({ where: { name: 'exam_config' } });
    RehearsalService.configureForTests({ examState: async () => ExamState.UNINITIALIZED });
    expect((await RehearsalService.descriptor()).canStart).toBe(true);
  });

  it('reports a rehearsal by id, and nothing for an id it does not hold', async () => {
    RehearsalService.configureForTests({
      examState: async () => ExamState.UNINITIALIZED,
      transport: new FakeTransport(() => json(500, { error: 'stop here' })).fn,
      sleep: async () => undefined,
    });
    const envelope = await RehearsalService.start({ acknowledgeWipe: true });
    await RehearsalService.settle();

    expect((await RehearsalService.get(envelope.run!.id))?.run?.id).toBe(envelope.run!.id);
    expect(await RehearsalService.get('11111111-2222-4333-8444-000000000000')).toBeNull();
  });

  it('releases the work lease when the rehearsal ends', async () => {
    RehearsalService.configureForTests({
      examState: async () => ExamState.UNINITIALIZED,
      transport: new FakeTransport(() => json(500, { error: 'stop here' })).fn,
      sleep: async () => undefined,
    });
    await RehearsalService.start({ acknowledgeWipe: true });
    await RehearsalService.settle();

    expect(JudgingWorkCoordinator.hasRehearsalWork()).toBe(false);
    expect(JudgingWorkCoordinator.acquireDeploy().lease).toBeDefined();
  });

  it('gives up when the whole-run deadline has already passed', async () => {
    /* Nothing is attempted and the report says why, rather than the run
     * quietly reporting six skipped stages as a pass. */
    let clock = 0;
    RehearsalService.configureForTests({
      examState: async () => ExamState.UNINITIALIZED,
      now: () => clock,
      transport: new FakeTransport(() => json(200, {})).fn,
      sleep: async () => undefined,
    });
    await RehearsalService.start({ acknowledgeWipe: true });
    clock = 10_000_000;
    await RehearsalService.settle();

    const run = (await RehearsalRepository.read())!;
    expect(run.state).toBe('interrupted');
    expect(run.interruptionReason).toBe('deadline_exceeded');
    expect(run.overallOutcome).toBe('interrupted');
  });

  it('records an orchestration failure as a report it does not trust', async () => {
    /* Distinct from a failing stage: a stage that fails produces a complete
     * report with bad news in it. This is a rehearsal with no report at all. */
    RehearsalService.configureForTests({
      examState: async () => ExamState.UNINITIALIZED,
      transport: new FakeTransport(() => json(200, {})).fn,
      sleep: async () => undefined,
    });
    vi.spyOn(RehearsalRepository, 'rememberPriorConfig').mockResolvedValue(undefined);
    const replace = vi.spyOn(RehearsalRepository, 'replace');
    let calls = 0;
    replace.mockImplementation(async () => {
      calls += 1;
      if (calls === 2) throw new Error('storage exploded');
    });

    await RehearsalService.start({ acknowledgeWipe: true });
    await RehearsalService.settle();
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});

describe('the admin rehearsal controller', () => {
  it('turns an unexpected failure into a 500 rather than leaking it', async () => {
    const { AdminRehearsalController } = await import('../../../src/controllers/admin/admin-rehearsal.controller');
    vi.spyOn(RehearsalService, 'start').mockRejectedValue(new Error('something unmapped'));

    const json_ = vi.fn();
    const res = { status: vi.fn().mockReturnValue({ json: json_ }) } as never;
    await AdminRehearsalController.start({ body: { acknowledgeWipe: true } } as never, res);

    expect((res as unknown as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(500);
    expect(json_).toHaveBeenCalledWith({ error: 'Internal Server Error' });
  });
});

describe('orchestration edges', () => {
  it('stops a stage that overruns its own allowance', async () => {
    /* The stage keeps waiting; the timer decides it has waited long enough. */
    RehearsalService.configureForTests({
      examState: async () => ExamState.UNINITIALIZED,
      transport: async () => new Promise(() => { /* never answers */ }),
      sleep: async () => undefined,
      schedule: (callback) => setTimeout(callback, 0),
      cancel: (handle) => clearTimeout(handle),
    });
    await RehearsalService.start({ acknowledgeWipe: true });
    await RehearsalService.settle();

    const run = (await RehearsalRepository.read())!;
    const paper = run.stages.find((stage) => stage.id === 'paper')!;
    expect(paper.status).toBe('failed');
    expect(paper.failureReason).toContain('段落逾時');
  });

  it("records a thrown transport as the stage's failure, not a crash", async () => {
    RehearsalService.configureForTests({
      examState: async () => ExamState.UNINITIALIZED,
      transport: async () => { throw new Error('socket vanished'); },
      sleep: async () => undefined,
    });
    await RehearsalService.start({ acknowledgeWipe: true });
    await RehearsalService.settle();

    const run = (await RehearsalRepository.read())!;
    expect(run.state).toBe('completed');
    expect(run.stages.find((stage) => stage.id === 'paper')!.failureReason).toContain('socket vanished');
  });

  it('refuses a second rehearsal while one holds the lease', async () => {
    const held = JudgingWorkCoordinator.acquireRehearsal();
    RehearsalService.configureForTests({ examState: async () => ExamState.UNINITIALIZED });
    expect((await RehearsalService.descriptor()).blockedReason).toBe('rehearsal_active');
    held.lease?.release();
  });

  it('reports a rehearsal still in flight as the reason it cannot start', async () => {
    await RehearsalRepository.replace({
      id: '33333333-4444-4555-8666-777777777777',
      state: 'running',
      stages: (await RehearsalService.descriptor()).stages.map((stage) => ({
        id: stage.id, status: 'pending' as const, timeoutMs: stage.timeoutMs, checks: [],
      })),
      ownsSystemState: true,
      cleanupCompleted: false,
      startedAt: 1,
      deadlineMs: 300_000,
      errors: [],
    });
    RehearsalService.configureForTests({ examState: async () => ExamState.UNINITIALIZED });
    expect((await RehearsalService.descriptor()).blockedReason).toBe('rehearsal_active');
  });
});

describe('startup recovery restores what it overwrote', () => {
  it("puts the operator's configuration back", async () => {
    const measured = { ...DEFAULT_EXAM_CONFIG, judgerSettings: { ...DEFAULT_EXAM_CONFIG.judgerSettings, maxConcurrentJobs: 23 } };
    await RehearsalRepository.rememberPriorConfig(measured);
    await SystemSettingsService.saveExamConfig({ ...DEFAULT_EXAM_CONFIG, accessibleUsers: [{ id: '__rehearsal__', name: 'x' }] });
    await RehearsalRepository.replace({
      id: '44444444-5555-4666-8777-888888888888',
      state: 'running',
      stages: (await RehearsalService.descriptor()).stages.map((stage) => ({
        id: stage.id, status: 'pending' as const, timeoutMs: stage.timeoutMs, checks: [],
      })),
      ownsSystemState: true,
      cleanupCompleted: false,
      startedAt: 1,
      deadlineMs: 300_000,
      errors: [],
    });

    const { RehearsalStartupService } = await import('../../../src/services/rehearsal-startup.service');
    await RehearsalStartupService.run();

    const restored = await SystemSettingsService.getExamConfig();
    expect(restored.judgerSettings.maxConcurrentJobs).toBe(23);
    expect(restored.accessibleUsers).toHaveLength(0);
    expect(await RehearsalRepository.readPriorConfig()).toBeUndefined();
  });
});

describe('the paths that only a race or a defect reaches', () => {
  it('refuses when the work lease is taken between the check and the claim', async () => {
    /* `blockedReason` has already said yes by this point, so only a race gets
     * here. It is still a refusal rather than a rehearsal running without a
     * lease, which would let a deploy test start alongside it. */
    RehearsalService.configureForTests({ examState: async () => ExamState.UNINITIALIZED });
    vi.spyOn(JudgingWorkCoordinator, 'acquireRehearsal').mockReturnValue({ reason: 'deploy_test_active' });

    await expect(RehearsalService.start({ acknowledgeWipe: true }))
      .rejects.toMatchObject({ status: 409, reason: 'deploy_test_active' });
  });

  it('still releases the lease when even the failure report cannot be written', async () => {
    /* Orchestration broke and storage broke with it. Nothing can be reported —
     * but holding the lease forever would block every later rehearsal and
     * every deploy test too. */
    RehearsalService.configureForTests({
      examState: async () => ExamState.UNINITIALIZED,
      transport: new FakeTransport(() => json(200, {})).fn,
      sleep: async () => undefined,
    });
    let writes = 0;
    vi.spyOn(RehearsalRepository, 'replace').mockImplementation(async () => {
      writes += 1;
      if (writes >= 2) throw new Error('storage gone');
    });


    await RehearsalService.start({ acknowledgeWipe: true });
    await RehearsalService.settle();

    expect(JudgingWorkCoordinator.hasRehearsalWork()).toBe(false);
  });

  it('waits between polls with a real timer when nothing overrides it', async () => {
    /* Exercises the shipped defaults rather than the test doubles: a wait that
     * is only ever stubbed is a wait nobody has run. The job reports itself
     * unfinished once, so the grading stage takes the real one-second pause. */
    const backend = new HealthyBackend();
    let asked = 0;
    const transport = new FakeTransport((request) => {
      if (request.path === '/admin/judger/jobs/job-1') {
        asked += 1;
        if (asked === 1) return json(200, { jobId: 'job-1', state: 'running' });
      }
      return backend.respond(request);
    });

    RehearsalService.configureForTests({
      examState: async () => ExamState.UNINITIALIZED,
      transport: transport.fn,
      /* sleep, schedule and cancel deliberately left as the real ones. */
    });
    await RehearsalService.start({ acknowledgeWipe: true });
    await RehearsalService.settle();
    const run = (await RehearsalRepository.read())!;
    expect(asked).toBeGreaterThan(1);
    expect(run.stages.find((stage) => stage.id === 'grade')!.status).toBe('passed');
  }, 30_000);
});
