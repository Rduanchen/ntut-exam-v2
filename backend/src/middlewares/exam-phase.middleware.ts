import { Request, Response, NextFunction } from "express";
import { ExamStateService, ExamState } from "../services/exam-state.service";
import logger from "../utils/logger.util";

const {
  UNINITIALIZED,
  INITIALIZED,
  SETUP_FINISHED,
  IN_PROGRESS,
  FINISHED
} = ExamState;

interface PhaseRule {
  /** Path relative to the `/user` mount. */
  path: string;
  /** Phases in which this endpoint may be reached at all. */
  allowed: ExamState[];
  /** Also reachable during the post-FINISHED collection window. */
  graceAfterFinish?: boolean;
}

/**
 * Which student endpoints are reachable in which phase.
 *
 * This table is the enforcement point for `contracts/exam-phase-api.md` §2.
 * Before it existed, these rules were spread across the desktop router guard,
 * the device service, the auth service and the deploy-test service — and of
 * those, only deploy-test actually checked the phase. Collecting them here is
 * what makes the matrix testable as a whole rather than endpoint by endpoint.
 *
 * Two things this table deliberately does not decide:
 *
 *   - `register-device` is listed as reachable from SETUP_FINISHED onwards
 *     because the *gate* on it lives downstream: the device service has to
 *     record a TA approval request, which it cannot do if the request never
 *     arrives.
 *   - Authentication and decryption remain the concern of their own
 *     middlewares. This one answers "is now the right time", nothing else.
 */
const MATRIX: Record<string, PhaseRule[]> = {
  GET: [
    { path: "/auth/rsa-public-key", allowed: [INITIALIZED, SETUP_FINISHED, IN_PROGRESS] },
    { path: "/auth/student-id", allowed: [SETUP_FINISHED, IN_PROGRESS] },
    { path: "/exam/status", allowed: [UNINITIALIZED, INITIALIZED, SETUP_FINISHED, IN_PROGRESS, FINISHED] },
    { path: "/submissions/codes", allowed: [SETUP_FINISHED, IN_PROGRESS, FINISHED] }
  ],
  POST: [
    { path: "/exam/languages", allowed: [INITIALIZED, SETUP_FINISHED, IN_PROGRESS] },
    { path: "/auth/register-device", allowed: [INITIALIZED, SETUP_FINISHED, IN_PROGRESS] },
    { path: "/auth/login", allowed: [SETUP_FINISHED, IN_PROGRESS] },
    { path: "/exam/config", allowed: [INITIALIZED, SETUP_FINISHED, IN_PROGRESS] },
    { path: "/exam/key", allowed: [IN_PROGRESS] },
    { path: "/exam/environment-report", allowed: [INITIALIZED, SETUP_FINISHED, IN_PROGRESS] },
    { path: "/exam/messages", allowed: [INITIALIZED, SETUP_FINISHED, IN_PROGRESS, FINISHED] },
    { path: "/submissions/code", allowed: [IN_PROGRESS], graceAfterFinish: true },
    { path: "/submissions/score", allowed: [IN_PROGRESS], graceAfterFinish: true },
    { path: "/log", allowed: [INITIALIZED, SETUP_FINISHED, IN_PROGRESS, FINISHED] }
  ]
};

/** Strip a trailing slash so `/x` and `/x/` are the same route. */
function normalisePath(path: string): string {
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

function findRule(method: string, path: string): PhaseRule | undefined {
  const rules = MATRIX[method.toUpperCase()];
  if (!rules) return undefined;
  const wanted = normalisePath(path);
  return rules.find((rule) => rule.path === wanted);
}

function refuse(res: Response, phase: ExamState): void {
  res.status(409).json({ error: "phase_not_allowed", phase });
}

/**
 * Refuse student requests that do not belong to the current exam phase.
 *
 * Mounted at the root of the `/user` router so that anything not named in the
 * matrix fails closed. A route added later without being classified is refused
 * rather than silently open — a wrong answer that shows up the first time
 * someone calls it, instead of a gap nobody sees.
 */
export async function examPhaseMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let phase: ExamState;
  try {
    phase = await ExamStateService.getCurrentState();
  } catch (error: any) {
    // Without a phase there is no basis for allowing anything through.
    logger.error(`Exam phase check failed: ${error?.message ?? error}`);
    refuse(res, ExamState.UNINITIALIZED);
    return;
  }

  const rule = findRule(req.method, req.path);
  if (!rule) {
    refuse(res, phase);
    return;
  }

  if (rule.allowed.includes(phase)) {
    next();
    return;
  }

  if (rule.graceAfterFinish && phase === FINISHED && (await ExamStateService.isWithinSubmitGrace())) {
    next();
    return;
  }

  refuse(res, phase);
}

export default examPhaseMiddleware;
