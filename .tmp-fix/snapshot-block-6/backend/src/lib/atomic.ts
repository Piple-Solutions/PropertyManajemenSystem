import { SQL, is, sql } from 'drizzle-orm';
import { SQLiteAsyncDialect } from 'drizzle-orm/sqlite-core';
import type { AppDb } from '../db/client';

/**
 * Atomic-write helpers (Block 5: BE-015, BE-016, BE-018, BE-029).
 *
 * Only two documented D1 guarantees are relied on:
 *  1. a single statement is atomic;
 *  2. `db.batch([...])` runs its statements sequentially inside ONE
 *     transaction: if any statement fails, the whole batch is rolled back.
 * Invariants are therefore enforced by CONDITIONAL statements (`INSERT ...
 * SELECT ... WHERE NOT EXISTS`, `UPDATE ... WHERE status = ?`) whose
 * changed-row count is checked afterwards, never by "check, await, write".
 */

/** D1 allows at most 100 bound parameters per statement; keep a margin. */
export const MAX_BOUND_PARAMS = 95;

/**
 * One statement of an atomic batch: a raw `sql` template or any drizzle query
 * builder (`db.insert(...)`, `db.update(...)`, `db.delete(...)`).
 */
export type AtomicStatement = SQL | { toSQL(): { sql: string; params: unknown[] } };

const dialect = new SQLiteAsyncDialect();

function compile(statement: AtomicStatement): { sql: string; params: unknown[] } {
  if (is(statement, SQL)) {
    const q = dialect.sqlToQuery(statement);
    return { sql: q.sql, params: q.params };
  }
  return (statement as { toSQL(): { sql: string; params: unknown[] } }).toSQL();
}

/**
 * Run statements as ONE D1 transaction (all or nothing) and return the raw
 * D1 result of each statement (`meta.changes` is the changed-row count).
 *
 * Statements are sent through the D1 client's own `batch()` rather than
 * drizzle's `db.batch()`: drizzle 0.45 cannot batch raw parameterised SQL
 * (`db.run(sql\`...\`)` has no prepared statement to bind), and the
 * conditional writes here need exactly that. The SQL text and parameters are
 * still produced by drizzle, so identifiers and values are escaped/bound the
 * same way as everywhere else.
 */
export async function runAtomic(db: AppDb, statements: AtomicStatement[]): Promise<unknown[]> {
  if (statements.length === 0) return [];
  const client = (db as unknown as { $client: D1Database }).$client;
  const prepared = statements.map((statement) => {
    const { sql: text, params } = compile(statement);
    if (params.length > MAX_BOUND_PARAMS + 5) {
      throw new Error(`Atomic statement exceeds the D1 bound-parameter limit (${params.length}).`);
    }
    return client.prepare(text).bind(...params);
  });
  return (await client.batch(prepared)) as unknown[];
}

/** Rows changed by one statement, read from the D1 result (`meta.changes`). */
export function changesOf(result: unknown): number {
  const n = (result as { meta?: { changes?: unknown } } | null | undefined)?.meta?.changes;
  return typeof n === 'number' ? n : 0;
}

/**
 * True when `err` is a UNIQUE-constraint violation on `column`
 * (`table.column`). D1 and SQLite both report
 * `UNIQUE constraint failed: <table>.<column>`.
 */
export function isUniqueViolation(err: unknown, column: string): boolean {
  let e: unknown = err;
  for (let depth = 0; depth < 4 && e; depth += 1) {
    const message = String((e as { message?: unknown }).message ?? e);
    if (message.includes('UNIQUE constraint failed') && message.includes(column)) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/** `(?, ?), (?, ?)` for a `VALUES` list, each inner array being one row. */
export function valuesList(rows: unknown[][]): SQL {
  return sql.join(
    rows.map((row) => sql`(${sql.join(row.map((v) => sql`${v}`), sql`, `)})`),
    sql`, `,
  );
}

/** `?, ?, ?` for an `IN (...)` list. */
export function inList(values: unknown[]): SQL {
  return sql.join(values.map((v) => sql`${v}`), sql`, `);
}

/** Split `items` so each chunk keeps a statement within the bound-parameter cap. */
export function chunkByParams<T>(items: T[], paramsPerItem: number, fixedParams: number): T[][] {
  const size = Math.max(1, Math.floor((MAX_BOUND_PARAMS - fixedParams) / paramsPerItem));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
