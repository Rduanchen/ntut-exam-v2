import { beforeEach, describe, expect, it } from 'vitest';
import { RehearsalService } from '../../../src/services/rehearsal.service';
import { RehearsalRepository } from '../../../src/services/rehearsal-repository';
import { SystemSettingsService } from '../../../src/services/system-settings.service';
import { ExamState } from '../../../src/services/exam-state.service';
import { CryptoService } from '../../../src/services/crypto.service';
import { User } from '../../../src/models/user.model';
import { DEFAULT_EXAM_CONFIG } from '../../../src/constants/default-config.constant';
import { ExamConfigCryptoService } from '../../../src/services/exam-config-crypto.service';
import { FakeTransport, json } from '../../helpers/rehearsal-transport';
import { HealthyBackend } from '../../helpers/healthy-backend';
import { REHEARSAL_EXAM_CONFIG, REHEARSAL_STUDENT_ID } from '../../../src/config/rehearsal-paper.config';
import type { RehearsalRun, RehearsalStageId } from '../../../src/types/rehearsal.type';

/**
 * Every way a stage can fail, one at a time.
 *
 * The value of a rehearsal is not that it passes — it is that when something
 * is wrong it says which thing. These tests are that claim, checked.
 */
const runWith = async (build: (t: FakeTransport, backend: HealthyBackend) => void = () => {}): Promise<RehearsalRun> => {
  const backend = new HealthyBackend();
  const transport = new FakeTransport(backend.respond);
  build(transport, backend);
  RehearsalService.configureForTests({
    examState: async () => ExamState.UNINITIALIZED,
    transport: transport.fn,
    sleep: async () => undefined,
  });
  await RehearsalService.start({ acknowledgeWipe: true });
  await RehearsalService.settle();
  return (await RehearsalRepository.read())!;
};

const stageOf = (run: RehearsalRun, id: RehearsalStageId) => run.stages.find((s) => s.id === id)!;
const checkOf = (run: RehearsalRun, id: RehearsalStageId, checkId: string) =>
  stageOf(run, id).checks.find((c) => c.id === checkId);

beforeEach(async () => {
  await SystemSettingsService.saveExamConfig(DEFAULT_EXAM_CONFIG);
  await User.destroy({ where: {} });
});

describe('stage 1 — paper', () => {
  it('fails when initialisation is rejected', async () => {
    const run = await runWith((t) => t.override('POST /admin/init', json(400, { error: 'no config' })));
    expect(checkOf(run, 'paper', 'database_initialized')?.status).toBe('failed');
    expect(stageOf(run, 'paper').failureReason).toContain('初始化');
  });

  it('fails when the phase did not advance', async () => {
    const run = await runWith((t) => t.override('GET /admin/exam-state', json(200, { state: 'UNINITIALIZED' })));
    expect(checkOf(run, 'paper', 'phase_is_initialized')?.status).toBe('failed');
  });
});

describe('stage 2 — enrol', () => {
  it('fails when the device cannot register', async () => {
    const run = await runWith((t) => t.override('POST /user/auth/register-device', json(403, { error: 'closed' })));
    expect(checkOf(run, 'enrol', 'device_registered')?.status).toBe('failed');
  });

  it('fails when the paper is not delivered', async () => {
    const run = await runWith((t) => t.override('POST /user/exam/config', json(409, { error: 'not prepared' })));
    expect(checkOf(run, 'enrol', 'paper_meta_received')?.status).toBe('failed');
    expect(stageOf(run, 'enrol').failureReason).toContain('取得考卷');
  });

  it('fails when the delivered paper cannot be decrypted with the device key', async () => {
    const run = await runWith((t) => t.override('POST /user/exam/config', json(200, { iv: 'AAAA', ciphertext: 'BBBB', tag: 'CCCC' })));
    expect(checkOf(run, 'enrol', 'paper_meta_received')?.status).toBe('failed');
    expect(stageOf(run, 'enrol').failureReason).toContain('裝置金鑰');
  });

  it('notices a paper delivered with a half missing', async () => {
    const run = await runWith((_t, backend) => { backend.omitCipher = true; });
    expect(checkOf(run, 'enrol', 'paper_meta_received')?.status).toBe('passed');
    expect(checkOf(run, 'enrol', 'paper_cipher_received')?.status).toBe('failed');
  });

  it('fails when the environment report is rejected', async () => {
    const run = await runWith((t) => t.override('POST /user/exam/environment-report', json(400, { error: 'bad status' })));
    expect(checkOf(run, 'enrol', 'environment_reported')?.status).toBe('failed');
    /* The inverted check still runs — one broken endpoint must not hide the
     * most important result in the report. */
    expect(checkOf(run, 'enrol', 'exam_key_refused_before_start')?.status).toBe('passed');
  });
});

describe('stage 3 — admit', () => {
  it('fails when the phase will not advance to SETUP_FINISHED', async () => {
    const run = await runWith((t) => t.override('POST /admin/exam-state', json(400, { error: 'invalid_transition' })));
    expect(checkOf(run, 'admit', 'phase_is_setup_finished')?.status).toBe('failed');
  });

  it('fails when the student cannot log in', async () => {
    const run = await runWith((t) => t.override('POST /user/auth/login', json(403, { code: 'IP_MISMATCH' })));
    expect(checkOf(run, 'admit', 'student_logged_in')?.status).toBe('failed');
  });

  it('fails when login succeeds without issuing a session', async () => {
    const run = await runWith((t) => t.override('POST /user/auth/login', json(200, {})));
    expect(checkOf(run, 'admit', 'session_token_issued')?.status).toBe('failed');
  });
});

describe('stage 4 — submit', () => {
  it('fails when the exam key is still withheld after the start', async () => {
    const run = await runWith((t) => t.override('POST /user/exam/key', json(409, { error: 'phase_not_allowed' })));
    /* The same override makes the inverted check in stage 2 pass and this one
     * fail — which is exactly the asymmetry the two stages exist to express. */
    expect(checkOf(run, 'enrol', 'exam_key_refused_before_start')?.status).toBe('passed');
    expect(checkOf(run, 'submit', 'exam_key_released')?.status).toBe('failed');
  });

  it('fails when a submission is rejected', async () => {
    const run = await runWith((t) => t.override('POST /user/submissions/code', json(400, { error: 'Invalid questionId' })));
    expect(checkOf(run, 'submit', 'submission_ac_accepted')?.status).toBe('failed');
    expect(checkOf(run, 'submit', 'submission_wa_accepted')?.status).toBe('failed');
  });
});

describe('stage 5 — grade', () => {
  it('fails when the judging job itself broke', async () => {
    const run = await runWith((t) => t.override('GET /admin/judger/jobs/job-1',
      json(200, { jobId: 'job-1', state: 'failed', error: 'judger exploded' })));
    expect(checkOf(run, 'grade', 'judge_finished')?.status).toBe('failed');
    expect(checkOf(run, 'grade', 'judge_finished')?.observed).toContain('judger exploded');
  });

  it('fails when the job never reaches a terminal state', async () => {
    const run = await runWith((t) => t.override('GET /admin/judger/jobs/job-1',
      json(200, { jobId: 'job-1', state: 'running' })));
    expect(checkOf(run, 'grade', 'judge_finished')?.status).toBe('failed');
    expect(stageOf(run, 'grade').failureReason).toContain('逾時');
    /* Still cleaned up: a timed-out rehearsal is not an excuse for residue. */
    expect(run.cleanupCompleted).toBe(true);
  });

  it('fails when judging is accepted without a handle', async () => {
    const run = await runWith((t) => t.override(`POST /admin/judger/judge/${REHEARSAL_STUDENT_ID}`, json(202, {})));
    expect(checkOf(run, 'grade', 'judge_accepted')?.status).toBe('failed');
  });

  it('fails when the rehearsal student has no scoreboard row', async () => {
    const run = await runWith((t) => t.override('GET /admin/scores', json(200, [])));
    expect(checkOf(run, 'grade', 'verdict_ac_matches')?.status).toBe('failed');
    expect(stageOf(run, 'grade').failureReason).toContain('成績單');
  });

  it('fails when a puzzle produced no verdicts at all', async () => {
    const run = await runWith((t) => t.override('GET /admin/scores', json(200, [{
      testId: REHEARSAL_STUDENT_ID, puzzleResults: {},
    }])));
    expect(checkOf(run, 'grade', 'verdict_ac_matches')?.status).toBe('failed');
    expect(checkOf(run, 'grade', 'verdict_wa_matches')?.status).toBe('failed');
  });
});

describe('stage 6 — cleanup', () => {
  it('fails when the phase did not return to UNINITIALIZED', async () => {
    const backend = new HealthyBackend();
    const transport = new FakeTransport(backend.respond);
    /* Reset answers 200 but leaves the phase where it was — the failure mode a
     * check on the reset's own status code would miss entirely. */
    transport.override('POST /admin/init/reset', json(200, {}));
    RehearsalService.configureForTests({
      examState: async () => ExamState.UNINITIALIZED, transport: transport.fn, sleep: async () => undefined,
    });
    await RehearsalService.start({ acknowledgeWipe: true });
    await RehearsalService.settle();
    const run = (await RehearsalRepository.read())!;

    expect(checkOf(run, 'cleanup', 'phase_is_uninitialized')?.status).toBe('failed');
    expect(run.cleanupCompleted).toBe(false);
  });

  it('fails when students survived the wipe', async () => {
    const run = await runWith((t) => t.override('GET /admin/init/init-status', json(200, { initializedUserCount: 3 })));
    expect(checkOf(run, 'cleanup', 'users_zero')?.status).toBe('failed');
  });

  it('fails when the rehearsal paper is still loaded', async () => {
    const run = await runWith((t) => t.override('GET /admin/config', json(200, REHEARSAL_EXAM_CONFIG)));
    expect(checkOf(run, 'cleanup', 'config_absent')?.status).toBe('failed');
  });

  it('fails when devices or submissions survived', async () => {
    const run = await runWith((t) => {
      t.override('GET /admin/connection/devices', json(200, [{ deviceUuid: 'x' }]));
      t.override('GET /admin/submissions/students', json(200, [{ testId: 'x' }]));
    });
    expect(checkOf(run, 'cleanup', 'devices_zero')?.status).toBe('failed');
    expect(checkOf(run, 'cleanup', 'submissions_zero')?.status).toBe('failed');
  });
});

describe('the remaining ways each stage can go wrong', () => {
  it('fails when the exam will not start', async () => {
    const run = await runWith((t) => t.overrideWhen(
      'POST /admin/exam-state',
      (request) => (request.body as { state?: string })?.state === 'IN_PROGRESS',
      json(400, { error: 'invalid_transition' }),
    ));
    expect(checkOf(run, 'admit', 'phase_is_setup_finished')?.status).toBe('passed');
    expect(checkOf(run, 'submit', 'phase_is_in_progress')?.status).toBe('failed');
  });

  it('fails when the released key cannot be decrypted', async () => {
    const run = await runWith((t, backend) => t.overrideWhen(
      'POST /user/exam/key',
      () => backend.phaseNow() === 'IN_PROGRESS',
      json(200, { iv: 'AAAAAAAAAAAAAAAA', ciphertext: 'BBBB', tag: 'CCCCCCCCCCCCCCCCCCCCCCC=' }),
    ));
    expect(checkOf(run, 'enrol', 'exam_key_refused_before_start')?.status).toBe('passed');
    expect(checkOf(run, 'submit', 'exam_key_released')?.status).toBe('failed');
    expect(stageOf(run, 'submit').failureReason).toContain('解密');
  });

  it('fails when the key released does not open the paper', async () => {
    /* A key that arrives but does not decrypt the ciphertext is worse than no
     * key: it looks like success everywhere except the one place that matters. */
    const other = ExamConfigCryptoService.prepare(REHEARSAL_EXAM_CONFIG);
    const run = await runWith((t, backend) => t.overrideWhen(
      'POST /user/exam/key',
      () => backend.phaseNow() === 'IN_PROGRESS',
      () => json(200, CryptoService.encryptAESGCM(JSON.stringify({ examKey: other.examKey }), backend.deviceKey()!)),
    ));
    expect(checkOf(run, 'submit', 'cipher_decrypted')?.status).toBe('failed');
  });

  it('fails when the exam key arrives empty', async () => {
    const run = await runWith((t, backend) => t.overrideWhen(
      'POST /user/exam/key',
      () => backend.phaseNow() === 'IN_PROGRESS',
      () => json(200, CryptoService.encryptAESGCM(JSON.stringify({}), backend.deviceKey()!)),
    ));
    expect(checkOf(run, 'submit', 'exam_key_released')?.status).toBe('failed');
    /* Without a key there is nothing to open the ciphertext with, and the
     * report must say that rather than reporting a decryption that never ran. */
    expect(checkOf(run, 'submit', 'cipher_decrypted')?.observed).toContain('缺少');
  });

  it('notices the rehearsal section surviving in the configuration', async () => {
    const run = await runWith((t) => t.override('GET /admin/config', json(200, {
      accessibleUsers: [], sections: [{ id: '__rehearsal_section__' }],
    })));
    expect(checkOf(run, 'cleanup', 'config_absent')?.status).toBe('failed');
  });
});
