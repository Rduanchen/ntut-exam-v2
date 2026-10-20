import { afterEach, describe, expect, it, vi } from "vitest";
import sqlite3 from "sqlite3";
import { access, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseBackupService } from "../../../src/services/database-backup.service";
import { createBackupDatabaseFixture, type BackupDatabaseFixture } from "../../fixtures/backup-database.fixture";

const fixtures: BackupDatabaseFixture[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

async function fixture() {
  const result = await createBackupDatabaseFixture();
  fixtures.push(result);
  return result;
}

function readValues(storage: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(storage, sqlite3.OPEN_READONLY, (openError) => {
      if (openError) return reject(openError);
      db.all<{ value: string }>("SELECT value FROM backup_fixture ORDER BY id", (error, rows) => {
        db.close();
        if (error) reject(error);
        else resolve(rows.map((row) => row.value));
      });
    });
  });
}

describe("DatabaseBackupService", () => {
  it("creates a usable SQLite snapshot containing committed rows", async () => {
    const source = await fixture();
    await source.insert("before");
    const artifact = await DatabaseBackupService.create(source.storage);
    try {
      expect(artifact.byteLength).toBeGreaterThan(0);
      expect(await readValues(artifact.path)).toEqual(["before"]);
      expect(await source.values()).toEqual(["before"]);
    } finally {
      await artifact.cleanup();
    }
    await expect(access(artifact.path)).rejects.toThrow();
  });

  it("includes committed rows in the WAL without requiring a checkpoint", async () => {
    const source = await fixture();
    await source.enableWal();
    await source.insert("wal-row");
    const artifact = await DatabaseBackupService.create(source.storage);
    try {
      expect(await readValues(artifact.path)).toEqual(["wal-row"]);
    } finally {
      await artifact.cleanup();
    }
  });

  it("keeps simultaneous backup destinations separate and leaves source writable", async () => {
    const source = await fixture();
    await source.insert("first");
    const [a, b] = await Promise.all([
      DatabaseBackupService.create(source.storage),
      DatabaseBackupService.create(source.storage)
    ]);
    try {
      expect(a.path).not.toBe(b.path);
      await source.insert("after");
      expect(await readValues(a.path)).toEqual(["first"]);
      expect(await readValues(b.path)).toEqual(["first"]);
      expect(await source.values()).toEqual(["first", "after"]);
    } finally {
      await Promise.all([a.cleanup(), b.cleanup()]);
    }
  });

  it("rejects a missing source without creating it", async () => {
    const source = await fixture();
    const missing = path.join(source.directory, "missing.sqlite");
    await expect(DatabaseBackupService.create(missing)).rejects.toMatchObject({ code: "BACKUP_UNAVAILABLE" });
    await expect(access(missing)).rejects.toThrow();
  });

  it("rejects a corrupt source and removes its partial snapshot", async () => {
    const source = await fixture();
    const corrupt = path.join(source.directory, "corrupt.sqlite");
    await writeFile(corrupt, "not a database");
    await expect(DatabaseBackupService.create(corrupt, { tempRoot: source.directory }))
      .rejects.toMatchObject({ code: "BACKUP_FAILED" });
    expect((await readdir(source.directory)).filter((name) => name.startsWith("exam-backup-"))).toEqual([]);
  });

  it("honors cancellation before copying and permits a later retry", async () => {
    const source = await fixture();
    await source.insert("retry");
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(DatabaseBackupService.create(source.storage, { signal: cancelled.signal }))
      .rejects.toMatchObject({ code: "BACKUP_UNAVAILABLE" });
    const artifact = await DatabaseBackupService.create(source.storage);
    try {
      expect(await readValues(artifact.path)).toEqual(["retry"]);
    } finally {
      await artifact.cleanup();
    }
  });

  it("stops a backup at its deadline and removes temporary output", async () => {
    const source = await fixture();
    await source.insert("deadline");
    await expect(DatabaseBackupService.create(source.storage, { timeoutMs: 0, tempRoot: source.directory }))
      .rejects.toMatchObject({ code: "BACKUP_UNAVAILABLE" });
    expect((await readdir(source.directory)).filter((name) => name.startsWith("exam-backup-"))).toEqual([]);
    expect(await source.values()).toEqual(["deadline"]);
  });

  it("retries locked source reads only until the deadline", async () => {
    const source = await fixture();
    await source.insert("locked");
    await source.execute("BEGIN EXCLUSIVE");
    try {
      await expect(DatabaseBackupService.create(source.storage, { timeoutMs: 150, tempRoot: source.directory }))
        .rejects.toMatchObject({ code: "BACKUP_UNAVAILABLE" });
    } finally {
      await source.execute("ROLLBACK");
    }
    expect((await readdir(source.directory)).filter((name) => name.startsWith("exam-backup-"))).toEqual([]);
  });

  it("rejects unsupported in-memory, empty, and non-file sources", async () => {
    const source = await fixture();
    const empty = path.join(source.directory, "empty.sqlite");
    await writeFile(empty, "");
    for (const storage of [":memory:", empty, source.directory]) {
      await expect(DatabaseBackupService.create(storage)).rejects.toMatchObject({ code: "BACKUP_UNAVAILABLE" });
    }
  });

  it("copies databases larger than one step and makes cleanup idempotent", async () => {
    const source = await fixture();
    await source.execute("CREATE TABLE large_payload(data BLOB NOT NULL); INSERT INTO large_payload(data) VALUES (zeroblob(1048576))");
    const artifact = await DatabaseBackupService.create(source.storage);
    expect(artifact.byteLength).toBeGreaterThan(128 * 4096);
    await artifact.cleanup();
    await artifact.cleanup();
    await expect(access(artifact.path)).rejects.toThrow();
  });

  it("bounds concurrent backup work and hands slots to waiting requests", async () => {
    const source = await fixture();
    await source.insert("queued");
    const outcomes = await Promise.allSettled(Array.from({ length: 7 }, async () => {
      const artifact = await DatabaseBackupService.create(source.storage);
      try {
        expect(await readValues(artifact.path)).toEqual(["queued"]);
      } finally {
        await artifact.cleanup();
      }
    }));
    const successes = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const failures = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
    expect(successes).toHaveLength(6);
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toMatchObject({ code: "BACKUP_UNAVAILABLE" });
  });

  it("removes a queued request when its client cancels", async () => {
    const source = await fixture();
    await source.insert("queued-cancel");
    const first = DatabaseBackupService.create(source.storage);
    const second = DatabaseBackupService.create(source.storage);
    const cancellation = new AbortController();
    const waiting = DatabaseBackupService.create(source.storage, { signal: cancellation.signal });
    cancellation.abort();
    await expect(waiting).rejects.toMatchObject({ code: "BACKUP_UNAVAILABLE" });
    const artifacts = await Promise.all([first, second]);
    await Promise.all(artifacts.map((artifact) => artifact.cleanup()));
  });

  it("expires a queued request without affecting active backups", async () => {
    const source = await fixture();
    await source.insert("queue-timeout");
    const first = DatabaseBackupService.create(source.storage);
    const second = DatabaseBackupService.create(source.storage);
    const waiting = DatabaseBackupService.create(source.storage, { waitTimeoutMs: 0 });
    await expect(waiting).rejects.toMatchObject({ code: "BACKUP_UNAVAILABLE" });
    const artifacts = await Promise.all([first, second]);
    await Promise.all(artifacts.map((artifact) => artifact.cleanup()));
  });

  it("maps an unexpected native backup failure to a safe error and removes output", async () => {
    const source = await fixture();
    const original = sqlite3.Database.prototype.backup;
    vi.spyOn(sqlite3.Database.prototype, "backup").mockImplementationOnce(function (this: sqlite3.Database, destination, callback) {
      void destination;
      void callback;
      throw new Error("private sqlite path");
    });
    await expect(DatabaseBackupService.create(source.storage, { tempRoot: source.directory }))
      .rejects.toMatchObject({ code: "BACKUP_FAILED", message: "Database backup failed" });
    expect((await readdir(source.directory)).filter((name) => name.startsWith("exam-backup-"))).toEqual([]);
    expect(sqlite3.Database.prototype.backup).not.toBe(original);
  });
});
