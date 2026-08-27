import { FaultAttribution, StatusCode } from "piston-judger";
import type { JudgeResult } from "piston-judger";

/**
 * Verdicts as the judging library now produces them, built by attribution.
 *
 * The point of these fixtures is that attribution and status are set together
 * and consistently. The defect this feature fixes was a caller inferring
 * "whose fault" from a status code; a test that hand-rolls half a verdict can
 * accidentally reproduce that inference and pass for the wrong reason.
 */

const baseStage = (over: Partial<Record<string, unknown>> = {}) => ({
  code: 0,
  signal: null,
  status: null,
  message: null,
  memory: 0,
  cpu_time: 1,
  wall_time: 2,
  stdout: "",
  stderr: "",
  output: "",
  ...over,
});

const details = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    attribution: FaultAttribution.SUBMISSION,
    stage: "run",
    run: baseStage(),
    ...over,
  }) as JudgeResult["details"];

/** Accepted. */
export const accepted = (stdout = "42\n"): JudgeResult => ({
  status: StatusCode.AC,
  attribution: FaultAttribution.SUBMISSION,
  message: "Accepted",
  actualOutput: stdout,
  details: details({ run: baseStage({ stdout }) }),
});

/** Wrong answer — the student's failure. */
export const wrongAnswer = (stdout = "41\n"): JudgeResult => ({
  status: StatusCode.WA,
  attribution: FaultAttribution.SUBMISSION,
  message: "Wrong Answer",
  actualOutput: stdout,
  details: details({ run: baseStage({ stdout }) }),
});

/** A real compiler diagnostic — the student's failure, and NOT retryable. */
export const compileError = (): JudgeResult => ({
  status: StatusCode.CE,
  attribution: FaultAttribution.SUBMISSION,
  message: "Compilation Error: 'Missing' undeclared",
  actualOutput: "",
  details: details({
    stage: "compile",
    compile: baseStage({ code: 1, status: "RE", stderr: "'Missing' undeclared" }),
  }),
});

/**
 * THE INCIDENT: the compile stage was killed on its allowance.
 *
 * Indistinguishable from a pathological submission in a single result, so the
 * library attributes it to the system and leaves retry policy to us.
 */
export const compileTimedOut = (): JudgeResult => ({
  status: StatusCode.CTLE,
  attribution: FaultAttribution.SYSTEM,
  message: "Compile Time Limit Exceeded",
  actualOutput: "",
  details: details({
    attribution: FaultAttribution.SYSTEM,
    stage: "compile",
    compile: baseStage({
      code: null,
      signal: "SIGKILL",
      status: "TO",
      message: "Time limit exceeded (wall clock)",
      wall_time: 10217,
    }),
  }),
});

/** The backend was unreachable — the system's failure. */
export const backendUnreachable = (): JudgeResult => ({
  status: StatusCode.SE,
  attribution: FaultAttribution.SYSTEM,
  message: "System Error: connect ECONNREFUSED",
  actualOutput: "",
  details: {
    attribution: FaultAttribution.SYSTEM,
    stage: "none",
    error: { kind: "transport", message: "connect ECONNREFUSED" },
  } as JudgeResult["details"],
});

/** The shape `execute()` returns on success; contents are irrelevant to judging. */
export const executionOk = () => ({
  ok: true as const,
  result: {
    language: "c",
    version: "10.2.0",
    run: baseStage(),
    limits: {
      compile_timeout: 30000,
      run_timeout: 3000,
      compile_cpu_time: 10000,
      run_cpu_time: 3000,
      compile_memory_limit: -1,
      run_memory_limit: -1,
    },
  },
});

/** The shape `execute()` returns when it could not reach the backend. */
export const executionFailed = () => ({
  ok: false as const,
  error: { kind: "transport" as const, message: "connect ECONNREFUSED" },
});
