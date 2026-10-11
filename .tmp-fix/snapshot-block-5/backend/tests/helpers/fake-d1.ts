import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

/**
 * Minimal D1-compatible shim over better-sqlite3 for Vitest.
 *
 * The backend under test uses the REAL `drizzle-orm/d1` driver, which only
 * touches `client.prepare(sql).bind(...params).{all,run,raw}()` plus
 * `client.batch()`. This shim implements exactly that surface on top of an
 * in-memory SQLite database (same SQL dialect as D1), so integration tests
 * execute genuine SQL through the production code path without a live
 * Cloudflare account.
 */
const here = dirname(fileURLToPath(import.meta.url));
export const backendRoot = resolve(here, '..', '..');

export function createSqlite() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  return sqlite;
}

export function applyMigrationFile(sqlite: Database.Database, filename: string) {
  const sql = readFileSync(resolve(backendRoot, 'migrations', filename), 'utf8');
  sqlite.exec(sql);
}

function toD1All(rows: unknown[]) {
  return { results: rows, success: true, meta: {} };
}

/**
 * Per-database statement log. Every statement executed through the shim
 * (`run`, `all`, `first`, `raw`, and each statement inside `batch`) is
 * counted, which is what Cloudflare bills against the per-invocation D1
 * query limit (50 Free / 1000 Paid). Used by the query-budget tests.
 */
export interface QueryLog {
  count: number;
  batches: number;
  sql: string[];
  reset(): void;
}

const queryLogs = new WeakMap<Database.Database, QueryLog>();

export function queryLogFor(sqlite: Database.Database): QueryLog {
  let log = queryLogs.get(sqlite);
  if (!log) {
    log = {
      count: 0,
      batches: 0,
      sql: [],
      reset() {
        this.count = 0;
        this.batches = 0;
        this.sql = [];
      },
    };
    queryLogs.set(sqlite, log);
  }
  return log;
}

type Stmt = {
  reader: boolean;
  all: (...p: unknown[]) => unknown[];
  get: (...p: unknown[]) => Record<string, unknown> | undefined;
  run: (...p: unknown[]) => { changes: number; lastInsertRowid: unknown };
  raw: (on: boolean) => { all: (...p: unknown[]) => unknown[][] };
};

export function fakeD1(sqlite: Database.Database) {
  const log = queryLogFor(sqlite);
  const count = (sql: string) => {
    log.count += 1;
    log.sql.push(sql);
  };
  return {
    prepare(sql: string) {
      const stmt = sqlite.prepare(sql) as unknown as Stmt;
      const bound = (...params: unknown[]) => ({
        all: async () => {
          count(sql);
          return toD1All(stmt.all(...params));
        },
        first: async (col?: string) => {
          count(sql);
          const row = stmt.get(...params);
          if (row == null) return null;
          return col !== undefined ? (row[col] ?? null) : row;
        },
        run: async () => {
          count(sql);
          const info = stmt.run(...params);
          return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
        },
        raw: async () => {
          count(sql);
          return stmt.raw(true).all(...params);
        },
        /**
         * Synchronous execution used by `batch` so every statement of a batch
         * runs inside ONE sqlite transaction (D1 semantics: all or nothing).
         */
        __execSync: () => {
          count(sql);
          if (stmt.reader) return toD1All(stmt.all(...params));
          const info = stmt.run(...params);
          return { results: [], success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
        },
      });
      return {
        bind: (...params: unknown[]) => bound(...params),
        all: async () => bound().all(),
        first: async (col?: string) => bound().first(col),
        run: async () => bound().run(),
        raw: async () => bound().raw(),
        __execSync: () => bound().__execSync(),
      };
    },
    /**
     * D1 `batch` is a transaction: if any statement fails, none of the
     * statements take effect and the call rejects. Emulated with a sqlite
     * transaction over synchronous execution (so concurrent requests cannot
     * interleave inside it, exactly like a single D1 batch).
     */
    batch: async (statements: Array<{ __execSync?: () => unknown }>) => {
      log.batches += 1;
      const run = sqlite.transaction(() => statements.map((s) => {
        if (typeof s.__execSync !== 'function') throw new Error('fake D1 batch: unsupported statement');
        return s.__execSync();
      }));
      return run();
    },
    exec: async (sql: string) => {
      sqlite.exec(sql);
      return { count: 0, duration: 0 };
    },
  };
}
