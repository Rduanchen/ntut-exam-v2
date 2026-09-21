import { ExamConfigCryptoService } from "./exam-config-crypto.service";
import { RehearsalRepository } from "./rehearsal-repository";
import { SystemSettingsService } from "./system-settings.service";
import { SimulatedStudent, type RehearsalTransport } from "./rehearsal-client";
import { truncateJudgerOutput } from "../utils/judger-output.util";
import { REHEARSAL_JUDGE_POLL_INTERVAL_MS } from "../config/rehearsal.config";
import {
  REHEARSAL_CODE_CORRECT,
  REHEARSAL_CODE_WRONG,
  REHEARSAL_EXAM_CONFIG,
  REHEARSAL_PUZZLE_AC,
  REHEARSAL_PUZZLE_SCORE,
  REHEARSAL_PUZZLE_WA,
  REHEARSAL_SECTION_ID,
  REHEARSAL_STUDENT_ID,
} from "../config/rehearsal-paper.config";
import type { RehearsalCheck } from "../types/rehearsal.type";

/**
 * The six stages, as pure-ish steps over a transport.
 *
 * Separated from the orchestration in `rehearsal.service.ts` so that "what the
 * rehearsal does" and "how progress, timeouts and persistence are managed" can
 * each be read without the other.
 */

export interface StageContext {
  transport: RehearsalTransport;
  student: SimulatedStudent;
  /** Carried between stages: the paper halves and the key, once obtained. */
  state: {
    meta?: unknown;
    cipher?: unknown;
    examKey?: string;
  };
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** True once the stage's own deadline has passed; long waits check it. */
  expired: () => boolean;
  /** This stage's allowance, so a polling loop can bound its own attempts. */
  timeoutMs: number;
}

export type StageResult = { checks: RehearsalCheck[]; failureReason?: string };

const pass = (id: string, expected: string, observed?: string): RehearsalCheck => ({
  id,
  status: "passed",
  expected,
  ...(observed ? { observed: truncateJudgerOutput(observed) } : {}),
});

const fail = (id: string, expected: string, observed: string): RehearsalCheck => ({
  id,
  status: "failed",
  expected,
  observed: truncateJudgerOutput(observed),
});

const describe = (status: number, body: unknown): string =>
  `${status} ${typeof body === "string" ? body : JSON.stringify(body)}`;

/** Stage 1 — upload the rehearsal paper, initialise, and reach INITIALIZED. */
export async function runPaperStage(context: StageContext): Promise<StageResult> {
  const checks: RehearsalCheck[] = [];

  const upload = await context.transport({ method: "POST", path: "/admin/config", body: REHEARSAL_EXAM_CONFIG, admin: true });
  if (upload.status !== 200 && upload.status !== 201) {
    checks.push(fail("config_uploaded", "200 OK", describe(upload.status, upload.body)));
    return { checks, failureReason: "演練考卷上傳失敗" };
  }
  checks.push(pass("config_uploaded", "200 OK"));

  const init = await context.transport({ method: "POST", path: "/admin/init", admin: true });
  if (init.status !== 200 && init.status !== 201) {
    checks.push(fail("database_initialized", "200 OK", describe(init.status, init.body)));
    return { checks, failureReason: "資料庫初始化失敗" };
  }
  checks.push(pass("database_initialized", "200 OK"));

  const phase = await context.transport({ method: "GET", path: "/admin/exam-state", admin: true });
  const state = (phase.body as { state?: string } | null)?.state;
  if (state !== "INITIALIZED") {
    checks.push(fail("phase_is_initialized", "state = INITIALIZED", describe(phase.status, phase.body)));
    return { checks, failureReason: "初始化後階段不是 INITIALIZED" };
  }
  checks.push(pass("phase_is_initialized", "state = INITIALIZED"));

  return { checks };
}

/**
 * Stage 2 — a machine enters: register, collect the paper, report its
 * environment, and be refused the exam key.
 */
export async function runEnrolStage(context: StageContext): Promise<StageResult> {
  const checks: RehearsalCheck[] = [];

  const registered = await context.student.registerDevice();
  if (registered.status !== 200) {
    checks.push(fail("device_registered", "200 OK", describe(registered.status, registered.body)));
    return { checks, failureReason: "模擬裝置註冊失敗" };
  }
  checks.push(pass("device_registered", "200 OK"));

  const paper = await context.student.post("/user/exam/config");
  if (paper.status !== 200) {
    checks.push(fail("paper_meta_received", "200 OK", describe(paper.status, paper.body)));
    return { checks, failureReason: "取得考卷失敗" };
  }
  let delivered: { meta?: unknown; cipher?: unknown };
  try {
    delivered = context.student.decrypt<{ meta?: unknown; cipher?: unknown }>(paper.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push(fail("paper_meta_received", "device-key decryptable payload", message));
    return { checks, failureReason: "考卷回應無法以裝置金鑰解密" };
  }

  checks.push(delivered.meta ? pass("paper_meta_received", "meta present") : fail("paper_meta_received", "meta present", "meta absent"));
  checks.push(delivered.cipher ? pass("paper_cipher_received", "cipher present") : fail("paper_cipher_received", "cipher present", "cipher absent"));
  context.state.meta = delivered.meta;
  context.state.cipher = delivered.cipher;

  const report = await context.student.post("/user/exam/environment-report", {
    device_uuid: context.student.deviceUuid,
    /* The endpoint's own vocabulary — RUNNING / PASSED / FAILED — not this
     * module's lowercase check statuses. */
    status: "PASSED",
    failedLanguages: [],
  });
  checks.push(report.status === 200
    ? pass("environment_reported", "200 OK")
    : fail("environment_reported", "200 OK", describe(report.status, report.body)));

  /* The inverted check, and the most important one in the rehearsal.
   *
   * At INITIALIZED the phase matrix must refuse the exam key. A 200 here does
   * not mean the rehearsal failed to test something — it means the paper on
   * every machine in the room is readable before the exam has started. */
  const key = await context.student.post("/user/exam/key");
  if (key.status === 409) {
    checks.push(pass("exam_key_refused_before_start", "409 phase_not_allowed", describe(key.status, key.body)));
  } else {
    checks.push(fail(
      "exam_key_refused_before_start",
      "409 phase_not_allowed",
      `測資保護失效：開考前索取金鑰得到 ${describe(key.status, key.body)}`,
    ));
  }

  const failed = checks.filter((check) => check.status === "failed");
  return { checks, ...(failed.length ? { failureReason: failed.map((c) => c.id).join(", ") } : {}) };
}

/** Stage 3 — registration closes, the student logs in. */
export async function runAdmitStage(context: StageContext): Promise<StageResult> {
  const checks: RehearsalCheck[] = [];

  const advance = await context.transport({ method: "POST", path: "/admin/exam-state", body: { state: "SETUP_FINISHED" }, admin: true });
  if (advance.status !== 200) {
    checks.push(fail("phase_is_setup_finished", "200 OK", describe(advance.status, advance.body)));
    return { checks, failureReason: "無法推進到 SETUP_FINISHED" };
  }
  checks.push(pass("phase_is_setup_finished", "state = SETUP_FINISHED"));

  const login = await context.student.login(REHEARSAL_STUDENT_ID);
  if (login.status !== 200) {
    checks.push(fail("student_logged_in", "200 OK", describe(login.status, login.body)));
    return { checks, failureReason: "模擬學生登入失敗" };
  }
  checks.push(pass("student_logged_in", "200 OK"));
  checks.push(context.student.hasSession
    ? pass("session_token_issued", "session_token present")
    : fail("session_token_issued", "session_token present", "登入成功但未回傳 session_token"));

  const failed = checks.filter((check) => check.status === "failed");
  return { checks, ...(failed.length ? { failureReason: failed.map((c) => c.id).join(", ") } : {}) };
}

/** Stage 4 — the exam starts, the key is released, two submissions go in. */
export async function runSubmitStage(context: StageContext): Promise<StageResult> {
  const checks: RehearsalCheck[] = [];

  const advance = await context.transport({ method: "POST", path: "/admin/exam-state", body: { state: "IN_PROGRESS" }, admin: true });
  if (advance.status !== 200) {
    checks.push(fail("phase_is_in_progress", "200 OK", describe(advance.status, advance.body)));
    return { checks, failureReason: "無法推進到 IN_PROGRESS" };
  }
  checks.push(pass("phase_is_in_progress", "state = IN_PROGRESS"));

  const key = await context.student.post("/user/exam/key");
  if (key.status !== 200) {
    checks.push(fail("exam_key_released", "200 OK", describe(key.status, key.body)));
    return { checks, failureReason: "開考後仍無法取得考卷金鑰" };
  }
  let examKey: string | undefined;
  try {
    examKey = context.student.decrypt<{ examKey?: string }>(key.body).examKey;
  } catch (error) {
    checks.push(fail("exam_key_released", "device-key decryptable payload", error instanceof Error ? error.message : String(error)));
    return { checks, failureReason: "金鑰回應無法解密" };
  }
  checks.push(examKey ? pass("exam_key_released", "examKey present") : fail("exam_key_released", "examKey present", "examKey absent"));
  context.state.examKey = examKey;

  /* Decrypting the ciphered half is the end-to-end proof that the paper the
   * machine holds is the paper the backend prepared — and, together with the
   * refusal in stage 2, that it was unreadable until this moment. */
  if (examKey && context.state.cipher) {
    try {
      const secret = ExamConfigCryptoService.decryptSecret(context.state.cipher as never, examKey);
      const puzzleIds = secret.puzzles.map((puzzle) => puzzle.id);
      const expected = [REHEARSAL_PUZZLE_AC, REHEARSAL_PUZZLE_WA];
      checks.push(expected.every((id) => puzzleIds.includes(id))
        ? pass("cipher_decrypted", `puzzles ${expected.join(", ")} readable`)
        : fail("cipher_decrypted", `puzzles ${expected.join(", ")} readable`, `解出的題目為 ${puzzleIds.join(", ")}`));
    } catch (error) {
      checks.push(fail("cipher_decrypted", "cipher decrypts with the released key", error instanceof Error ? error.message : String(error)));
    }
  } else {
    checks.push(fail("cipher_decrypted", "cipher decrypts with the released key", "缺少金鑰或密文"));
  }

  const submissions: Array<[string, string, string]> = [
    ["submission_ac_accepted", REHEARSAL_PUZZLE_AC, REHEARSAL_CODE_CORRECT],
    ["submission_wa_accepted", REHEARSAL_PUZZLE_WA, REHEARSAL_CODE_WRONG],
  ];
  for (const [checkId, questionId, codeContent] of submissions) {
    const response = await context.student.post("/user/submissions/code", {
      questionId,
      language: "C",
      codeContent,
    });
    checks.push(response.status === 200
      ? pass(checkId, "200 OK")
      : fail(checkId, "200 OK", describe(response.status, response.body)));
  }

  const failed = checks.filter((check) => check.status === "failed");
  return { checks, ...(failed.length ? { failureReason: failed.map((c) => c.id).join(", ") } : {}) };
}

interface JudgeJobBody {
  jobId?: string;
  state?: string;
  outcome?: { graded?: number; systemFailures?: number };
  error?: string;
}

/** Stage 5 — the TA presses judge, and the verdicts must be the expected ones. */
export async function runGradeStage(context: StageContext): Promise<StageResult> {
  const checks: RehearsalCheck[] = [];

  const accepted = await context.transport({
    method: "POST",
    path: `/admin/judger/judge/${encodeURIComponent(REHEARSAL_STUDENT_ID)}`,
    body: {},
    admin: true,
  });
  const jobId = (accepted.body as JudgeJobBody | null)?.jobId;
  if (accepted.status !== 202 || !jobId) {
    checks.push(fail("judge_accepted", "202 Accepted with a jobId", describe(accepted.status, accepted.body)));
    return { checks, failureReason: "助教手動評測未被受理" };
  }
  checks.push(pass("judge_accepted", "202 Accepted with a jobId"));

  /* Bounded by attempts as well as by the clock. A loop whose only exit is
   * wall-clock time spins as fast as the machine allows if the wait between
   * polls ever becomes free — which is not hypothetical: it is what a stubbed
   * sleep does, and a hot loop starves the very work it is waiting for. */
  const maxPolls = Math.max(1, Math.ceil(context.timeoutMs / REHEARSAL_JUDGE_POLL_INTERVAL_MS));
  let job: JudgeJobBody | null = null;
  for (let poll = 0; poll < maxPolls && !context.expired(); poll += 1) {
    const status = await context.transport({ method: "GET", path: `/admin/judger/jobs/${jobId}`, admin: true });
    job = status.body as JudgeJobBody | null;
    if (job?.state === "finished" || job?.state === "failed") break;
    await context.sleep(REHEARSAL_JUDGE_POLL_INTERVAL_MS);
  }

  if (!job || (job.state !== "finished" && job.state !== "failed")) {
    checks.push(fail("judge_finished", "job reaches a terminal state", "等待評測完成逾時"));
    return { checks, failureReason: "評測逾時" };
  }
  if (job.state === "failed") {
    checks.push(fail("judge_finished", "state = finished", `評測工作失敗：${job.error ?? "未提供原因"}`));
    return { checks, failureReason: "評測工作失敗" };
  }
  checks.push(pass("judge_finished", "state = finished"));

  /* A system-attributed failure says nothing about the submitted code. Letting
   * it stand as a verified verdict is precisely the mistake that charged
   * students for the judge's own compile timeouts. */
  const systemFailures = job.outcome?.systemFailures ?? 0;
  if (systemFailures > 0) {
    checks.push({
      id: "no_system_attribution",
      status: "failed",
      expected: "systemFailures = 0",
      observed: truncateJudgerOutput(`評測回報 ${systemFailures} 筆系統歸因的失敗`),
      attribution: "system",
    });
    return { checks, failureReason: "評測出現系統歸因的失敗，判定不可信" };
  }
  checks.push({ id: "no_system_attribution", status: "passed", expected: "systemFailures = 0", attribution: "submission" });

  const scores = await context.transport({ method: "GET", path: "/admin/scores", admin: true });
  const rows = Array.isArray(scores.body) ? scores.body as Array<{ testId?: string; puzzleResults?: unknown }> : [];
  const row = rows.find((entry) => entry.testId === REHEARSAL_STUDENT_ID);
  if (!row) {
    checks.push(fail("verdict_ac_matches", "a scoreboard row for the rehearsal student", describe(scores.status, scores.body)));
    return { checks, failureReason: "找不到演練學生的成績單" };
  }

  const results = (typeof row.puzzleResults === "string" ? JSON.parse(row.puzzleResults) : row.puzzleResults) as
    Record<string, { subtasks?: Array<{ visible?: Array<{ status?: string }>; hidden?: Array<{ status?: string }> }> }> | null;

  const verdicts = (puzzleId: string): string[] =>
    (results?.[puzzleId]?.subtasks ?? []).flatMap((subtask) => [
      ...(subtask.visible ?? []).map((testCase) => String(testCase.status)),
      ...(subtask.hidden ?? []).map((testCase) => String(testCase.status)),
    ]);

  const acVerdicts = verdicts(REHEARSAL_PUZZLE_AC);
  checks.push(acVerdicts.length > 0 && acVerdicts.every((status) => status === "AC")
    ? { id: "verdict_ac_matches", status: "passed", expected: `all AC (worth ${REHEARSAL_PUZZLE_SCORE})`, attribution: "submission" }
    : { id: "verdict_ac_matches", status: "failed", expected: "all AC", observed: truncateJudgerOutput(`實際判定：${acVerdicts.join(", ") || "無"}`), attribution: "submission" });

  const waVerdicts = verdicts(REHEARSAL_PUZZLE_WA);
  checks.push(waVerdicts.length > 0 && waVerdicts.some((status) => status === "WA")
    ? { id: "verdict_wa_matches", status: "passed", expected: "at least one WA, attributed to the submission", attribution: "submission" }
    : { id: "verdict_wa_matches", status: "failed", expected: "at least one WA", observed: truncateJudgerOutput(`實際判定：${waVerdicts.join(", ") || "無"}`), attribution: "submission" });

  const failed = checks.filter((check) => check.status === "failed");
  return { checks, ...(failed.length ? { failureReason: failed.map((c) => c.id).join(", ") } : {}) };
}

/** Stage 6 — the global reset, and proof that it left nothing behind. */
export async function runCleanupStage(context: StageContext): Promise<StageResult> {
  const checks: RehearsalCheck[] = [];

  /* The reset endpoint demands its confirmation string. The rehearsal sends it
   * for the same reason the operator's own confirmation exists: this call is
   * the one that erases the machine. */
  const reset = await context.transport({ method: "POST", path: "/admin/init/reset", body: { confirm: "RESET" }, admin: true });
  if (reset.status !== 200) {
    checks.push(fail("phase_is_uninitialized", "200 OK from reset", describe(reset.status, reset.body)));
    return { checks, failureReason: "全域 reset 失敗" };
  }

  const phase = await context.transport({ method: "GET", path: "/admin/exam-state", admin: true });
  const state = (phase.body as { state?: string } | null)?.state;
  checks.push(state === "UNINITIALIZED"
    ? pass("phase_is_uninitialized", "state = UNINITIALIZED")
    : fail("phase_is_uninitialized", "state = UNINITIALIZED", describe(phase.status, phase.body)));

  const status = await context.transport({ method: "GET", path: "/admin/init/init-status", admin: true });
  const initStatus = status.body as { initializedUserCount?: number } | null;
  checks.push(initStatus?.initializedUserCount === 0
    ? pass("users_zero", "initializedUserCount = 0")
    : fail("users_zero", "initializedUserCount = 0", describe(status.status, status.body)));

  /* The global reset does not touch `exam_config`, so the rehearsal has to put
   * back what it overwrote. Restoring the saved value rather than writing a
   * default keeps the operator's measured judging settings, which live in the
   * same object. */
  const prior = await RehearsalRepository.readPriorConfig();
  if (prior !== undefined && prior !== null) {
    await SystemSettingsService.saveExamConfig(prior);
  }

  const config = await context.transport({ method: "GET", path: "/admin/config", admin: true });
  const configBody = config.body as { accessibleUsers?: Array<{ id?: string }>; sections?: Array<{ id?: string }> } | null;
  const residue =
    (configBody?.accessibleUsers ?? []).some((user) => user.id === REHEARSAL_STUDENT_ID) ||
    (configBody?.sections ?? []).some((section) => section.id === REHEARSAL_SECTION_ID);
  if (residue) {
    checks.push(fail("config_absent", "the rehearsal paper is gone", describe(config.status, config.body)));
  } else {
    checks.push(pass("config_absent", "the rehearsal paper is gone"));
    await RehearsalRepository.forgetPriorConfig();
  }

  const devices = await context.transport({ method: "GET", path: "/admin/connection/devices", admin: true });
  const deviceCount = Array.isArray(devices.body) ? devices.body.length : Number.NaN;
  checks.push(deviceCount === 0
    ? pass("devices_zero", "no devices remain")
    : fail("devices_zero", "no devices remain", describe(devices.status, devices.body)));

  const submitted = await context.transport({ method: "GET", path: "/admin/submissions/students", admin: true });
  const submittedCount = Array.isArray(submitted.body) ? submitted.body.length : Number.NaN;
  checks.push(submittedCount === 0
    ? pass("submissions_zero", "no submissions remain")
    : fail("submissions_zero", "no submissions remain", describe(submitted.status, submitted.body)));

  const failed = checks.filter((check) => check.status === "failed");
  return { checks, ...(failed.length ? { failureReason: failed.map((c) => c.id).join(", ") } : {}) };
}
