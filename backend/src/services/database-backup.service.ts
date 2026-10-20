import sqlite3 from "sqlite3";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { databaseStorage } from "../config/database.config";
import type { SqliteBackupHandle } from "../types/sqlite-backup.type";

export type BackupFailureCode = "BACKUP_UNAVAILABLE" | "BACKUP_FAILED";

export class BackupFailure extends Error {
  constructor(readonly code: BackupFailureCode) {
    super(code === "BACKUP_UNAVAILABLE" ? "Database backup temporarily unavailable" : "Database backup failed");
  }
}

export interface BackupArtifact {
  path: string;
  byteLength: number;
  cleanup(): Promise<void>;
}

export interface BackupOptions {
  signal?: AbortSignal;
  /** Test fixture override; production uses the OS private temporary directory. */
  tempRoot?: string;
  timeoutMs?: number;
  /** Override for bounded queue tests; production waits at most five seconds. */
  waitTimeoutMs?: number;
}

const MAX_ACTIVE_BACKUPS = 2;
const MAX_WAITING_BACKUPS = 4;
const WAIT_TIMEOUT_MS = 5_000;
const BACKUP_TIMEOUT_MS = 30_000;

interface BackupWaiter {
  resolve(release: () => void): void;
  reject(error: BackupFailure): void;
  timeout: NodeJS.Timeout;
  signal?: AbortSignal;
  abort(): void;
}

function openDatabase(storage: string, flags: number): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(storage, flags, (error) => {
      if (error) reject(error);
      else resolve(db);
    });
  });
}

function closeDatabase(db: sqlite3.Database): Promise<void> {
  return new Promise((resolve, reject) => {
    db.close((error) => error ? reject(error) : resolve());
  });
}

function initializeBackup(db: sqlite3.Database, destination: string): Promise<SqliteBackupHandle> {
  return new Promise((resolve, reject) => {
    const handle = db.backup(destination, (error) => {
      if (error) reject(error);
      else resolve(handle);
    });
  });
}

function stepBackup(handle: SqliteBackupHandle): Promise<boolean> {
  return new Promise((resolve, reject) => {
    handle.step(128, (error, completed) => error ? reject(error) : resolve(completed));
  });
}

async function verifySnapshot(storage: string): Promise<void> {
  const db = await openDatabase(storage, sqlite3.OPEN_READONLY);
  try {
    const row = await new Promise<{ quick_check: string }>((resolve, reject) => {
      db.get<{ quick_check: string }>("PRAGMA quick_check", (error, value) => {
        if (error) reject(error);
        else resolve(value);
      });
    });
    if (row?.quick_check !== "ok") throw new BackupFailure("BACKUP_FAILED");
  } finally {
    await closeDatabase(db);
  }
}

export class DatabaseBackupService {
  private static active = 0;
  private static waiters: BackupWaiter[] = [];

  private static release(): void {
    const next = this.waiters.shift();
    if (next) {
      clearTimeout(next.timeout);
      next.signal?.removeEventListener("abort", next.abort);
      next.resolve(() => this.release());
    } else {
      this.active -= 1;
    }
  }

  private static acquire(signal?: AbortSignal, waitTimeoutMs: number = WAIT_TIMEOUT_MS): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(new BackupFailure("BACKUP_UNAVAILABLE"));
    if (this.active < MAX_ACTIVE_BACKUPS) {
      this.active += 1;
      return Promise.resolve(() => this.release());
    }
    if (this.waiters.length >= MAX_WAITING_BACKUPS) {
      return Promise.reject(new BackupFailure("BACKUP_UNAVAILABLE"));
    }
    return new Promise((resolve, reject) => {
      const remove = (waiter: BackupWaiter) => {
        this.waiters = this.waiters.filter((candidate) => candidate !== waiter);
        clearTimeout(waiter.timeout);
        signal?.removeEventListener("abort", waiter.abort);
        reject(new BackupFailure("BACKUP_UNAVAILABLE"));
      };
      const waiter: BackupWaiter = {
        resolve, reject,
        signal,
        timeout: setTimeout(() => remove(waiter), waitTimeoutMs),
        abort: () => remove(waiter)
      };
      this.waiters.push(waiter);
      signal?.addEventListener("abort", waiter.abort, { once: true });
    });
  }

  static async create(storage: string = databaseStorage, options: BackupOptions = {}): Promise<BackupArtifact> {
    const release = await this.acquire(options.signal, options.waitTimeoutMs);
    try {
      const artifact = await this.createSnapshot(storage, options);
      let released = false;
      return {
        ...artifact,
        cleanup: async () => {
          if (released) return;
          released = true;
          try {
            await artifact.cleanup();
          } finally {
            release();
          }
        }
      };
    } catch (error) {
      release();
      throw error;
    }
  }

  private static async createSnapshot(storage: string, options: BackupOptions): Promise<BackupArtifact> {
    const checkCancelled = () => {
      if (options.signal?.aborted) throw new BackupFailure("BACKUP_UNAVAILABLE");
    };
    checkCancelled();
    if (storage === ":memory:") throw new BackupFailure("BACKUP_UNAVAILABLE");
    try {
      const source = await stat(storage);
      if (!source.isFile() || source.size === 0) throw new BackupFailure("BACKUP_UNAVAILABLE");
    } catch {
      throw new BackupFailure("BACKUP_UNAVAILABLE");
    }

    const directory = await mkdtemp(path.join(options.tempRoot ?? tmpdir(), "exam-backup-"));
    const destination = path.join(directory, "snapshot.sqlite");
    let sourceDb: sqlite3.Database | undefined;
    let handle: SqliteBackupHandle | undefined;
    const deadline = Date.now() + (options.timeoutMs ?? BACKUP_TIMEOUT_MS);
    try {
      checkCancelled();
      sourceDb = await openDatabase(storage, sqlite3.OPEN_READONLY);
      sourceDb.configure("busyTimeout", 100);
      handle = await initializeBackup(sourceDb, destination);
      while (!handle.completed) {
        checkCancelled();
        if (Date.now() >= deadline) throw new BackupFailure("BACKUP_UNAVAILABLE");
        let completed: boolean;
        try {
          completed = await stepBackup(handle);
        } catch (error) {
          const code = (error as { code?: unknown }).code;
          if ((code === "SQLITE_BUSY" || code === "SQLITE_LOCKED") && Date.now() < deadline) {
            await new Promise<void>((resolve) => setTimeout(resolve, 25));
            continue;
          }
          throw new BackupFailure(code === "SQLITE_BUSY" || code === "SQLITE_LOCKED" ? "BACKUP_UNAVAILABLE" : "BACKUP_FAILED");
        }
        if (completed) break;
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      if (!handle.completed || handle.failed) throw new BackupFailure("BACKUP_FAILED");
      checkCancelled();
      await closeDatabase(sourceDb);
      sourceDb = undefined;

      const { size } = await stat(destination);
      if (size === 0) throw new BackupFailure("BACKUP_FAILED");
      await verifySnapshot(destination);
      checkCancelled();

      let cleaned = false;
      return {
        path: destination,
        byteLength: size,
        cleanup: async () => {
          if (cleaned) return;
          cleaned = true;
          await rm(directory, { recursive: true, force: true });
        }
      };
    } catch (error) {
      const unfinished = handle;
      if (unfinished && !unfinished.completed && !unfinished.failed) {
        await new Promise<void>((resolve) => unfinished.finish(() => resolve()));
      }
      if (sourceDb) await closeDatabase(sourceDb).catch(() => undefined);
      await rm(directory, { recursive: true, force: true });
      if (error instanceof BackupFailure) throw error;
      const sqliteCode = (error as { code?: unknown }).code;
      const sourceUnavailable = sqliteCode === "SQLITE_CANTOPEN" || sqliteCode === "SQLITE_PERM" || sqliteCode === "SQLITE_READONLY";
      throw new BackupFailure(sourceUnavailable ? "BACKUP_UNAVAILABLE" : "BACKUP_FAILED");
    }
  }
}
