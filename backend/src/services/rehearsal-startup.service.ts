import { InitService } from "./init.service";
import { RehearsalRepository } from "./rehearsal-repository";
import { SystemSettingsService } from "./system-settings.service";
import { isTerminalRehearsalState } from "../types/rehearsal.type";
import { truncateJudgerOutput } from "../utils/judger-output.util";
import logger from "../utils/logger.util";

/**
 * Finish what a killed process started.
 *
 * A rehearsal that dies mid-run leaves the machine holding half an exam: a
 * roster, a device, submissions, and a phase somewhere past UNINITIALIZED. An
 * operator meeting that on the next boot cannot tell it from a real exam being
 * prepared, and the deploy-test precedent — mark it interrupted and stop —
 * would leave exactly that.
 *
 * So this wipes, on boot, without asking. That is safe for one reason and one
 * reason only: `ownsSystemState` is written to the run record BEFORE the
 * rehearsal's first mutating request. A non-terminal run carrying it is proof
 * that every row in the exam tables was put there by the rehearsal. If that
 * write order is ever moved, this becomes a boot-time wipe of somebody's real
 * exam.
 */
export class RehearsalStartupService {
  static async run(now = Date.now()): Promise<void> {
    const latest = await RehearsalRepository.read();
    if (!latest || isTerminalRehearsalState(latest.state)) return;

    logger.warn(`Rehearsal ${latest.id} was interrupted by a process restart; cleaning up.`);

    let cleanupCompleted = false;
    let cleanupError: string | undefined;
    if (latest.ownsSystemState) {
      try {
        await InitService.wipeAllData();
        /* The reset leaves `exam_config` alone, so the rehearsal paper would
         * otherwise survive the crash and block every later rehearsal as
         * `exam_data_present`. */
        const prior = await RehearsalRepository.readPriorConfig();
        if (prior !== undefined && prior !== null) await SystemSettingsService.saveExamConfig(prior);
        await RehearsalRepository.forgetPriorConfig();
        cleanupCompleted = true;
      } catch (error) {
        cleanupError = truncateJudgerOutput(error instanceof Error ? error.message : String(error));
        logger.error(`Rehearsal cleanup after restart failed: ${cleanupError}`);
      }
    } else {
      /* Never touched anything, so there is nothing to erase — and nothing to
       * block the next rehearsal with. */
      cleanupCompleted = true;
    }

    await RehearsalRepository.replace({
      ...latest,
      state: "interrupted",
      overallOutcome: "interrupted",
      interruptionReason: "process_restart",
      currentStage: undefined,
      stages: latest.stages.map((stage) =>
        stage.status === "running" || stage.status === "pending"
          ? { ...stage, status: stage.status === "running" ? "failed" : "skipped" }
          : stage,
      ),
      cleanupCompleted,
      ...(cleanupError ? { cleanupError } : {}),
      finishedAt: now,
      errors: [...latest.errors, truncateJudgerOutput("Rehearsal interrupted by process restart")],
    });
  }
}
