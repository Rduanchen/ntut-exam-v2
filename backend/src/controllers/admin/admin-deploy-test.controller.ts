import type { Request, Response } from "express";
import { ZodError } from "zod";
import { DeployTestAdmissionError, DeployTestService } from "../../services/deploy-test.service";
import logger from "../../utils/logger.util";

export class AdminDeployTestController {
  static async profile(_req: Request, res: Response): Promise<void> {
    res.status(200).json(await DeployTestService.descriptor());
  }

  static async start(req: Request, res: Response): Promise<void> {
    try {
      const envelope = await DeployTestService.start(req.body);
      res.status(envelope.alreadyRunning ? 200 : 202).json(envelope);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: "Invalid deployment test profile", issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) });
        return;
      }
      if (error instanceof DeployTestAdmissionError) {
        res.status(error.status).json({ error: error.reason, reason: error.reason });
        return;
      }
      logger.error(`deploy test start failed: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

  static async latest(_req: Request, res: Response): Promise<void> {
    res.status(200).json(await DeployTestService.latest());
  }

  static async status(req: Request, res: Response): Promise<void> {
    const envelope = await DeployTestService.get(req.params.runId);
    if (!envelope) { res.status(404).json({ error: "Not Found: unknown deployment test" }); return; }
    res.status(200).json(envelope);
  }
}
