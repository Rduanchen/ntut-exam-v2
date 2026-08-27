/**
 * Judging settings: where each effective value comes from, and why that matters.
 *
 * The incident that produced this module was caused by a limit nobody knew
 * existed — the compile allowance defaulted silently inside a dependency, and
 * under load it started converting healthy submissions into compilation errors.
 * The lesson is not "pick a better default"; it is that a value capable of
 * changing a verdict must be attributable. Hence `origin` on every setting: it
 * distinguishes "10 seconds because someone measured" from "10 seconds because
 * nobody chose".
 */

export interface JudgeSettings {
  /** Compile-stage wall-clock allowance, milliseconds. */
  compileTimeout: number;
  /** Compile-stage memory allowance, bytes. -1 means unrestricted. */
  compileMemoryLimit: number;
  /** Ceiling on executions in flight against the execution backend. */
  maxConcurrentJobs: number;
  /** Retries permitted for a system-attributed verdict. */
  maxSystemRetries: number;
}

export type SettingOrigin = "config" | "env" | "default" | "clamped";

export interface EffectiveSetting<T> {
  value: T;
  origin: SettingOrigin;
}

export type EffectiveJudgeSettings = {
  [K in keyof JudgeSettings]: EffectiveSetting<JudgeSettings[K]>;
};

/**
 * Defaults.
 *
 * `compileTimeout` is deliberately three times the judging library's own 10s
 * default. On a machine already running the application, its database and the
 * operating system, 10s is reachable by an ordinary C++ translation unit under
 * load — that is exactly how the incident happened.
 *
 * `maxConcurrentJobs` is deliberately far below the measured cliff. A sweep on
 * an idle 12-core machine put the failure boundary between 20 and 30; a real
 * exam machine has less headroom than that, and an operator raising a
 * conservative default after measuring is a better failure mode than an
 * operator discovering a generous one mid-exam.
 */
export const JUDGE_DEFAULTS: Readonly<JudgeSettings> = Object.freeze({
  compileTimeout: 30000,
  compileMemoryLimit: -1,
  maxConcurrentJobs: 4,
  maxSystemRetries: 2,
});

/**
 * Valid ranges.
 *
 * The failure being guarded against is a zero or negative ceiling being read as
 * "no limit", which would silently restore the unbounded behaviour this feature
 * removes while the configuration claims a limit is in force.
 */
export const JUDGE_BOUNDS: Readonly<
  Record<keyof JudgeSettings, { min: number; max: number }>
> = Object.freeze({
  compileTimeout: { min: 1000, max: 300000 },
  compileMemoryLimit: { min: -1, max: 8 * 1024 * 1024 * 1024 },
  maxConcurrentJobs: { min: 1, max: 64 },
  maxSystemRetries: { min: 0, max: 10 },
});

const ENV_KEYS: Readonly<Record<keyof JudgeSettings, string>> = Object.freeze({
  compileTimeout: "JUDGE_COMPILE_TIMEOUT_MS",
  compileMemoryLimit: "JUDGE_COMPILE_MEMORY_LIMIT",
  maxConcurrentJobs: "JUDGE_MAX_CONCURRENT_JOBS",
  maxSystemRetries: "JUDGE_MAX_SYSTEM_RETRIES",
});

const readEnv = (key: keyof JudgeSettings): number | undefined => {
  const raw = process.env[ENV_KEYS[key]];
  if (raw === undefined || raw.trim() === "") return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const clamp = (key: keyof JudgeSettings, value: number): number => {
  const { min, max } = JUDGE_BOUNDS[key];
  if (!Number.isFinite(value)) return JUDGE_DEFAULTS[key];
  // compileMemoryLimit uses -1 as a sentinel for "unrestricted"; anything
  // between the sentinel and the real minimum is meaningless, so it snaps back.
  if (key === "compileMemoryLimit" && value === -1) return -1;
  return Math.min(Math.max(Math.round(value), min), max);
};

const resolveOne = <K extends keyof JudgeSettings>(
  key: K,
  stored: Partial<JudgeSettings> | null | undefined,
): EffectiveSetting<number> => {
  const fromConfig = stored?.[key];
  const raw =
    fromConfig !== undefined && fromConfig !== null
      ? { value: fromConfig, origin: "config" as SettingOrigin }
      : (() => {
          const env = readEnv(key);
          return env !== undefined
            ? { value: env, origin: "env" as SettingOrigin }
            : { value: JUDGE_DEFAULTS[key], origin: "default" as SettingOrigin };
        })();

  const clamped = clamp(key, raw.value);
  return clamped === raw.value
    ? { value: clamped, origin: raw.origin }
    : { value: clamped, origin: "clamped" };
};

/**
 * Resolve the effective settings.
 *
 * Precedence: stored configuration → environment → default.
 *
 * The environment is a **first-run seed only**. Once an exam configuration is
 * stored, its judging settings always carry values (the schema supplies
 * defaults for absent fields), so the environment stops applying. Letting the
 * environment override stored configuration would produce "I changed it in the
 * interface and nothing happened", which is worse than either rule alone.
 *
 * This is also what makes a configuration upload a *replacement*: an omitted
 * field arrives as its schema default, not as the previous value.
 */
export function resolveJudgeSettings(
  stored?: Partial<JudgeSettings> | null,
): EffectiveJudgeSettings {
  return {
    compileTimeout: resolveOne("compileTimeout", stored),
    compileMemoryLimit: resolveOne("compileMemoryLimit", stored),
    maxConcurrentJobs: resolveOne("maxConcurrentJobs", stored),
    maxSystemRetries: resolveOne("maxSystemRetries", stored),
  };
}

/** Strip provenance, for callers that only need the values. */
export function valuesOf(effective: EffectiveJudgeSettings): JudgeSettings {
  return {
    compileTimeout: effective.compileTimeout.value,
    compileMemoryLimit: effective.compileMemoryLimit.value,
    maxConcurrentJobs: effective.maxConcurrentJobs.value,
    maxSystemRetries: effective.maxSystemRetries.value,
  };
}
