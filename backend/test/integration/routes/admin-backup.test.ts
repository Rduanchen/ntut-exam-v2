import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../../../src/app";
import { BackupFailure, DatabaseBackupService } from "../../../src/services/database-backup.service";
import { createBackupDatabaseFixture, type BackupDatabaseFixture } from "../../fixtures/backup-database.fixture";

const fixtures: BackupDatabaseFixture[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

describe("GET /admin/backup", () => {
  it("refuses download when the server uses a known default administrator token", async () => {
    const original = process.env.ADMIN_TOKEN;
    try {
      for (const token of [undefined, "admin", "admin-secret"]) {
        if (token === undefined) delete process.env.ADMIN_TOKEN;
        else process.env.ADMIN_TOKEN = token;
        const response = await request(createApp()).get("/admin/backup").set("x-admin-token", token ?? "admin-secret");
        expect(response.status).toBe(503);
        expect(response.body.code).toBe("BACKUP_UNAVAILABLE");
        expect(response.headers["content-disposition"]).toBeUndefined();
      }
    } finally {
      process.env.ADMIN_TOKEN = original;
    }
  });

  it("returns safe 503 and 500 JSON without attachment headers", async () => {
    const app = createApp();
    const token = process.env.ADMIN_TOKEN ?? "test-admin-token";
    const spy = vi.spyOn(DatabaseBackupService, "create");
    for (const [error, status, code] of [
      [new BackupFailure("BACKUP_UNAVAILABLE"), 503, "BACKUP_UNAVAILABLE"],
      [new Error("/private/exam.sqlite token-secret"), 500, "BACKUP_FAILED"]
    ] as const) {
      spy.mockRejectedValueOnce(error);
      const response = await request(app).get("/admin/backup").set("x-admin-token", token);
      expect(response.status).toBe(status);
      expect(response.body.code).toBe(code);
      expect(response.headers["content-disposition"]).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain("/private/exam.sqlite");
      expect(JSON.stringify(response.body)).not.toContain("token-secret");
    }
  });

  it("can succeed on retry after a failed backup", async () => {
    const source = await createBackupDatabaseFixture();
    fixtures.push(source);
    await source.insert("retry-route");
    const realCreate = DatabaseBackupService.create.bind(DatabaseBackupService);
    const spy = vi.spyOn(DatabaseBackupService, "create");
    spy.mockRejectedValueOnce(new BackupFailure("BACKUP_FAILED"));
    spy.mockImplementation(() => realCreate(source.storage));
    const app = createApp();
    const token = process.env.ADMIN_TOKEN ?? "test-admin-token";
    expect((await request(app).get("/admin/backup").set("x-admin-token", token)).status).toBe(500);
    expect((await request(app).get("/admin/backup").set("x-admin-token", token)).status).toBe(200);
  });

  it("cleans a snapshot when its response stream fails", async () => {
    let cleaned = false;
    vi.spyOn(DatabaseBackupService, "create").mockResolvedValue({
      path: "/missing/exam-backup.sqlite",
      byteLength: 123,
      cleanup: async () => { cleaned = true; }
    });
    try {
      await request(createApp()).get("/admin/backup").set("x-admin-token", process.env.ADMIN_TOKEN ?? "test-admin-token");
    } catch {
      // The server must abort a response whose stream fails after headers.
    }
    expect(cleaned).toBe(true);
  });

  it("rejects missing and invalid administrator credentials without backup bytes", async () => {
    const app = createApp();
    for (const headers of [{}, { Authorization: "Bearer wrong" }, { "x-admin-token": "wrong" }]) {
      const response = await request(app).get("/admin/backup").set(headers);
      expect(response.status).toBe(401);
      expect(response.headers["content-disposition"]).toBeUndefined();
      expect(response.text).not.toContain("SQLite format 3");
    }
  });

  it("accepts either existing administrator credential format", async () => {
    const source = await createBackupDatabaseFixture();
    fixtures.push(source);
    const realCreate = DatabaseBackupService.create.bind(DatabaseBackupService);
    vi.spyOn(DatabaseBackupService, "create").mockImplementation(() => realCreate(source.storage));
    const token = process.env.ADMIN_TOKEN ?? "test-admin-token";
    const app = createApp();
    for (const header of [{ Authorization: `Bearer ${token}` }, { "x-admin-token": token }]) {
      const response = await request(app).get("/admin/backup").set(header);
      expect(response.status).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(JSON.stringify(response.headers)).not.toContain(source.storage);
      expect(JSON.stringify(response.headers)).not.toContain(token);
    }
  });

  it("downloads raw SQLite bytes with attachment headers", async () => {
    const source = await createBackupDatabaseFixture();
    fixtures.push(source);
    await source.insert("downloaded");
    const realCreate = DatabaseBackupService.create.bind(DatabaseBackupService);
    vi.spyOn(DatabaseBackupService, "create").mockImplementation(() => realCreate(source.storage));
    const response = await request(createApp())
      .get("/admin/backup")
      .set("x-admin-token", process.env.ADMIN_TOKEN ?? "test-admin-token")
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
        res.on("error", callback);
      });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/vnd\.sqlite3/);
    expect(response.headers["content-disposition"]).toMatch(/attachment; filename="exam-backup-/);
    expect(Buffer.isBuffer(response.body)).toBe(true);
    expect((response.body as Buffer).subarray(0, 16).toString()).toBe("SQLite format 3\0");

    const dir = await mkdtemp(path.join(tmpdir(), "exam-backup-download-"));
    try {
      const file = path.join(dir, "download.sqlite");
      const { writeFile } = await import("node:fs/promises");
      await writeFile(file, response.body as Buffer);
      expect((await stat(file)).size).toBeGreaterThan(0);
      expect((await readFile(file)).subarray(0, 16).toString()).toBe("SQLite format 3\0");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
