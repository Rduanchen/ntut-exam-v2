import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminBackupController } from "../../../src/controllers/admin/admin-backup.controller";
import { DatabaseBackupService } from "../../../src/services/database-backup.service";

afterEach(() => vi.restoreAllMocks());

function requestAndResponse(headersSent: boolean) {
  const request = new EventEmitter() as Request;
  const response = Object.assign(new EventEmitter(), {
    headersSent,
    writableEnded: false,
    destroy: vi.fn()
  }) as unknown as Response;
  return { request, response };
}

describe("AdminBackupController transfer edges", () => {
  it("cleans a snapshot when the client cancels before transmission", async () => {
    const { request, response } = requestAndResponse(false);
    const cleanup = vi.fn(async () => undefined);
    vi.spyOn(DatabaseBackupService, "create").mockImplementation(async () => {
      request.emit("aborted");
      return { path: "/private/snapshot.sqlite", byteLength: 100, cleanup };
    });
    await AdminBackupController.download(request, response);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(response.destroy).not.toHaveBeenCalled();
  });

  it("terminates an already committed response on a transfer error", async () => {
    const { request, response } = requestAndResponse(true);
    vi.spyOn(DatabaseBackupService, "create").mockRejectedValue(new Error("transfer failed"));
    await AdminBackupController.download(request, response);
    expect(response.destroy).toHaveBeenCalledOnce();
  });
});
