import { vi } from 'vitest';
import { loginAs, setupTestApp, ADMIN, STAFF } from './app';
import type { TestContext } from './app';

/**
 * Golden / characterization harness (Block 0).
 *
 * Records full HTTP responses (status + normalized body) for scripted
 * happy-path scenarios against the seeded in-memory D1 and compares them to
 * committed snapshots in `tests/golden/snapshots/`. The snapshots were
 * generated from UNMODIFIED code and must never be edited to match new
 * behavior (agents_rules_fix.md section 7).
 *
 * Determinism:
 * - `Date` is frozen and advances 1s per recorded call (so "newest first"
 *   orderings are realistic but stable);
 * - UUID-ish ids are replaced by stable placeholders in order of appearance;
 * - JWTs and reset tokens are replaced by placeholders.
 */
export const FROZEN_START = '2026-09-20T03:00:00.000Z';

export function freezeClock(start = FROZEN_START) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(start));
}

export function unfreezeClock() {
  vi.useRealTimers();
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const JWT_RE = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;
/** `newId(prefix)` ids: `<prefix>-<8 hex>` (e.g. role-e5892d88). */
const SHORT_ID_RE = /-([0-9a-f]{8})(?![0-9a-zA-Z])/g;

export class Normalizer {
  private seen = new Map<string, string>();
  private tokenKeys = new Set(['token', 'resetToken']);

  private mapUuid(u: string): string {
    let v = this.seen.get(u);
    if (!v) {
      v = `<uuid-${this.seen.size + 1}>`;
      this.seen.set(u, v);
    }
    return v;
  }

  private str(s: string, key?: string): string {
    if (key && this.tokenKeys.has(key) && s.length > 20) return `<${key}>`;
    if (JWT_RE.test(s)) return '<jwt>';
    return s
      .replace(UUID_RE, (m) => this.mapUuid(m))
      .replace(SHORT_ID_RE, (_m, hex: string) => `-${this.mapUuid(hex).replace('uuid', 'id')}`);
  }

  apply<T>(value: T, key?: string): T {
    if (typeof value === 'string') return this.str(value, key) as unknown as T;
    if (Array.isArray(value)) return value.map((v) => this.apply(v)) as unknown as T;
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = this.apply(v, k);
      return out as T;
    }
    return value;
  }
}

export interface Step {
  step: string;
  status: number;
  body: unknown;
}

export class Recorder {
  steps: Step[] = [];
  private norm = new Normalizer();

  constructor(private ctx: TestContext) {}

  /** Issue a request, record it, return `{ status, json }`. */
  async call(
    label: string,
    method: string,
    path: string,
    token?: string,
    body?: unknown,
  ): Promise<{ status: number; json: any }> {
    vi.setSystemTime(new Date(Date.now() + 1000));
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await this.ctx.app.request(
      path,
      { method, headers, body: body === undefined ? undefined : JSON.stringify(body) },
      this.ctx.env,
    );
    let json: any = null;
    const text = await res.text();
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }
    }
    this.steps.push({ step: label, status: res.status, body: this.norm.apply(json) });
    return { status: res.status, json };
  }

  serialize(): string {
    return JSON.stringify(this.steps, null, 2) + '\n';
  }
}

export interface GoldenSession {
  ctx: TestContext;
  rec: Recorder;
  admin: string;
  staff: string;
}

export async function startGolden(): Promise<GoldenSession> {
  freezeClock();
  const ctx = setupTestApp();
  const admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
  // Distinct timestamps: ties in `activities.created_at` are unordered today (BE-035).
  vi.setSystemTime(new Date(Date.now() + 1000));
  const staff = await loginAs(ctx.app, ctx.env, STAFF.email, STAFF.password);
  return { ctx, rec: new Recorder(ctx), admin, staff };
}
