import { randomUUID } from "node:crypto";
import { FaultAttribution, StatusCode, pistonJudger, type PistonJudger } from "piston-judger";
import { defaultDeployTestProfile, DEPLOY_TEST_BOUNDS } from "../config/deploy-test.config";
import { SMOKE_PROBES, VERDICT_PROBES, resolveRuntime, type DeployTestProbeDefinition } from "../config/deploy-test-probes.config";
import { applyJudgeSettings, getExecutionCeiling, peakInFlightCount, resetPeakInFlight } from "./judge-limiter";
import { deploymentTestProfileSchema } from "../schemas/deploy-test.schema";
import type { DeployTestAttempt, DeploymentTestProfile, DeploymentTestRun, ProbeResult, ProfileDescriptor, RunEnvelope, RuntimeSnapshot } from "../types/deploy-test.type";
import { isTerminalDeployTestState } from "../types/deploy-test.type";
import { truncateJudgerOutput } from "../utils/judger-output.util";
import { checkPistonServer, type PistonHealth } from "../constants/piston.config";
import { ExamState, ExamStateService } from "./exam-state.service";
import { SystemSettingsService } from "./system-settings.service";
import { DeployTestRepository } from "./deploy-test-repository";
import { JudgeExecutionService } from "./judge-execution.service";
import { JudgingWorkCoordinator, type WorkLease } from "./judging-work-coordinator";
import { distributeJobs, summarizeConcurrency } from "./deploy-test-metrics";

export class DeployTestAdmissionError extends Error {
  constructor(public readonly status: 409 | 503, public readonly reason: string) { super(reason); }
}

interface Dependencies {
  now: () => number;
  health: () => Promise<PistonHealth>;
  examState: () => Promise<ExamState>;
  client: () => PistonJudger;
  schedule: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  cancel: (handle: ReturnType<typeof setTimeout>) => void;
}

const defaults: Dependencies = {
  now: Date.now,
  health: checkPistonServer,
  examState: () => ExamStateService.getCurrentState(),
  client: () => pistonJudger({ server: process.env.PISTON_URL || "http://localhost:2000" }),
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => clearTimeout(handle),
};

interface RunContext {
  run: DeploymentTestRun;
  lease: WorkLease;
  frozen: boolean;
  deadlineAt: number;
  finalizeActiveWork?: () => void;
}

export class DeployTestService {
  private static dependencies: Dependencies = defaults;
  private static inFlight = new Set<Promise<void>>();

  static configureForTests(overrides: Partial<Dependencies>): void {
    this.dependencies = { ...this.dependencies, ...overrides };
  }

  static reset(): void { this.dependencies = defaults; }
  static async settle(): Promise<void> {
    while (this.inFlight.size) await Promise.allSettled([...this.inFlight]);
  }

  static async descriptor(): Promise<ProfileDescriptor> {
    const activeCeiling = getExecutionCeiling();
    const examActive = await this.dependencies.examState() === ExamState.IN_PROGRESS;
    let blockedReason: ProfileDescriptor["blockedReason"];
    if (examActive) blockedReason = "exam_in_progress";
    else if (JudgingWorkCoordinator.hasStudentWork()) blockedReason = "student_judging_active";
    else if (JudgingWorkCoordinator.hasDeployWork()) blockedReason = "deploy_test_active";
    else if (JudgingWorkCoordinator.isDraining()) blockedReason = "deploy_test_draining";
    return { defaults: defaultDeployTestProfile(activeCeiling), bounds: DEPLOY_TEST_BOUNDS, activeCeiling, canStart: !blockedReason, blockedReason };
  }

  static async latest(): Promise<RunEnvelope> {
    return { run: await DeployTestRepository.read(), draining: JudgingWorkCoordinator.isDraining() };
  }

  static async get(runId: string): Promise<RunEnvelope | null> {
    const run = await DeployTestRepository.read();
    return run?.id === runId ? { run, draining: JudgingWorkCoordinator.isDraining() } : null;
  }

  static async start(input: unknown): Promise<RunEnvelope> {
    const profile = deploymentTestProfileSchema.parse(input) as DeploymentTestProfile;
    const latest = await DeployTestRepository.read();
    if (latest && !isTerminalDeployTestState(latest.state)) return { run: latest, draining: JudgingWorkCoordinator.isDraining(), alreadyRunning: true };
    if (await this.dependencies.examState() === ExamState.IN_PROGRESS) throw new DeployTestAdmissionError(409, "exam_in_progress");

    const health = await this.dependencies.health();
    if (!health.reachable) throw new DeployTestAdmissionError(503, "piston_unreachable");

    const admission = JudgingWorkCoordinator.acquireDeploy();
    if (!admission.lease) {
      const active = await DeployTestRepository.read();
      if (admission.reason === "deploy_test_active" && active && !isTerminalDeployTestState(active.state)) {
        return { run: active, draining: false, alreadyRunning: true };
      }
      throw new DeployTestAdmissionError(409, admission.reason ?? "deploy_test_active");
    }
    if (await this.dependencies.examState() === ExamState.IN_PROGRESS) {
      admission.lease.release();
      throw new DeployTestAdmissionError(409, "exam_in_progress");
    }

    const now = this.dependencies.now();
    const config = await SystemSettingsService.getExamConfig();
    const effective = applyJudgeSettings(config?.judgerSettings);
    const run: DeploymentTestRun = {
      id: randomUUID(), state: "queued", profile, settings: {
        ...effective,
        runTimeLimit: config?.judgerSettings?.timeLimit ?? 10_000,
        runMemoryLimit: config?.judgerSettings?.memoryLimit ?? 256 * 1024 * 1024,
      }, activeCeiling: getExecutionCeiling(), runtimes: [],
      progress: { phase: "readiness", completed: 0, total: this.totalWork(profile), updatedAt: now },
      probes: [], concurrencyResults: [], errors: [], startedAt: now,
    };
    await DeployTestRepository.replace(run);
    const acceptedRun = structuredClone(run);
    const context: RunContext = { run, lease: admission.lease, frozen: false, deadlineAt: now + profile.deadlineMs };
    const task = this.executeWithDeadline(context, health);
    this.inFlight.add(task);
    void task.finally(() => this.inFlight.delete(task));
    return { run: acceptedRun, draining: false };
  }

  private static totalWork(profile: DeploymentTestProfile): number {
    let total = 0;
    if (profile.phases.includes("smoke")) total += profile.languages.length;
    if (profile.phases.includes("verdict")) total += VERDICT_PROBES.length + 1;
    if (profile.phases.includes("concurrency")) total += profile.jobCount;
    return total;
  }

  private static async save(context: RunContext): Promise<void> {
    if (!context.frozen) await DeployTestRepository.replace(context.run);
  }

  private static async executeWithDeadline(context: RunContext, health: PistonHealth): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<"deadline">((resolve) => {
      timer = this.dependencies.schedule(() => resolve("deadline"), Math.max(0, context.deadlineAt - this.dependencies.now()));
    });
    const flow = this.runFlow(context, health).then(() => "flow" as const).catch(async (error: unknown) => {
      if (!context.frozen) {
        context.run.state = "failed";
        context.run.overallOutcome = "failed";
        context.run.finishedAt = this.dependencies.now();
        context.run.errors.push(truncateJudgerOutput(error instanceof Error ? error.message : String(error)));
        await this.save(context);
      }
      return "flow" as const;
    });
    const winner = await Promise.race([flow, deadline]);
    if (winner === "deadline") {
      if (timer) this.dependencies.cancel(timer);
      context.finalizeActiveWork?.();
      context.frozen = true;
      context.run.state = "interrupted";
      context.run.overallOutcome = "interrupted";
      context.run.interruptionReason = "deadline_exceeded";
      context.run.finishedAt = this.dependencies.now();
      context.run.errors.push("Deployment test deadline exceeded; admitted executions are draining.");
      await DeployTestRepository.replace(context.run);
      JudgingWorkCoordinator.beginDraining(context.lease);
      await flow;
      JudgingWorkCoordinator.endDraining();
    } else {
      if (timer) this.dependencies.cancel(timer);
      context.lease.release();
    }
  }

  private static async interrupted(context: RunContext): Promise<boolean> {
    if (context.frozen) return true;
    if (await this.dependencies.examState() === ExamState.IN_PROGRESS) {
      context.run.state = "interrupted";
      context.run.overallOutcome = "interrupted";
      context.run.interruptionReason = "exam_started";
      context.run.finishedAt = this.dependencies.now();
      context.finalizeActiveWork?.();
      await this.save(context);
      context.frozen = true;
      return true;
    }
    return false;
  }

  private static runtimeSnapshots(profile: DeploymentTestProfile, health: PistonHealth): RuntimeSnapshot[] {
    const checkedAt = this.dependencies.now();
    return profile.languages.map((semanticLanguage) => {
      const runtime = resolveRuntime(semanticLanguage, health.runtimes);
      return { semanticLanguage, available: Boolean(runtime), language: runtime?.language, version: runtime?.version, aliases: runtime?.aliases ?? [], checkedAt };
    });
  }

  private static async runFlow(context: RunContext, health: PistonHealth): Promise<void> {
    context.run.state = "running";
    context.run.runtimes = this.runtimeSnapshots(context.run.profile, health);
    await this.save(context);
    const client = this.dependencies.client();
    const execution = new JudgeExecutionService(client, this.dependencies.now);

    if (context.run.profile.phases.includes("smoke")) {
      context.run.progress.phase = "smoke";
      for (const probe of SMOKE_PROBES.filter((p) => context.run.profile.languages.includes(p.language))) {
        if (await this.interrupted(context)) return;
        await this.runProbe(context, execution, probe);
      }
    }
    if (context.run.profile.phases.includes("verdict")) {
      context.run.progress.phase = "verdict";
      for (const probe of VERDICT_PROBES) {
        if (await this.interrupted(context)) return;
        await this.runProbe(context, execution, probe);
      }
      if (!await this.interrupted(context)) {
        context.run.progress.phase = "post-check";
        await this.runProbe(context, execution, { ...SMOKE_PROBES[0], id: "post-ole-health", phase: "verdict" });
      }
    }
    if (context.run.profile.phases.includes("concurrency") && !await this.interrupted(context)) {
      await this.runConcurrency(context, execution);
    }
    if (context.frozen || isTerminalDeployTestState(context.run.state)) return;
    context.run.progress.phase = "finalizing";
    const failed = context.run.probes.some((probe) => probe.status === "failed") || context.run.concurrencyResults.some((result) => result.infrastructureFailures > 0 || result.missing > 0);
    const blocked = context.run.probes.some((probe) => probe.status === "blocked");
    const warned = context.run.concurrencyResults.some((result) => result.warnings.length > 0);
    context.run.state = "completed";
    context.run.overallOutcome = failed ? "failed" : blocked || warned ? "warning" : "passed";
    context.run.finishedAt = this.dependencies.now();
    await this.save(context);
  }

  private static async runProbe(context: RunContext, execution: JudgeExecutionService, probe: DeployTestProbeDefinition): Promise<void> {
    const runtime = context.run.runtimes.find((item) => item.semanticLanguage === probe.language && item.available);
    let result: ProbeResult;
    if (!runtime?.language || !runtime.version) {
      result = { probeId: probe.id, phase: probe.phase, semanticLanguage: probe.language, scenario: probe.scenario, expectedStatus: probe.expectedStatus, expectedAttribution: probe.expectedAttribution, status: "blocked", attempts: [], diagnostic: `Required runtime unavailable: ${probe.language}` };
    } else {
      const outcome = await execution.executeAndJudge({
        language: runtime.language, code: probe.code,
        execute: { ...probe.limits, version: runtime.version, stdin: probe.stdin, compile_timeout: probe.limits.compile_timeout ?? context.run.settings.compileTimeout.value, compile_memory_limit: context.run.settings.compileMemoryLimit.value },
        judge: { expectedOutput: probe.expectedOutput, memoryLimit: probe.judgeMemoryLimit ?? probe.limits.run_memory_limit, compareMode: "strict" },
        maxSystemRetries: context.run.settings.maxSystemRetries.value,
        interrupted: () => context.frozen,
      });
      const systemAttempt = outcome.attempts.some((attempt) => attempt.attribution === FaultAttribution.SYSTEM);
      const matches = outcome.verdict.status === probe.expectedStatus && outcome.verdict.attribution === probe.expectedAttribution && !systemAttempt;
      result = {
        probeId: probe.id, phase: probe.phase, semanticLanguage: probe.language, scenario: probe.scenario,
        expectedStatus: probe.expectedStatus, expectedAttribution: probe.expectedAttribution,
        observedStatus: outcome.verdict.status, observedAttribution: outcome.verdict.attribution,
        runtime: { language: runtime.language, version: runtime.version }, status: matches ? "passed" : "failed",
        attempts: outcome.attempts,
        diagnostic: truncateJudgerOutput(outcome.verdict.message || outcome.verdict.actualOutput),
      };
    }
    context.run.probes.push(result);
    context.run.progress.completed += 1;
    context.run.progress.updatedAt = this.dependencies.now();
    await this.save(context);
  }

  private static async runConcurrency(context: RunContext, execution: JudgeExecutionService): Promise<void> {
    context.run.progress.phase = "concurrency";
    const allocations = distributeJobs(context.run.profile.jobCount, context.run.profile.concurrencyLevels);
    const runtime = context.run.runtimes.find((item) => item.semanticLanguage === "c" && item.available);
    for (let levelIndex = 0; levelIndex < context.run.profile.concurrencyLevels.length; levelIndex += 1) {
      if (await this.interrupted(context)) return;
      const submittedConcurrency = context.run.profile.concurrencyLevels[levelIndex];
      const requested = allocations[levelIndex];
      const attempts: DeployTestAttempt[] = [];
      const errors: string[] = [];
      let infrastructureFailures = 0;
      let interrupted = 0;
      let settled = 0;
      const startedAt = this.dependencies.now();
      resetPeakInFlight();
      let next = 0;
      const resultIndex = context.run.concurrencyResults.length;
      const refreshResult = (interruptedJobs: number) => {
        context.run.concurrencyResults[resultIndex] = summarizeConcurrency({
          submittedConcurrency,
          activeCeiling: context.run.activeCeiling,
          observedPeak: peakInFlightCount(),
          requested,
          attempts,
          expectedFailures: 0,
          infrastructureFailures,
          interrupted: interruptedJobs,
          durationMs: this.dependencies.now() - startedAt,
          errors,
        });
      };
      context.finalizeActiveWork = () => refreshResult(Math.max(0, requested - settled));
      const worker = async () => {
        for (;;) {
          if (await this.interrupted(context)) { interrupted += Math.max(0, requested - next); next = requested; return; }
          const index = next++;
          if (index >= requested) return;
          if (!runtime?.language || !runtime.version) { errors.push("C runtime unavailable"); continue; }
          try {
            const outcome = await execution.executeAndJudge({ language: runtime.language, code: SMOKE_PROBES[0].code, execute: { ...SMOKE_PROBES[0].limits, stdin: SMOKE_PROBES[0].stdin, version: runtime.version }, judge: { expectedOutput: SMOKE_PROBES[0].expectedOutput, compareMode: "strict" }, maxSystemRetries: context.run.settings.maxSystemRetries.value, interrupted: () => context.frozen });
            attempts.push(outcome.attempts[outcome.attempts.length - 1]);
            if (outcome.verdict.status !== StatusCode.AC || outcome.verdict.attribution === FaultAttribution.SYSTEM) infrastructureFailures += 1;
          } catch (error) {
            infrastructureFailures += 1;
            errors.push(`job ${index}: ${error instanceof Error ? error.message : String(error)}`);
          }
          settled += 1;
          context.run.progress.completed += 1;
          context.run.progress.updatedAt = this.dependencies.now();
        }
      };
      await Promise.all(Array.from({ length: Math.min(submittedConcurrency, requested) }, worker));
      refreshResult(interrupted);
      context.finalizeActiveWork = undefined;
      await this.save(context);
    }
  }
}
