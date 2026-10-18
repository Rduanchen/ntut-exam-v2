import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

import { examPhaseMiddleware } from '../../../src/middlewares/exam-phase.middleware';
import { ExamStateService, ExamState } from '../../../src/services/exam-state.service';

const ALL_PHASES = Object.values(ExamState);

const {
  UNINITIALIZED,
  INITIALIZED,
  SETUP_FINISHED,
  IN_PROGRESS,
  FINISHED,
} = ExamState;

/**
 * The expected matrix, written out independently of the implementation.
 *
 * It is deliberately a second copy of `contracts/exam-phase-api.md` §2 rather
 * than an import of the middleware's own table — a test that reads the table it
 * is checking would pass for any table. Changing what an endpoint allows must
 * require changing this file too.
 */
const MATRIX: Array<{
  method: string;
  path: string;
  allowed: ExamState[];
  graceAfterFinish?: boolean;
}> = [
  { method: 'GET', path: '/auth/rsa-public-key', allowed: [INITIALIZED, SETUP_FINISHED, IN_PROGRESS] },
  { method: 'POST', path: '/auth/register-device', allowed: [INITIALIZED, SETUP_FINISHED, IN_PROGRESS] },
  { method: 'GET', path: '/auth/student-id', allowed: [SETUP_FINISHED, IN_PROGRESS] },
  { method: 'POST', path: '/auth/login', allowed: [SETUP_FINISHED, IN_PROGRESS] },
  { method: 'POST', path: '/exam/config', allowed: [INITIALIZED, SETUP_FINISHED, IN_PROGRESS] },
  { method: 'POST', path: '/exam/languages', allowed: [INITIALIZED, SETUP_FINISHED, IN_PROGRESS] },
  { method: 'POST', path: '/exam/key', allowed: [IN_PROGRESS] },
  { method: 'POST', path: '/exam/environment-report', allowed: [INITIALIZED, SETUP_FINISHED, IN_PROGRESS] },
  { method: 'POST', path: '/exam/messages', allowed: [INITIALIZED, SETUP_FINISHED, IN_PROGRESS, FINISHED] },
  { method: 'GET', path: '/exam/status', allowed: ALL_PHASES },
  { method: 'POST', path: '/submissions/code', allowed: [IN_PROGRESS], graceAfterFinish: true },
  { method: 'POST', path: '/submissions/score', allowed: [IN_PROGRESS], graceAfterFinish: true },
  { method: 'GET', path: '/submissions/codes', allowed: [SETUP_FINISHED, IN_PROGRESS, FINISHED] },
  { method: 'POST', path: '/log', allowed: [INITIALIZED, SETUP_FINISHED, IN_PROGRESS, FINISHED] },
];

function fakeExchange(method: string, path: string) {
  const req = { method, path } as unknown as Request;
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  const next = vi.fn() as unknown as NextFunction;
  return { req, res: res as unknown as Response & typeof res, next };
}

async function run(method: string, path: string) {
  const { req, res, next } = fakeExchange(method, path);
  await examPhaseMiddleware(req, res, next);
  return { res, next: next as unknown as ReturnType<typeof vi.fn> };
}

describe('examPhaseMiddleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(ExamStateService, 'isWithinSubmitGrace').mockResolvedValue(false);
  });

  describe('the phase matrix', () => {
    for (const entry of MATRIX) {
      for (const phase of ALL_PHASES) {
        const permitted = entry.allowed.includes(phase);

        it(`${permitted ? 'allows' : 'refuses'} ${entry.method} ${entry.path} in ${phase}`, async () => {
          vi.spyOn(ExamStateService, 'getCurrentState').mockResolvedValue(phase);

          const { res, next } = await run(entry.method, entry.path);

          if (permitted) {
            expect(next).toHaveBeenCalledOnce();
            expect(res.statusCode).toBe(0);
          } else {
            expect(next).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(409);
            expect(res.body).toEqual({ error: 'phase_not_allowed', phase });
          }
        });
      }
    }
  });

  describe('the submit grace window', () => {
    const submitting = MATRIX.filter((entry) => entry.graceAfterFinish);

    it.each(submitting)('admits $method $path while the window is open', async (entry) => {
      vi.spyOn(ExamStateService, 'getCurrentState').mockResolvedValue(FINISHED);
      vi.spyOn(ExamStateService, 'isWithinSubmitGrace').mockResolvedValue(true);

      const { res, next } = await run(entry.method, entry.path);

      expect(next).toHaveBeenCalledOnce();
      expect(res.statusCode).toBe(0);
    });

    it.each(submitting)('refuses $method $path once it has closed', async (entry) => {
      vi.spyOn(ExamStateService, 'getCurrentState').mockResolvedValue(FINISHED);
      vi.spyOn(ExamStateService, 'isWithinSubmitGrace').mockResolvedValue(false);

      const { res, next } = await run(entry.method, entry.path);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(409);
    });

    it('does not consult the window outside FINISHED', async () => {
      vi.spyOn(ExamStateService, 'getCurrentState').mockResolvedValue(IN_PROGRESS);

      await run('POST', '/submissions/code');

      expect(ExamStateService.isWithinSubmitGrace).not.toHaveBeenCalled();
    });
  });

  describe('endpoints outside the matrix', () => {
    /* Default deny. A new route that nobody remembered to classify must fail
     * closed — being refused is discoverable, silently being open is not. */
    it.each(ALL_PHASES)('refuses an unlisted path in %s', async (phase) => {
      vi.spyOn(ExamStateService, 'getCurrentState').mockResolvedValue(phase);

      const { res, next } = await run('POST', '/exam/something-new');

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(409);
    });

    it('refuses a known path reached with the wrong method', async () => {
      vi.spyOn(ExamStateService, 'getCurrentState').mockResolvedValue(IN_PROGRESS);

      const { res, next } = await run('DELETE', '/submissions/code');

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(409);
    });
  });

  describe('path normalisation', () => {
    it('accepts a trailing slash', async () => {
      vi.spyOn(ExamStateService, 'getCurrentState').mockResolvedValue(IN_PROGRESS);

      const { next } = await run('POST', '/submissions/code/');

      expect(next).toHaveBeenCalledOnce();
    });

    it('is case-insensitive on the method', async () => {
      vi.spyOn(ExamStateService, 'getCurrentState').mockResolvedValue(IN_PROGRESS);

      const { next } = await run('post', '/submissions/code');

      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('when the phase cannot be read', () => {
    it('refuses rather than assuming a phase', async () => {
      vi.spyOn(ExamStateService, 'getCurrentState').mockRejectedValue(new Error('db down'));

      const { res, next } = await run('POST', '/submissions/code');

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(409);
    });
  });
});
