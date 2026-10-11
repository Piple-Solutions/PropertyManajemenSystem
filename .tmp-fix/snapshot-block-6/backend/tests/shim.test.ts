import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createD1Db } from '../src/db/client';
import { createSqlite, fakeD1, queryLogFor } from './helpers/fake-d1';

/**
 * Proves the D1 shim faithfully emulates the guarantees the remediation
 * relies on (agents_rules_fix.md section 5): `db.batch` is a transaction
 * with rollback, single statements are atomic and report `changes`, and every
 * statement is counted for the query-budget tests.
 */
function setup() {
  const sqlite = createSqlite();
  sqlite.exec(`
    CREATE TABLE t (id TEXT PRIMARY KEY, v INTEGER NOT NULL CHECK (v >= 0));
    CREATE TABLE night (room TEXT NOT NULL, d TEXT NOT NULL, PRIMARY KEY (room, d));
  `);
  const d1 = fakeD1(sqlite);
  const db = createD1Db(d1 as never);
  return { sqlite, d1, db, log: queryLogFor(sqlite) };
}

const count = (sqlite: ReturnType<typeof createSqlite>, table: string) =>
  (sqlite.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;

describe('fake D1 shim: batch is a transaction', () => {
  it('commits every statement when all succeed and reports per-statement changes', async () => {
    const { db, sqlite } = setup();
    const results = await db.batch([
      db.run(sql`INSERT INTO t (id, v) VALUES ('a', 1)`),
      db.run(sql`INSERT INTO t (id, v) VALUES ('b', 2)`),
      db.run(sql`UPDATE t SET v = v + 10 WHERE id = 'a'`),
    ]);
    expect(count(sqlite, 't')).toBe(2);
    expect((results as unknown as Array<{ meta: { changes: number } }>).map((r) => r.meta.changes)).toEqual([1, 1, 1]);
    expect((sqlite.prepare("SELECT v FROM t WHERE id = 'a'").get() as { v: number }).v).toBe(11);
  });

  it('rolls back ALL statements when a later statement fails', async () => {
    const { db, sqlite } = setup();
    sqlite.exec("INSERT INTO t (id, v) VALUES ('keep', 5)");
    await expect(
      db.batch([
        db.run(sql`UPDATE t SET v = 99 WHERE id = 'keep'`),
        db.run(sql`INSERT INTO t (id, v) VALUES ('new', 1)`),
        db.run(sql`INSERT INTO t (id, v) VALUES ('bad', -1)`), // CHECK violation
      ]),
    ).rejects.toThrow();
    expect(count(sqlite, 't')).toBe(1);
    expect((sqlite.prepare("SELECT v FROM t WHERE id = 'keep'").get() as { v: number }).v).toBe(5);
  });

  it('rolls back on a primary-key conflict inside the batch', async () => {
    const { db, sqlite } = setup();
    sqlite.exec("INSERT INTO night (room, d) VALUES ('r1', '2026-10-01')");
    await expect(
      db.batch([
        db.run(sql`INSERT INTO night (room, d) VALUES ('r1', '2026-10-02')`),
        db.run(sql`INSERT INTO night (room, d) VALUES ('r1', '2026-10-01')`), // conflict
      ]),
    ).rejects.toThrow();
    expect(count(sqlite, 'night')).toBe(1);
  });
});

describe('fake D1 shim: single-statement conditional writes', () => {
  it('INSERT ... SELECT ... WHERE NOT EXISTS inserts once and reports changes = 0 for the loser', async () => {
    const { db, sqlite } = setup();
    const conditional = sql`INSERT INTO night (room, d)
      SELECT 'r1', '2026-10-05' WHERE NOT EXISTS (SELECT 1 FROM night WHERE room = 'r1' AND d = '2026-10-05')`;
    const first = (await db.run(conditional)) as unknown as { meta: { changes: number } };
    const second = (await db.run(conditional)) as unknown as { meta: { changes: number } };
    expect(first.meta.changes).toBe(1);
    expect(second.meta.changes).toBe(0);
    expect(count(sqlite, 'night')).toBe(1);
  });

  it('conditional UPDATE ... WHERE status = ? reports changes = 0 when the guard no longer holds', async () => {
    const { db, sqlite } = setup();
    sqlite.exec("INSERT INTO t (id, v) VALUES ('x', 1)");
    const win = (await db.run(sql`UPDATE t SET v = 2 WHERE id = 'x' AND v = 1`)) as unknown as { meta: { changes: number } };
    const lose = (await db.run(sql`UPDATE t SET v = 3 WHERE id = 'x' AND v = 1`)) as unknown as { meta: { changes: number } };
    expect(win.meta.changes).toBe(1);
    expect(lose.meta.changes).toBe(0);
  });
});

describe('fake D1 shim: query log', () => {
  it('counts each statement, including statements inside a batch', async () => {
    const { db, log } = setup();
    log.reset();
    await db.run(sql`INSERT INTO t (id, v) VALUES ('q1', 1)`);
    await db.all(sql`SELECT * FROM t`);
    expect(log.count).toBe(2);
    await db.batch([
      db.run(sql`INSERT INTO t (id, v) VALUES ('q2', 1)`),
      db.run(sql`INSERT INTO t (id, v) VALUES ('q3', 1)`),
    ]);
    expect(log.count).toBe(4);
    expect(log.batches).toBe(1);
    log.reset();
    expect(log.count).toBe(0);
  });
});
