import { Submission } from "../models/submission.model";
import logger from "../utils/logger.util";
import { IN_FLIGHT_STATUS } from "../types/submission.type";

/**
 * Repairs judging state left behind by a previous process.
 *
 * Two distinct jobs, both idempotent, both safe to run on every boot.
 */
export class JudgeStartupService {
  /**
   * Return submissions abandoned mid-judge to a re-judgeable state.
   *
   * `Judging` is the only transient status, so it is the only one an
   * interrupted run can strand. Without this a crash leaves submissions
   * permanently "being judged" by a process that no longer exists, and nothing
   * in the system ever revisits them.
   *
   * Re-judging is idempotent, which is why returning them to `Pending` is
   * preferable to persisting and resuming partial work.
   */
  static async recoverInterruptedJudging(): Promise<number> {
    const [count] = await Submission.update(
      { status: "Pending", autoScore: null },
      { where: { status: IN_FLIGHT_STATUS } },
    );

    if (count > 0) {
      logger.warn(
        `[JudgeStartup] Recovered ${count} submission(s) stranded in "${IN_FLIGHT_STATUS}" by an interrupted run; returned to "Pending".`,
      );
    }
    return count;
  }

  /**
   * Migrate rows written by an earlier version.
   *
   * The old `"Error"` status was written only when judging itself failed, so it
   * already meant what `"SystemError"` now means — it was simply named as though
   * the student owned the failure. Rows predating the rename are rewritten so
   * the scoring rules, which key on the new value, see them correctly.
   */
  static async normaliseLegacyStatuses(): Promise<number> {
    const [count] = await Submission.update(
      { status: "SystemError" },
      { where: { status: "Error" as never } },
    );

    if (count > 0) {
      logger.info(
        `[JudgeStartup] Migrated ${count} legacy "Error" submission(s) to "SystemError".`,
      );
    }
    return count;
  }

  /** Run every startup repair. Order does not matter; the sets are disjoint. */
  static async run(): Promise<{ recovered: number; migrated: number }> {
    const migrated = await JudgeStartupService.normaliseLegacyStatuses();
    const recovered = await JudgeStartupService.recoverInterruptedJudging();
    return { recovered, migrated };
  }
}
