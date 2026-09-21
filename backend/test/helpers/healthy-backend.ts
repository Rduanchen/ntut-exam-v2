import { ExamConfigCryptoService } from '../../src/services/exam-config-crypto.service';
import { CryptoService } from '../../src/services/crypto.service';
import { DEFAULT_EXAM_CONFIG } from '../../src/constants/default-config.constant';
import { json } from './rehearsal-transport';
import {
  REHEARSAL_EXAM_CONFIG, REHEARSAL_PUZZLE_AC, REHEARSAL_PUZZLE_WA, REHEARSAL_STUDENT_ID,
} from '../../src/config/rehearsal-paper.config';
import type { RehearsalRequest, RehearsalResponse } from '../../src/services/rehearsal-client';

/**
 * A backend that behaves.
 *
 * One definition shared by every rehearsal test, so that "what a working
 * system answers" is stated once. A per-file copy is how fixtures drift from
 * the code they stand in for.
 */
export class HealthyBackend {
  private aesKey?: Buffer;
  private phase = 'UNINITIALIZED';
  readonly prepared = ExamConfigCryptoService.prepare(REHEARSAL_EXAM_CONFIG);
  /** Deliver the paper with its ciphered half missing. */
  omitCipher = false;

  /** The device key the client registered, for stubbing encrypted replies. */
  deviceKey(): Buffer | undefined { return this.aesKey; }

  /** The phase the fake is in — lets a test target one stage's use of a path. */
  phaseNow(): string { return this.phase; }

  respond = (request: RehearsalRequest): RehearsalResponse => {
    const key = `${request.method} ${request.path}`;
    if (key === 'POST /admin/config') return json(200, { success: true });
    if (key === 'POST /admin/init') { this.phase = 'INITIALIZED'; return json(200, {}); }
    if (key === 'GET /admin/exam-state') return json(200, { state: this.phase });
    if (key === 'POST /admin/exam-state') { this.phase = (request.body as { state: string }).state; return json(200, { state: this.phase }); }
    if (key === 'GET /user/auth/rsa-public-key') return json(200, { publicKey: CryptoService.getRsaPublicKey() });
    if (key === 'POST /user/auth/register-device') {
      this.aesKey = CryptoService.decryptRSA((request.body as { encrypted_aes_key: string }).encrypted_aes_key);
      return json(200, {});
    }
    if (key === 'POST /user/auth/login') return json(200, { session_token: CryptoService.generateSessionToken({ testId: REHEARSAL_STUDENT_ID }, this.aesKey!) });
    if (key === 'POST /user/exam/config') {
      const delivered = this.omitCipher
        ? { meta: this.prepared.meta }
        : { meta: this.prepared.meta, cipher: this.prepared.cipher };
      return json(200, CryptoService.encryptAESGCM(JSON.stringify(delivered), this.aesKey!));
    }
    if (key === 'POST /user/exam/key') {
      if (this.phase !== 'IN_PROGRESS') return json(409, { error: 'phase_not_allowed', phase: this.phase });
      return json(200, CryptoService.encryptAESGCM(JSON.stringify({ examKey: this.prepared.examKey }), this.aesKey!));
    }
    if (key === 'POST /user/exam/environment-report') return json(200, {});
    if (key === 'POST /user/submissions/code') return json(200, {});
    if (key === `POST /admin/judger/judge/${REHEARSAL_STUDENT_ID}`) return json(202, { jobId: 'job-1' });
    if (key === 'GET /admin/judger/jobs/job-1') return json(200, { jobId: 'job-1', state: 'finished', outcome: { graded: 2, systemFailures: 0 } });
    if (key === 'GET /admin/scores') {
      return json(200, [{
        testId: REHEARSAL_STUDENT_ID,
        puzzleResults: JSON.stringify({
          [REHEARSAL_PUZZLE_AC]: { subtasks: [{ visible: [{ status: 'AC' }], hidden: [] }] },
          [REHEARSAL_PUZZLE_WA]: { subtasks: [{ visible: [], hidden: [{ status: 'WA' }] }] },
        }),
      }]);
    }
    if (key === 'POST /admin/init/reset') { this.phase = 'UNINITIALIZED'; return json(200, {}); }
    if (key === 'GET /admin/init/init-status') return json(200, { initializedUserCount: 0 });
    if (key === 'GET /admin/config') return json(200, { ...DEFAULT_EXAM_CONFIG });
    if (key === 'GET /admin/connection/devices') return json(200, []);
    if (key === 'GET /admin/submissions/students') return json(200, []);
    return json(404, { error: `unstubbed ${key}` });
  };
}
