import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Request, Response } from "express";
import { BackupFailure, DatabaseBackupService } from "../../services/database-backup.service";

function downloadName(): string {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `exam-backup-${timestamp}.sqlite`;
}

export class AdminBackupController {
  static async download(req: Request, res: Response): Promise<void> {
    const cancellation = new AbortController();
    const onAborted = () => cancellation.abort();
    const onClosed = () => { if (!res.writableEnded) cancellation.abort(); };
    req.once("aborted", onAborted);
    res.once("close", onClosed);
    try {
      const artifact = await DatabaseBackupService.create(undefined, { signal: cancellation.signal });
      try {
        if (cancellation.signal.aborted) return;
        res.setHeader("Cache-Control", "no-store");
        res.attachment(downloadName());
        res.setHeader("Content-Type", "application/vnd.sqlite3");
        res.setHeader("Content-Length", artifact.byteLength);
        await pipeline(createReadStream(artifact.path), res);
      } finally {
        await artifact.cleanup();
      }
    } catch (error) {
      if (cancellation.signal.aborted) return;
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.removeHeader("Content-Disposition");
      res.removeHeader("Content-Length");
      res.removeHeader("Content-Type");
      const unavailable = error instanceof BackupFailure && error.code === "BACKUP_UNAVAILABLE";
      res.status(unavailable ? 503 : 500).json({
        error: unavailable ? "Database backup temporarily unavailable" : "Database backup failed",
        code: unavailable ? "BACKUP_UNAVAILABLE" : "BACKUP_FAILED"
      });
    } finally {
      req.removeListener("aborted", onAborted);
      res.removeListener("close", onClosed);
    }
  }
}
