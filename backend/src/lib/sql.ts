import { sql, type AnyColumn, type SQL } from 'drizzle-orm';

/**
 * LIKE helpers (BE-009). User-typed search text is matched literally: `%`,
 * `_` and the escape character itself are escaped, and the statement says
 * `ESCAPE '\'`. Previously a search for "100%" or "_" matched everything.
 */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** `column LIKE '%term%' ESCAPE '\'` with `term` treated literally. */
export function likeContains(column: AnyColumn | SQL, term: string): SQL {
  return sql`${column} LIKE ${`%${escapeLike(term)}%`} ESCAPE '\\'`;
}
