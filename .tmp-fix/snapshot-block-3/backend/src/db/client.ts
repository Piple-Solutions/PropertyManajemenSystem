import { drizzle as drizzleD1, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema';

/**
 * Drizzle schema bundle for the Workers (D1) runtime.
 *
 * NOTE: only the D1 driver is imported in `src/` — Node-only drivers such as
 * `drizzle-orm/better-sqlite3` must stay in `tests/` so they are never bundled
 * into the Worker. Tests run the SAME drizzle-d1 code path against a minimal
 * in-memory D1 shim (see `tests/helpers/fake-d1.ts`).
 */
export type AppSchema = typeof schema;

/** Production runtime: wrap the D1 binding. */
export function createD1Db(d1: D1Database): AppDb {
  return drizzleD1(d1, { schema });
}

export type AppDb = DrizzleD1Database<AppSchema>;
