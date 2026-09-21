import { randomUUID } from "node:crypto";
import { User } from "../models/user.model";
import { SystemSettingsService } from "./system-settings.service";
import { ExamState, ExamStateService } from "./exam-state.service";
import { JudgingWorkCoordinator, type WorkLease } from "./judging-work-coordinator";
import { RehearsalRepository } from "./rehearsal-repository";
import { rehearsalStartInputSchema } from "../schemas/rehearsal.schema";
import { REHEARSAL_DEADLINE_MS, REHEARSAL_STAGES } from "../config/rehearsal.config";
import { loopbackTransport, SimulatedStudent, type RehearsalTransport } from "./rehearsal-client";
import {
  runAdmitStage,
  runCleanupStage,
  runEnrolStage,
  runGradeStage,
  runPaperStage,
  runSubmitStage,
  type StageContext,
  type StageResult,
} from "./rehearsal-stages";
import { truncateJudgerOutput } from "../utils/judger-output.util";
import logger from "../utils/logger.util";
import {
  isTerminalRehearsalState,
  type RehearsalBlockReason,
  type RehearsalDescriptor,
  type RehearsalEnvelope,
  type RehearsalRun,
  type RehearsalStage,
  type RehearsalStageId,
} from "../types/rehearsal.type";

/** Refusal to start. Carries the reason, so the operator is told, not just denied. */
export class RehearsalAdmissionError extends Error {
  constructor(public readonly status: 400 | 409, public readonly reason: string) {
    super(reason);
  }
}

interface Dependencies {
  now: () => number;
  examState: () => Promise<ExamState>;
  transport: RehearsalTransport;
  /** Waiting between polls. Stubbed in tests to keep them fast. */
  sleep: (ms: number) => Promise<void>;
  /* Stage deadlines use their own timer rather than `sleep`, so that stubbing
   * out polling delays in a test does not also fire every stage's timeout. */
  schedule: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  cancel: (handle: ReturnType<typeof setTimeout>) => void;
}

const defaults: Dependencies = {
  now: Date.now,
  examState: () => ExamStateService.getCurrentState(),
  transport: loopbackTransport,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => clearTimeout(handle),
};

/** The five stages that build the exam up; `cleanup` is handled separately. */
const BUILD_STAGES: ReadonlyArray<[RehearsalStageId, (context: StageContext) => Promise<StageResult>]> = [
  ["paper", runPaperStage],
  ["enrol", runEnrolStage],
  ["admit", runAdmitStage],
  ["submit", runSubmitStage],
  ["grade", runGradeStage],
];

export class RehearsalService {
  private static dependencies: Dependencies = defaults;
  private static inFlight = new Set<Promise<void>>();

  static configureForTests(overrides: Partial<Dependencies>): void {
    this.dependencies = { ...this.dependencies, ...overrides };
  }

  static reset(): void {
    this.dependencies = defaults;
  }

  /** Resolve once every started rehearsal has finished. */
  static async settle(): Promise<void> {
    while (this.inFlight.size) await Promise.allSettled([...this.inFlight]);
  }

  /**
   * Whether the stored configuration is somebody's real exam paper.
   *
   * A fresh deployment is never without an `exam_config` row — `initDatabase`
   * seeds a default — so "has a config" cannot tell a clean machine from a
   * prepared one. Content can: the default carries no roster and no sections,
   * and a paper that could actually be sat must carry both.
   *
   * Erring towards refusal is deliberate. A rehearsal that starts on a prepared
   * machine overwrites the paper and then erases it — a larger harm than the
   * one this feature exists to prevent.
   */
  private static async hasRealPaper(): Promise<boolean> {
    const config = await SystemSettingsService.getExamConfig();
    if (!config) return false;
    const users = Array.isArray(config.accessibleUsers) ? config.accessibleUsers.length : 0;
    const sections = Array.isArray(config.sections) ? config.sections.length : 0;
    return users > 0 || sections > 0;
  }

  private static async blockedReason(): Promise<RehearsalBlockReason | undefined> {
    const latest = await RehearsalRepository.read();

    /* A rehearsal that could not erase itself blocks every later one. Starting
     * a fresh one on top would hide the residue rather than clear it, and the
     * operator would go on to upload a real paper onto a dirty machine. */
    if (latest && isTerminalRehearsalState(latest.state) && !latest.cleanupCompleted) return "cleanup_pending";
    if (latest && !isTerminalRehearsalState(latest.state)) return "rehearsal_active";
    if (JudgingWorkCoordinator.hasRehearsalWork()) return "rehearsal_active";
    if (JudgingWorkCoordinator.hasDeployWork()) return "deploy_test_active";
    if (JudgingWorkCoordinator.isDraining()) return "deploy_test_draining";
    if (JudgingWorkCoordinator.hasStudentWork()) return "student_judging_active";

    if (await this.dependencies.examState() !== ExamState.UNINITIALIZED) return "exam_initialized";
    if (await User.count() > 0) return "exam_data_present";
    if (await this.hasRealPaper()) return "exam_data_present";
    return undefined;
  }

  static async descriptor(): Promise<RehearsalDescriptor> {
    const blockedReason = await this.blockedReason();
    return {
      canStart: !blockedReason,
      ...(blockedReason ? { blockedReason } : {}),
      deadlineMs: REHEARSAL_DEADLINE_MS,
      stages: REHEARSAL_STAGES.map((stage) => ({ ...stage })),
      pendingCleanup: blockedReason === "cleanup_pending",
    };
  }

  static async latest(): Promise<RehearsalEnvelope> {
    return { run: await RehearsalRepository.read() };
  }

  static async get(runId: string): Promise<RehearsalEnvelope | null> {
    const run = await RehearsalRepository.read();
    return run?.id === runId ? { run } : null;
  }

  private static blankStages(): RehearsalStage[] {
    return REHEARSAL_STAGES.map((stage) => ({
      id: stage.id,
      status: "pending",
      timeoutMs: stage.timeoutMs,
      checks: [],
    }));
  }

  /**
   * Start a rehearsal, or refuse.
   *
   * Every refusal path returns before anything is written. A caller told "no"
   * must find the machine exactly as they left it — that promise is the whole
   * of US5, and it is cheapest to keep by doing all the checking first.
   */
  static async start(input: unknown): Promise<RehearsalEnvelope> {
    const parsed = rehearsalStartInputSchema.safeParse(input);
    if (!parsed.success) throw new RehearsalAdmissionError(400, "acknowledge_required");

    const latest = await RehearsalRepository.read();
    /* A second press while one is running is what a TA who saw no feedback
     * actually does. Hand back the run in flight rather than calling it an error. */
    if (latest && !isTerminalRehearsalState(latest.state)) return { run: latest, alreadyRunning: true };

    const blocked = await this.blockedReason();
    if (blocked) throw new RehearsalAdmissionError(409, blocked);

    const admission = JudgingWorkCoordinator.acquireRehearsal();
    if (!admission.lease) throw new RehearsalAdmissionError(409, admission.reason ?? "rehearsal_active");

    const now = this.dependencies.now();
    const run: RehearsalRun = {
      id: randomUUID(),
      state: "queued",
      stages: this.blankStages(),
      /* Written true before the first mutating request leaves this process.
       * Startup recovery reads it as proof that whatever exam data exists was
       * put there by this rehearsal — which is what lets it wipe on boot.
       * Moving this line after the first request would make that wipe unsafe. */
      ownsSystemState: true,
      cleanupCompleted: false,
      startedAt: now,
      deadlineMs: REHEARSAL_DEADLINE_MS,
      errors: [],
    };
    await RehearsalRepository.replace(run);
    /* Saved before the paper stage overwrites it, in the same "claim ownership
     * first" spirit as `ownsSystemState`: the cleanup that has to put it back
     * may be running in a different process. */
    await RehearsalRepository.rememberPriorConfig(await SystemSettingsService.getExamConfig());

    const accepted = structuredClone(run);
    const task = this.execute(run, admission.lease);
    this.inFlight.add(task);
    void task.finally(() => this.inFlight.delete(task));

    return { run: accepted };
  }

  private static stage(run: RehearsalRun, id: RehearsalStageId): RehearsalStage {
    const stage = run.stages.find((candidate) => candidate.id === id);
    /* Unreachable: the run schema requires all six stages, in order, and
     * refuses to persist anything else. Kept so that a future stage added to
     * the union but not to the blank-stage list fails loudly instead of being
     * silently skipped. */
    /* v8 ignore next */
    if (!stage) throw new Error(`Rehearsal run is missing stage "${id}"`);
    return stage;
  }

  /**
   * Run one stage under its own timeout.
   *
   * The timeout races the stage rather than cancelling it: an HTTP request
   * already in flight cannot be recalled, and a stage that has overrun has
   * already told us what we needed to know.
   */
  private static async runStage(
    run: RehearsalRun,
    id: RehearsalStageId,
    step: (context: StageContext) => Promise<StageResult>,
    context: Omit<StageContext, "expired" | "timeoutMs">,
  ): Promise<boolean> {
    const stage = this.stage(run, id);
    const startedAt = this.dependencies.now();
    stage.status = "running";
    stage.startedAt = startedAt;
    run.currentStage = id;
    await this.save(run);

    const deadlineAt = startedAt + stage.timeoutMs;
    const expired = () => this.dependencies.now() >= deadlineAt;

    let result: StageResult;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<StageResult>((resolve) => {
        timer = this.dependencies.schedule(
          () => resolve({ checks: [], failureReason: `段落逾時（上限 ${stage.timeoutMs}ms）` }),
          stage.timeoutMs,
        );
      });
      result = await Promise.race([step({ ...context, expired, timeoutMs: stage.timeoutMs }), timeout]);
    } catch (error) {
      result = {
        checks: [],
        failureReason: truncateJudgerOutput(error instanceof Error ? error.message : String(error)),
      };
    } finally {
      if (timer) this.dependencies.cancel(timer);
    }

    stage.checks = result.checks;
    stage.finishedAt = this.dependencies.now();
    stage.durationMs = Math.max(0, stage.finishedAt - startedAt);
    const failed = result.failureReason !== undefined || result.checks.some((check) => check.status === "failed");
    stage.status = failed ? "failed" : "passed";
    if (result.failureReason) stage.failureReason = truncateJudgerOutput(result.failureReason);
    await this.save(run);

    return !failed;
  }

  private static async save(run: RehearsalRun): Promise<void> {
    await RehearsalRepository.replace(run);
  }

  /**
   * Walk the stages, then clean up — always.
   *
   * Cleanup runs whether the build stages passed, failed or overran. The one
   * exception is a paper stage that failed before changing anything, where
   * there is nothing to erase and a reset would only be noise.
   */
  private static async execute(run: RehearsalRun, lease: WorkLease): Promise<void> {
    const student = new SimulatedStudent(this.dependencies.transport);
    const context: Omit<StageContext, "expired" | "timeoutMs"> = {
      transport: this.dependencies.transport,
      student,
      state: {},
      now: this.dependencies.now,
      sleep: this.dependencies.sleep,
    };

    const deadlineAt = run.startedAt + run.deadlineMs;
    let deadlineExceeded = false;
    let mutated = false;

    try {
      run.state = "running";
      await this.save(run);

      for (const [id, step] of BUILD_STAGES) {
        if (this.dependencies.now() >= deadlineAt) {
          deadlineExceeded = true;
          break;
        }
        const ok = await this.runStage(run, id, step, context);
        /* The paper stage is the only one that can fail without having touched
         * anything — and only if its very first request failed. */
        if (id === "paper") mutated = this.stage(run, "paper").checks.some((check) => check.id === "config_uploaded" && check.status === "passed");
        else mutated = true;
        if (!ok) break;
      }

      for (const [id] of BUILD_STAGES) {
        const stage = this.stage(run, id);
        if (stage.status === "pending") stage.status = "skipped";
      }

      const cleanup = this.stage(run, "cleanup");
      if (!mutated) {
        cleanup.status = "skipped";
        /* Nothing was written, so there is nothing to erase and the machine is
         * already clean — the next rehearsal must not be blocked. */
        run.cleanupCompleted = true;
      } else {
        const cleaned = await this.runStage(run, "cleanup", runCleanupStage, context);
        run.cleanupCompleted = cleaned;
        if (!cleaned) run.cleanupError = cleanup.failureReason ?? "清除未完成";
      }

      run.currentStage = undefined;
      run.state = deadlineExceeded ? "interrupted" : "completed";
      if (deadlineExceeded) run.interruptionReason = "deadline_exceeded";
      const anyFailed = run.stages.some((stage) => stage.status === "failed");
      run.overallOutcome = deadlineExceeded ? "interrupted" : anyFailed || !run.cleanupCompleted ? "failed" : "passed";
      run.finishedAt = this.dependencies.now();
      await this.save(run);
    } catch (error) {
      /* Reserved for the orchestration itself breaking. A stage that fails is
       * a completed rehearsal with a failing report; this is a rehearsal with
       * no trustworthy report at all. */
      const message = truncateJudgerOutput(error instanceof Error ? error.message : String(error));
      logger.error(`rehearsal orchestration failed: ${message}`);
      run.state = "failed";
      run.overallOutcome = "failed";
      run.currentStage = undefined;
      run.finishedAt = this.dependencies.now();
      run.errors.push(message);
      await this.save(run).catch(() => undefined);
    } finally {
      lease.release();
    }
  }
}
