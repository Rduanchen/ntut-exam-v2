import { Router, type Request, type Response, type NextFunction } from "express";
import { AdminBackupController } from "../../controllers/admin/admin-backup.controller";

const adminBackupRouter = Router();

function requireConfiguredAdminToken(_req: Request, res: Response, next: NextFunction): void {
  const token = process.env.ADMIN_TOKEN;
  if (!token || token === "admin" || token === "admin-secret") {
    res.status(503).json({ error: "Database backup temporarily unavailable", code: "BACKUP_UNAVAILABLE" });
    return;
  }
  next();
}

adminBackupRouter.get("/", requireConfiguredAdminToken, AdminBackupController.download);

export default adminBackupRouter;
