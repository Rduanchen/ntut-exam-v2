/** The installed sqlite3 runtime exposes Backup, but its bundled d.ts omits it. */
export interface SqliteBackupHandle {
  readonly completed: boolean;
  readonly failed: boolean;
  readonly remaining: number;
  readonly pageCount: number;
  step(pages: number, callback: (error: Error | null, completed: boolean) => void): this;
  finish(callback?: () => void): this;
}

declare module "sqlite3" {
  interface Database {
    backup(filename: string, callback?: (error: Error | null) => void): SqliteBackupHandle;
  }
}
