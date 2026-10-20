import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sqlite3 from "sqlite3";

export interface BackupDatabaseFixture {
  storage: string;
  directory: string;
  db: sqlite3.Database;
  execute(sql: string): Promise<void>;
  insert(value: string): Promise<void>;
  values(): Promise<string[]>;
  enableWal(): Promise<void>;
  close(): Promise<void>;
  cleanup(): Promise<void>;
}

export async function createBackupDatabaseFixture(): Promise<BackupDatabaseFixture> {
  const directory = await mkdtemp(path.join(tmpdir(), "exam-backup-test-"));
  const storage = path.join(directory, "source.sqlite");
  const db = await new Promise<sqlite3.Database>((resolve, reject) => {
    const connection = new sqlite3.Database(storage, (error) => {
      if (error) reject(error);
      else resolve(connection);
    });
  });

  const execute = (sql: string) => new Promise<void>((resolve, reject) => {
    db.exec(sql, (error) => error ? reject(error) : resolve());
  });
  const insert = (value: string) => new Promise<void>((resolve, reject) => {
    db.run("INSERT INTO backup_fixture(value) VALUES (?)", value, (error) => error ? reject(error) : resolve());
  });
  const values = () => new Promise<string[]>((resolve, reject) => {
    db.all<{ value: string }>("SELECT value FROM backup_fixture ORDER BY id", (error, rows) => {
      if (error) reject(error);
      else resolve(rows.map((row) => row.value));
    });
  });
  const close = () => new Promise<void>((resolve, reject) => {
    db.close((error) => error ? reject(error) : resolve());
  });

  await execute("CREATE TABLE backup_fixture(id INTEGER PRIMARY KEY, value TEXT NOT NULL)");
  return {
    storage, directory, db, execute, insert, values,
    enableWal: () => execute("PRAGMA journal_mode=WAL"),
    close,
    cleanup: async () => {
      await close();
      await rm(directory, { recursive: true, force: true });
    }
  };
}
