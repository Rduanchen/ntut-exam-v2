import { SystemSettingsService } from "./system-settings.service";
import { User } from "../models/user.model";
import { createMessage, MessageType } from "./message.service";
import MessageSocketService from "../sockets/message-socket.service";
import { HttpError } from "../utils/http-error";
import logger from "../utils/logger.util";

/**
 * The global exam phase.
 *
 * Five values with disjoint meanings, replacing a four-value set in which
 * `NOT_STARTED` carried two of them — "initialised, registration open" and
 * "registration closed, login open". That conflation is why device
 * registration used to stay open until the exam itself began, which is exactly
 * the window students walk into the room during.
 */
export enum ExamState {
  UNINITIALIZED = "UNINITIALIZED",
  INITIALIZED = "INITIALIZED",
  SETUP_FINISHED = "SETUP_FINISHED",
  IN_PROGRESS = "IN_PROGRESS",
  FINISHED = "FINISHED"
}

/**
 * The single forward step permitted from each phase; `null` is terminal.
 *
 * Phases move one step at a time and never backwards. The one way back is
 * `resetToUninitialized`, which is not a transition and deliberately does not
 * consult this table.
 */
const NEXT_PHASE: Record<ExamState, ExamState | null> = {
  [ExamState.UNINITIALIZED]: ExamState.INITIALIZED,
  [ExamState.INITIALIZED]: ExamState.SETUP_FINISHED,
  [ExamState.SETUP_FINISHED]: ExamState.IN_PROGRESS,
  [ExamState.IN_PROGRESS]: ExamState.FINISHED,
  [ExamState.FINISHED]: null
};

const STATE_KEY = "exam_state";
const STATE_CHANGED_AT_KEY = "exam_state_changed_at";

/** Used when the exam config does not name a window of its own. */
export const DEFAULT_SUBMIT_GRACE_SECONDS = 60;

export class ExamStateService {
  /**
   * Get the current exam phase. Anything unreadable — absent, corrupt, or a
   * value this build does not know, such as the retired `NOT_STARTED` — reads
   * as UNINITIALIZED, which grants nothing.
   */
  static async getCurrentState(): Promise<ExamState> {
    try {
      const state = await SystemSettingsService.getSetting<string>(STATE_KEY);
      if (state && Object.values(ExamState).includes(state as ExamState)) {
        return state as ExamState;
      }
    } catch (error: any) {
      logger.warn(`Failed to retrieve exam_state: ${error.message}`);
    }
    return ExamState.UNINITIALIZED;
  }

  /** The phases an operator may move to from here — at most one. */
  static async getAllowedNext(): Promise<ExamState[]> {
    const next = NEXT_PHASE[await this.getCurrentState()];
    return next ? [next] : [];
  }

  /** When the phase last changed, or null if it has never been stamped. */
  static async getStateChangedAt(): Promise<Date | null> {
    try {
      const stamp = await SystemSettingsService.getSetting<string>(STATE_CHANGED_AT_KEY);
      if (!stamp) return null;
      const at = new Date(stamp);
      return Number.isNaN(at.getTime()) ? null : at;
    } catch (error: any) {
      logger.warn(`Failed to retrieve ${STATE_CHANGED_AT_KEY}: ${error.message}`);
      return null;
    }
  }

  /**
   * What is still missing before the exam may advance to `target`.
   *
   * Only INITIALIZED has entry conditions today: everything after it is the
   * operator judging that the room is ready, which no check can make for them.
   * Returning the list rather than a boolean is deliberate — an operator being
   * told "not yet" with no reason has to go looking.
   */
  static async getMissingPreconditions(target: ExamState): Promise<string[]> {
    if (target !== ExamState.INITIALIZED) return [];

    const missing: string[] = [];

    const config = await SystemSettingsService.getExamConfig();
    if (!config) missing.push("exam_config");

    if ((await User.count()) === 0) missing.push("students");

    /* Without these a machine could be handed a paper before there is a key to
     * lock it with, which is the one thing this phase exists to prevent. */
    if (!(await SystemSettingsService.getSetting("exam_key"))) missing.push("exam_key");
    if (!(await SystemSettingsService.getSetting("exam_config_meta"))) missing.push("exam_config_meta");
    if (!(await SystemSettingsService.getSetting("exam_config_cipher"))) missing.push("exam_config_cipher");

    return missing;
  }

  /**
   * Move the exam forward one phase.
   *
   * Rejects every other combination, same-phase included. The check lives here
   * rather than in the admin UI because the UI is not a boundary: an operator
   * with the admin token can call the endpoint directly.
   */
  static async changeState(newState: ExamState): Promise<void> {
    const currentState = await this.getCurrentState();
    const permitted = NEXT_PHASE[currentState];

    if (newState !== permitted) {
      throw new HttpError(
        400,
        `Invalid transition: ${currentState} → ${newState}`,
        "invalid_transition"
      );
    }

    const missing = await this.getMissingPreconditions(newState);
    if (missing.length > 0) {
      throw new HttpError(
        409,
        `Preconditions not met for ${newState}: ${missing.join(", ")}`,
        "preconditions_not_met"
      );
    }

    await this.persistState(newState);

    /* Registration is open for exactly one phase: INITIALIZED, when machines
     * are in the room and students are not. It used to stay open until the
     * exam itself began — which is the window students walk in during, and the
     * one where an unattended machine registering is hardest to notice. */
    if (newState === ExamState.INITIALIZED) {
      await SystemSettingsService.setAllowDeviceRegistration(true);
    }
    if (newState === ExamState.SETUP_FINISHED) {
      await SystemSettingsService.setAllowDeviceRegistration(false);
    }

    const msg = await createMessage(MessageType.EXAM, newState);
    MessageSocketService.sendStatusUpdateNotification(msg.id, newState);

    logger.info(`Exam state changed from ${currentState} to ${newState}`);
  }

  /**
   * Return to UNINITIALIZED.
   *
   * The one channel that may move the phase backwards, reachable from any
   * phase including the terminal one. It is kept separate from `changeState`
   * so that "wipe everything and start over" can never be reached by an
   * ordinary transition, and so callers cannot confuse the two.
   */
  static async resetToUninitialized(): Promise<void> {
    const currentState = await this.getCurrentState();

    await this.persistState(ExamState.UNINITIALIZED);
    await SystemSettingsService.setAllowDeviceRegistration(false);

    logger.info(`Exam state reset from ${currentState} to ${ExamState.UNINITIALIZED}`);
  }

  /** How long submissions stay accepted after the exam is declared finished. */
  static async getSubmitGraceSeconds(): Promise<number> {
    try {
      const config = await SystemSettingsService.getExamConfig();
      const seconds = (config as any)?.submitGraceSeconds;
      if (typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0) {
        return seconds;
      }
    } catch (error: any) {
      logger.warn(`Failed to read submitGraceSeconds: ${error.message}`);
    }
    return DEFAULT_SUBMIT_GRACE_SECONDS;
  }

  /**
   * Whether a submission arriving now is still inside the collection window.
   *
   * A FINISHED phase with no timestamp reads as closed. Erring the other way
   * would leave submissions accepted for the rest of the deployment's life.
   */
  static async isWithinSubmitGrace(): Promise<boolean> {
    if (await this.getCurrentState() !== ExamState.FINISHED) return false;

    const finishedAt = await this.getStateChangedAt();
    if (!finishedAt) return false;

    const windowMs = (await this.getSubmitGraceSeconds()) * 1000;
    return Date.now() - finishedAt.getTime() <= windowMs;
  }

  private static async persistState(state: ExamState): Promise<void> {
    try {
      await this.upsert(STATE_KEY, state);
      await this.upsert(STATE_CHANGED_AT_KEY, new Date().toISOString());
    } catch (error: any) {
      logger.error(`Failed to update exam_state to ${state}:`, error);
      throw error;
    }
  }

  private static async upsert(key: string, value: string): Promise<void> {
    const existing = await SystemSettingsService.getSetting<string>(key);
    if (existing !== null) {
      await SystemSettingsService.updateSetting(key, value);
    } else {
      await SystemSettingsService.createSetting(key, value);
    }
  }
}
