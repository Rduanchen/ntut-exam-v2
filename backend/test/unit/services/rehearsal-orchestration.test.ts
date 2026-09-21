import { beforeEach, describe, expect, it } from 'vitest';
import { RehearsalService } from '../../../src/services/rehearsal.service';
import { RehearsalRepository } from '../../../src/services/rehearsal-repository';
import { SystemSettingsService } from '../../../src/services/system-settings.service';
import { ExamState } from '../../../src/services/exam-state.service';
import { User } from '../../../src/models/user.model';
import { DEFAULT_EXAM_CONFIG } from '../../../src/constants/default-config.constant';
import { CryptoService } from '../../../src/services/crypto.service';
import { ExamConfigCryptoService } from '../../../src/services/exam-config-crypto.service';
import { FakeTransport, json } from '../../helpers/rehearsal-transport';
import {
  REHEARSAL_EXAM_CONFIG,
  REHEARSAL_PUZZLE_AC,
  REHEARSAL_PUZZLE_WA,
  REHEARSAL_STUDENT_ID,
} from '../../../src/config/rehearsal-paper.config';
import { DEPLOY_TEST_DIAGNOSTIC_LIMIT } from '../../../src/config/deploy-test.config';
import type { RehearsalRequest, RehearsalResponse } from '../../../src/services/rehearsal-client';
import type { RehearsalRun, RehearsalStageId } from '../../../src/types/rehearsal.type';

/**
 * A backend that behaves. Every response is the one a working system gives, so
 * a test can make exactly one thing misbehave and see where the blame lands.
 *
 * The student's AES key is not known to this fake, so the encrypted responses
 * are built by the fake using whatever key the client registered — captured
 * from the register-device call.
 */
class HealthyBackend {
  private aesKey?: Buffer;
  private phase: string = 'UNINITIALIZED';
  /* A genuinely prepared paper, so the submit stage really does decrypt the
   * ciphered half with the released key. A stub cipher would make that check
   * fail for a reason the rehearsal is not testing. */
  private readonly prepared = ExamConfigCryptoService.prepare(REHEARSAL_EXAM_CONFIG);

  respond = (request: RehearsalRequest): RehearsalResponse => {
    const key = `${request.method} ${request.path}`;

    if (key === 'POST /admin/config') return json(200, { success: true });
    if (key === 'POST /admin/init') { this.phase = 'INITIALIZED'; return json(200, { passwordIsWeak: false }); }
    if (key === 'GET /admin/exam-state') return json(200, { state: this.phase });
    if (key === 'POST /admin/exam-state') {
      this.phase = (request.body as { state: string }).state;
      return json(200, { state: this.phase });
    }
    if (key === 'GET /user/auth/rsa-public-key') return json(200, { publicKey: CryptoService.getRsaPublicKey() });
    if (key === 'POST /user/auth/register-device') {
      const encrypted = (request.body as { encrypted_aes_key: string }).encrypted_aes_key;
      this.aesKey = CryptoService.decryptRSA(encrypted);
      return json(200, { message: 'Device registered successfully' });
    }
    if (key === 'POST /user/auth/login') {
      return json(200, { session_token: CryptoService.generateSessionToken({ testId: REHEARSAL_STUDENT_ID }, this.aesKey!) });
    }
    if (key === 'POST /user/exam/config') {
      return json(200, CryptoService.encryptAESGCM(JSON.stringify({ meta: this.prepared.meta, cipher: this.prepared.cipher }), this.aesKey!));
    }
    if (key === 'POST /user/exam/key') {
      /* The phase gate, as the real middleware applies it. */
      if (this.phase !== 'IN_PROGRESS') return json(409, { error: 'phase_not_allowed', phase: this.phase });
      return json(200, CryptoService.encryptAESGCM(JSON.stringify({ examKey: this.prepared.examKey }), this.aesKey!));
    }
    if (key === 'POST /user/exam/environment-report') return json(200, { success: true });
    if (key === 'POST /user/submissions/code') return json(200, { success: true });
    if (key === `POST /admin/judger/judge/${REHEARSAL_STUDENT_ID}`) return json(202, { jobId: 'job-1', state: 'waiting' });
    if (key === 'GET /admin/judger/jobs/job-1') {
      return json(200, { jobId: 'job-1', state: 'finished', outcome: { graded: 2, systemFailures: 0 } });
    }
    if (key === 'GET /admin/scores') {
      return json(200, [{
        testId: REHEARSAL_STUDENT_ID,
        puzzleResults: {
          [REHEARSAL_PUZZLE_AC]: { subtasks: [{ visible: [{ status: 'AC' }, { status: 'AC' }], hidden: [] }] },
          [REHEARSAL_PUZZLE_WA]: { subtasks: [{ visible: [{ status: 'WA' }, { status: 'WA' }], hidden: [] }] },
        },
      }]);
    }
    if (key === 'POST /admin/init/reset') { this.phase = 'UNINITIALIZED'; return json(200, { success: true }); }
    if (key === 'GET /admin/init/init-status') return json(200, { hasConfig: true, initializedUserCount: 0, isInitialized: false });
    if (key === 'GET /admin/config') return json(200, { ...DEFAULT_EXAM_CONFIG });
    if (key === 'GET /admin/connection/devices') return json(200, []);
    if (key === 'GET /admin/submissions/students') return json(200, []);

    return json(404, { error: `unstubbed ${key}` });
  };
}

const startAndSettle = async (transport: FakeTransport): Promise<RehearsalRun> => {
  RehearsalService.configureForTests({
    examState: async () => ExamState.UNINITIALIZED,
    transport: transport.fn,
    sleep: async () => undefined,
  });
  await RehearsalService.start({ acknowledgeWipe: true });
  await RehearsalService.settle();
  const run = await RehearsalRepository.read();
  expect(run).not.toBeNull();
  return run!;
};

const stageOf = (run: RehearsalRun, id: RehearsalStageId) => run.stages.find((stage) => stage.id === id)!;

beforeEach(async () => {
  await SystemSettingsService.saveExamConfig(DEFAULT_EXAM_CONFIG);
  await User.destroy({ where: {} });
});

describe('a rehearsal on a healthy system', () => {
  it('walks all six stages and passes', async () => {
    const run = await startAndSettle(new FakeTransport(new HealthyBackend().respond));

    expect(run.state).toBe('completed');
    expect(run.overallOutcome).toBe('passed');
    expect(run.cleanupCompleted).toBe(true);
    expect(run.stages.map((stage) => stage.status)).toEqual(['passed', 'passed', 'passed', 'passed', 'passed', 'passed']);
    expect(run.finishedAt).toBeDefined();
    expect(run.currentStage).toBeUndefined();
  });

  it('records the inverted check as a pass when the key is refused before the start', async () => {
    const run = await startAndSettle(new FakeTransport(new HealthyBackend().respond));
    const check = stageOf(run, 'enrol').checks.find((c) => c.id === 'exam_key_refused_before_start');
    expect(check?.status).toBe('passed');
    expect(check?.expected).toContain('409');
  });

  it('reaches the student API over the real student paths', async () => {
    const transport = new FakeTransport(new HealthyBackend().respond);
    await startAndSettle(transport);
    expect(transport.paths).toContain('POST /user/auth/register-device');
    expect(transport.paths).toContain('POST /user/exam/config');
    expect(transport.paths).toContain('POST /user/submissions/code');
    expect(transport.paths).toContain('POST /admin/init/reset');
  });

  it('times every stage and the run', async () => {
    const run = await startAndSettle(new FakeTransport(new HealthyBackend().respond));
    for (const stage of run.stages) {
      expect(stage.durationMs).toBeGreaterThanOrEqual(0);
      expect(stage.timeoutMs).toBeGreaterThan(0);
    }
  });
});

describe('a rehearsal that finds something broken', () => {
  it('fails the enrol stage when the paper is readable before the exam starts', async () => {
    /* The most serious thing this feature can find: the exam key handed out at
     * INITIALIZED means every machine in the room can read the paper early. */
    const transport = new FakeTransport(new HealthyBackend().respond)
      .override('POST /user/exam/key', json(200, { iv: 'x', ciphertext: 'y', tag: 'z' }));
    const run = await startAndSettle(transport);

    expect(stageOf(run, 'enrol').status).toBe('failed');
    const check = stageOf(run, 'enrol').checks.find((c) => c.id === 'exam_key_refused_before_start');
    expect(check?.status).toBe('failed');
    expect(run.overallOutcome).toBe('failed');
  });

  it('blames the stage that actually broke, and skips the ones after it', async () => {
    const transport = new FakeTransport(new HealthyBackend().respond)
      .override('POST /user/submissions/code', json(500, { error: 'boom' }));
    const run = await startAndSettle(transport);

    expect(stageOf(run, 'paper').status).toBe('passed');
    expect(stageOf(run, 'enrol').status).toBe('passed');
    expect(stageOf(run, 'admit').status).toBe('passed');
    expect(stageOf(run, 'submit').status).toBe('failed');
    expect(stageOf(run, 'grade').status).toBe('skipped');
  });

  it('cleans up even when a stage failed', async () => {
    const transport = new FakeTransport(new HealthyBackend().respond)
      .override('POST /user/submissions/code', json(500, { error: 'boom' }));
    const run = await startAndSettle(transport);

    expect(stageOf(run, 'cleanup').status).toBe('passed');
    expect(run.cleanupCompleted).toBe(true);
    expect(run.overallOutcome).toBe('failed');
  });

  it('refuses to call a system-attributed failure a verified verdict', async () => {
    const transport = new FakeTransport(new HealthyBackend().respond)
      .override('GET /admin/judger/jobs/job-1', json(200, {
        jobId: 'job-1', state: 'finished', outcome: { graded: 1, systemFailures: 1 },
      }));
    const run = await startAndSettle(transport);

    const grade = stageOf(run, 'grade');
    expect(grade.status).toBe('failed');
    const systemCheck = grade.checks.find((c) => c.id === 'no_system_attribution');
    expect(systemCheck?.status).toBe('failed');
    expect(systemCheck?.attribution).toBe('system');
    /* The WA verdict must not be claimed as verified: with a system failure in
     * the run there is no way to tell the student's error from the judge's. */
    expect(grade.checks.find((c) => c.id === 'verdict_wa_matches')).toBeUndefined();
  });

  it('fails grading when judging is refused outright', async () => {
    /* Pins the coordinator decision: the rehearsal lease must not block
     * acquireStudent(), or the real system returns 409 here and the rehearsal
     * deadlocks against itself at its most important stage. */
    const transport = new FakeTransport(new HealthyBackend().respond)
      .override(`POST /admin/judger/judge/${REHEARSAL_STUDENT_ID}`, json(409, { error: 'Conflict: deployment test is active or draining' }));
    const run = await startAndSettle(transport);

    const grade = stageOf(run, 'grade');
    expect(grade.status).toBe('failed');
    expect(grade.checks.find((c) => c.id === 'judge_accepted')?.status).toBe('failed');
    expect(grade.failureReason).toContain('未被受理');
  });

  it('reports a wrong verdict rather than accepting it', async () => {
    const transport = new FakeTransport(new HealthyBackend().respond)
      .override('GET /admin/scores', json(200, [{
        testId: REHEARSAL_STUDENT_ID,
        puzzleResults: {
          [REHEARSAL_PUZZLE_AC]: { subtasks: [{ visible: [{ status: 'WA' }], hidden: [] }] },
          [REHEARSAL_PUZZLE_WA]: { subtasks: [{ visible: [{ status: 'AC' }], hidden: [] }] },
        },
      }]));
    const run = await startAndSettle(transport);

    const grade = stageOf(run, 'grade');
    expect(grade.checks.find((c) => c.id === 'verdict_ac_matches')?.status).toBe('failed');
    expect(grade.checks.find((c) => c.id === 'verdict_wa_matches')?.status).toBe('failed');
  });

  it('marks the machine dirty when cleanup itself fails', async () => {
    const transport = new FakeTransport(new HealthyBackend().respond)
      .override('POST /admin/init/reset', json(500, { error: 'reset exploded' }));
    const run = await startAndSettle(transport);

    expect(run.cleanupCompleted).toBe(false);
    expect(run.cleanupError).toBeDefined();
    expect(run.overallOutcome).toBe('failed');

    /* And that residue must block the next rehearsal rather than being papered
     * over by a fresh one. */
    RehearsalService.configureForTests({ examState: async () => ExamState.UNINITIALIZED });
    expect((await RehearsalService.descriptor()).blockedReason).toBe('cleanup_pending');
  });

  it('skips cleanup when nothing was ever written', async () => {
    const transport = new FakeTransport(new HealthyBackend().respond)
      .override('POST /admin/config', json(500, { error: 'nope' }));
    const run = await startAndSettle(transport);

    expect(stageOf(run, 'paper').status).toBe('failed');
    expect(stageOf(run, 'cleanup').status).toBe('skipped');
    /* Nothing to erase means the machine is clean, so the next rehearsal must
     * not be blocked. */
    expect(run.cleanupCompleted).toBe(true);
  });

  it('truncates what it copies into the report', async () => {
    /* Everything written into a check's `observed` comes from outside — an
     * endpoint's error body, a compiler's stderr — and unbounded output has
     * frozen this system before. */
    const enormous = 'x'.repeat(50_000);
    const transport = new FakeTransport(new HealthyBackend().respond)
      .override('POST /admin/config', json(500, { error: enormous }));
    const run = await startAndSettle(transport);

    const observed = run.stages.flatMap((stage) => stage.checks).map((check) => check.observed ?? '');
    expect(observed.some((value) => value.length > 0)).toBe(true);
    for (const value of observed) {
      expect(value.length).toBeLessThan(enormous.length);
      expect(value.length).toBeLessThanOrEqual(DEPLOY_TEST_DIAGNOSTIC_LIMIT);
    }
  });

  it('records a transport failure as a finding, not a crash', async () => {
    const transport = new FakeTransport(new HealthyBackend().respond)
      .override('POST /admin/config', { status: 0, body: null, text: 'transport error: ECONNREFUSED' });
    const run = await startAndSettle(transport);

    expect(run.state).toBe('completed');
    expect(stageOf(run, 'paper').status).toBe('failed');
  });
});
