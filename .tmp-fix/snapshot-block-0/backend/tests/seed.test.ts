import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applyMigrationFile, backendRoot, createSqlite } from './helpers/fake-d1';

const here = dirname(fileURLToPath(import.meta.url));

describe('migration 0001_phase1_auth.sql', () => {
  it('creates all Phase 1 tables with constraints', () => {
    const sqlite = createSqlite();
    applyMigrationFile(sqlite, '0001_phase1_auth.sql');
    const tables = sqlite
      .prepare("SELECT name AS n FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ n: string }>;
    const names = tables.map((t) => t.n);
    for (const expected of ['users', 'roles', 'permissions', 'user_roles', 'role_permissions', 'password_reset_tokens']) {
      expect(names).toContain(expected);
    }
  });

  it('enforces email uniqueness and status checks', () => {
    const sqlite = createSqlite();
    applyMigrationFile(sqlite, '0001_phase1_auth.sql');
    sqlite.prepare(
      "INSERT INTO users (id, name, email, password_hash, status, created_at, updated_at) VALUES ('u1','A','a@x.com','h','active','t','t')",
    ).run();
    expect(() =>
      sqlite.prepare(
        "INSERT INTO users (id, name, email, password_hash, status, created_at, updated_at) VALUES ('u2','B','a@x.com','h','active','t','t')",
      ).run(),
    ).toThrow();
    expect(() =>
      sqlite.prepare(
        "INSERT INTO users (id, name, email, password_hash, status, created_at, updated_at) VALUES ('u3','C','c@x.com','h','bogus','t','t')",
      ).run(),
    ).toThrow();
  });

  it('enforces unique user-role pairs', () => {
    const sqlite = createSqlite();
    applyMigrationFile(sqlite, '0001_phase1_auth.sql');
    sqlite.prepare("INSERT INTO roles (id, name, created_at, updated_at) VALUES ('r1','R','t','t')").run();
    sqlite.prepare(
      "INSERT INTO users (id, name, email, password_hash, status, created_at, updated_at) VALUES ('u1','A','a@x.com','h','active','t','t')",
    ).run();
    sqlite.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run('u1', 'r1');
    expect(() => sqlite.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run('u1', 'r1')).toThrow();
  });
});

describe('scripts/generate-seed-sql.mjs', () => {
  function generateSeedSql(): string {
    const dir = mkdtempSync(join(tmpdir(), 'pms-seed-'));
    const out = join(dir, 'seed.sql');
    execSync(`node "${resolve(backendRoot, 'scripts', 'generate-seed-sql.mjs')}" --out="${out}"`, {
      cwd: backendRoot,
      stdio: 'pipe',
    });
    return readFileSync(out, 'utf8');
  }

  it('seeds all 26 permissions, 5 roles and 5 users without plaintext passwords', () => {
    const sql = generateSeedSql();
    expect(sql).toContain('user.view');
    expect(sql).toContain('permission.assign');
    expect(sql).toContain('activity.view');
    for (const id of ['role-001', 'role-005', 'user-001', 'user-005']) {
      expect(sql).toContain(id);
    }
    // Plaintext mock passwords must never appear in the seed output.
    for (const plain of ['admin123', 'manager123', 'staff123', 'inactive123', 'another123']) {
      expect(sql).not.toContain(plain);
    }
    // Idempotency markers.
    expect(sql).toContain('ON CONFLICT(id) DO NOTHING');
    expect(sql).toContain('ON CONFLICT(user_id, role_id) DO NOTHING');
  });

  it('is repeatable: applying twice creates no duplicates', () => {
    const sql = generateSeedSql();
    const tmp = mkdtempSync(join(tmpdir(), 'pms-seed-apply-'));
    const file = join(tmp, 'seed.sql');
    writeFileSync(file, sql);
    const sqlite: Database.Database = createSqlite();
    applyMigrationFile(sqlite, '0001_phase1_auth.sql');
    applyMigrationFile(sqlite, '0002_phase2_reservations.sql');
    applyMigrationFile(sqlite, '0003_phase3_rooms.sql');
    applyMigrationFile(sqlite, '0004_phase4_activities.sql');
    applyMigrationFile(sqlite, '0005_phase6_finance.sql');
    sqlite.exec(sql);
    sqlite.exec(sql);
    const count = (t: string) => (sqlite.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c;
    expect(count('permissions')).toBe(31);
    expect(count('roles')).toBe(5);
    expect(count('users')).toBe(5);
    expect(count('room_types')).toBe(5);
    expect(count('rooms')).toBe(8);
    expect(count('reservations')).toBe(15);
    expect(count('reservation_rooms')).toBe(16);
    expect(count('reservation_nightly_rates')).toBe(35);
    expect(count('activities')).toBe(10);
    expect(count('invoices')).toBe(9);
    expect(count('invoice_items')).toBe(27);
    expect(count('expenses')).toBe(10);
  });

  it('seeds reservation headers, nightly rates, and room splits', () => {
    const sql = generateSeedSql();
    expect(sql).toContain('RSV-2026-001');
    expect(sql).toContain('reservation_nightly_rates');
    expect(sql).toContain('reservation_rooms');
    for (const id of ['res-001', 'res-015', 'res-room-001']) {
      expect(sql).toContain(id);
    }
  });

  it('seeds room types and rooms from mock JSON', () => {
    const sql = generateSeedSql();
    expect(sql).toContain('room_types');
    expect(sql).toContain('room-type-001');
    expect(sql).toContain('room-001');
    expect(sql).toContain('Standard');
  });

  it('seeds all 10 mock activities verbatim with string metadata', () => {
    const sql = generateSeedSql();
    expect(sql).toContain('activities');
    for (const id of ['act-001', 'act-005', 'act-010']) {
      expect(sql).toContain(id);
    }
    // Plaintext secrets must never appear in the seed output.
    for (const plain of ['admin123', 'manager123', 'staff123']) {
      expect(sql).not.toContain(plain);
    }
  });
});

describe('migration 0002_phase2_reservations.sql', () => {
  it('creates Phase 2 tables with constraints', () => {
    const sqlite = createSqlite();
    applyMigrationFile(sqlite, '0001_phase1_auth.sql');
    applyMigrationFile(sqlite, '0002_phase2_reservations.sql');
    const tables = sqlite
      .prepare("SELECT name AS n FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ n: string }>;
    const names = tables.map((t) => t.n);
    for (const expected of ['reservations', 'reservation_rooms', 'reservation_nightly_rates']) {
      expect(names).toContain(expected);
    }
  });

  it('enforces code uniqueness, status/source checks, and date order', () => {
    const sqlite = createSqlite();
    applyMigrationFile(sqlite, '0001_phase1_auth.sql');
    applyMigrationFile(sqlite, '0002_phase2_reservations.sql');
    const base =
      "INSERT INTO reservations (id, reservation_code, guest_name, source, check_in_date, check_out_date, status, created_at, updated_at) VALUES ";
    sqlite.prepare(`${base}('r1','RSV-1','G','direct','2026-09-15','2026-09-17','reserved','t','t')`).run();
    expect(() => sqlite.prepare(`${base}('r2','RSV-1','G','direct','2026-09-15','2026-09-17','reserved','t','t')`).run()).toThrow();
    expect(() => sqlite.prepare(`${base}('r3','RSV-3','G','bogus','2026-09-15','2026-09-17','reserved','t','t')`).run()).toThrow();
    expect(() => sqlite.prepare(`${base}('r4','RSV-4','G','direct','2026-09-15','2026-09-17','bogus','t','t')`).run()).toThrow();
    expect(() => sqlite.prepare(`${base}('r5','RSV-5','G','direct','2026-09-17','2026-09-15','reserved','t','t')`).run()).toThrow();
  });

  it('enforces unique nightly (reservation, date) and room pairs', () => {
    const sqlite = createSqlite();
    applyMigrationFile(sqlite, '0001_phase1_auth.sql');
    applyMigrationFile(sqlite, '0002_phase2_reservations.sql');
    sqlite.prepare(
      "INSERT INTO reservations (id, reservation_code, guest_name, source, check_in_date, check_out_date, status, created_at, updated_at) VALUES ('r1','RSV-1','G','direct','2026-09-15','2026-09-17','reserved','t','t')",
    ).run();
    sqlite.prepare("INSERT INTO reservation_nightly_rates (reservation_id, date, rate) VALUES ('r1','2026-09-15',100)").run();
    expect(() =>
      sqlite.prepare("INSERT INTO reservation_nightly_rates (reservation_id, date, rate) VALUES ('r1','2026-09-15',100)").run(),
    ).toThrow();
    sqlite.prepare(
      "INSERT INTO reservation_rooms (id, reservation_id, room_id, room_number, created_at) VALUES ('rr1','r1','room-1','101','t')",
    ).run();
    expect(() =>
      sqlite.prepare(
        "INSERT INTO reservation_rooms (id, reservation_id, room_id, room_number, created_at) VALUES ('rr2','r1','room-1','101','t')",
      ).run(),
    ).toThrow();
  });
});

describe('migration 0004_phase4_activities.sql', () => {
  it('creates the activities table with indexes', () => {
    const sqlite = createSqlite();
    applyMigrationFile(sqlite, '0001_phase1_auth.sql');
    applyMigrationFile(sqlite, '0002_phase2_reservations.sql');
    applyMigrationFile(sqlite, '0003_phase3_rooms.sql');
    applyMigrationFile(sqlite, '0004_phase4_activities.sql');
    const tables = sqlite
      .prepare("SELECT name AS n FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ n: string }>;
    expect(tables.map((t) => t.n)).toContain('activities');
    const indexes = sqlite
      .prepare("SELECT name AS n FROM sqlite_master WHERE type = 'index' AND tbl_name = 'activities'")
      .all() as Array<{ n: string }>;
    const names = indexes.map((i) => i.n);
    for (const expected of [
      'idx_activities_created',
      'idx_activities_category',
      'idx_activities_user',
      'idx_activities_entity',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('enforces the category taxonomy and primary key', () => {
    const sqlite = createSqlite();
    applyMigrationFile(sqlite, '0001_phase1_auth.sql');
    applyMigrationFile(sqlite, '0002_phase2_reservations.sql');
    applyMigrationFile(sqlite, '0003_phase3_rooms.sql');
    applyMigrationFile(sqlite, '0004_phase4_activities.sql');
    const base =
      'INSERT INTO activities (id, category, action, description, user_id, user_name, created_at) VALUES ';
    sqlite.prepare(`${base}('a1','reservation','create','d','u1','U','t')`).run();
    expect(() => sqlite.prepare(`${base}('a1','reservation','create','d','u1','U','t')`).run()).toThrow();
    expect(() => sqlite.prepare(`${base}('a2','bogus','create','d','u1','U','t')`).run()).toThrow();
  });
});
