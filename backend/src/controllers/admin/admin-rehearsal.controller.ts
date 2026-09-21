import type { Request, Response } from "express";
import { RehearsalAdmissionError, RehearsalService } from "../../services/rehearsal.service";
import logger from "../../utils/logger.util";

export class AdminRehearsalController {
  /** What the operator may do right now, and why not if not. */
  static async profile(_req: Request, res: Response): Promise<void> {
    res.status(200).json(await RehearsalService.descriptor());
  }

  static async start(req: Request, res: Response): Promise<void> {
    try {
      const envelope = await RehearsalService.start(req.body);
      /* 200 for a rehearsal already in flight, 202 for one just accepted. A
       * repeated press is not an error — it is what someone does when the page
       * has not visibly changed yet. */
      res.status(envelope.alreadyRunning ? 200 : 202).json(envelope);
    } catch (error) {
      if (error instanceof RehearsalAdmissionError) {
        res.status(error.status).json({ error: error.reason, reason: error.reason });
        return;
      }
      logger.error(`rehearsal start failed: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  /** The most recent rehearsal. Outlives the cleanup it reports on. */
  static async latest(_req: Request, res: Response): Promise<void> {
    res.status(200).json(await RehearsalService.latest());
  }

  static async status(req: Request, res: Response): Promise<void> {
    const envelope = await RehearsalService.get(req.params.runId);
    if (!envelope) {
      res.status(404).json({ error: "Not Found: unknown rehearsal" });
      return;
    }
    res.status(200).json(envelope);
  }
}
