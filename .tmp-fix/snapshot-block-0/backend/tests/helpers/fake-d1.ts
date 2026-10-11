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

export function fakeD1(sqlite: Database.Database) {
  return {
    prepare(sql: string) {
      const stmt = sqlite.prepare(sql);
      const bound = (...params: unknown[]) => ({
        all: async () => toD1All((stmt as unknown as { all: (...p: unknown[]) => unknown[] }).all(...params)),
        first: async (col?: string) => {
          const row = (stmt as unknown as { get: (...p: unknown[]) => Record<string, unknown> | undefined }).get(
            ...params,
          );
          if (row == null) return null;
          return col !== undefined ? (row[col] ?? null) : row;
        },
        run: async () => {
          const info = (stmt as unknown as { run: (...p: unknown[]) => { changes: number; lastInsertRowid: unknown } }).run(
            ...params,
          );
          return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
        },
        raw: async () =>
          (stmt as unknown as { raw: (on: boolean) => { all: (...p: unknown[]) => unknown[][] } }).raw(true).all(
            ...params,
          ),
      });
      return {
        bind: (...params: unknown[]) => bound(...params),
        all: async () => toD1All((stmt as unknown as { all: () => unknown[] }).all()),
        first: async (col?: string) => bound().first(col),
        run: async () => bound().run(),
        raw: async () => bound().raw(),
      };
    },
    batch: async (statements: Array<{ all?: () => Promise<unknown>; run?: () => Promise<unknown> }>) => {
      const out = [];
      for (const s of statements) {
        if (typeof s.all === 'function') out.push(await s.all());
        else if (typeof s.run === 'function') out.push(await s.run());
        else out.push({ results: [], success: true, meta: {} });
      }
      return out;
    },
    exec: async (sql: string) => {
      sqlite.exec(sql);
      return { count: 0, duration: 0 };
    },
  };
}
