import { Request, Response, NextFunction } from "express";
import { User } from "../../models/user.model";
import { DeviceKeyMap } from "../../models/device-key-map.model";
import { ExamStateService, ExamState } from "../../services/exam-state.service";

/**
 * Is the room ready to start?
 *
 * Deliberately a different question from "which devices exist", which
 * `GET /admin/device` already answers. Readiness is not stored anywhere: it is
 * derived from the global phase and what each machine has achieved, so it
 * cannot drift from the thing it describes.
 *
 * The fourth condition — that the machine reported a passing environment check
 * — is the one that used to be invisible. The check ran on the machine and its
 * verdict stayed there, so an invigilator could see that a student had logged
 * in but not whether that seat could compile anything.
 */
export class AdminReadinessController {
  static async getReadiness(req: Request, res: Response, next: NextFunction) {
    try {
      const phase = await ExamStateService.getCurrentState();

      const users = await User.findAll({
        include: [{ model: DeviceKeyMap, as: "device" }],
        order: [["testId", "ASC"]]
      });

      const students = users.map((user) => {
        const device = user.device;
        const failed = device?.envCheckFailedLanguages;

        return {
          testId: user.testId,
          name: user.name,
          ipAddress: user.ipAddress ?? device?.ipAddress ?? null,
          deviceUuid: user.deviceUuid,
          isRegistered: !!device,
          isOnline: device?.isOnline ?? false,
          isLoggedIn: !!user.deviceUuid,
          envCheckStatus: device?.envCheckStatus ?? "UNKNOWN",
          envCheckFailedLanguages: failed ? safeParseList(failed) : [],
          envCheckReportedAt: device?.envCheckReportedAt ?? null,
          lastDisconnectedAt: device?.lastDisconnectedAt ?? null,
          ready:
            !!user.deviceUuid &&
            (device?.isOnline ?? false) &&
            device?.envCheckStatus === "PASSED"
        };
      });

      res.status(200).json({
        phase,
        /* Only meaningful while students are settling in. Reported so the
         * console can say "waiting for the room" rather than showing a
         * readiness count during an exam that already started. */
        isSettlingPhase: phase === ExamState.SETUP_FINISHED,
        summary: {
          total: students.length,
          ready: students.filter((s) => s.ready).length,
          loggedIn: students.filter((s) => s.isLoggedIn).length,
          registered: students.filter((s) => s.isRegistered).length,
          environmentFailed: students.filter((s) => s.envCheckStatus === "FAILED").length
        },
        students
      });
    } catch (error) {
      next(error);
    }
  }
}

/** Stored as JSON text; a malformed value must not take the whole page down. */
function safeParseList(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export default AdminReadinessController;
