import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, jsonHeaders, loginAs, setupTestApp } from './helpers/app';
import type { TestContext } from './helpers/app';

let ctx: TestContext;
let adminToken: string;
beforeEach(async () => {
  ctx = setupTestApp();
  adminToken = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
});

describe('GET /api/permissions', () => {
  it('returns the full seeded catalog (31 permissions, {resource}.{action})', async () => {
    const res = await ctx.app.request('/api/permissions', { headers: jsonHeaders(adminToken) }, ctx.env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: Array<{ id: string; name: string; resource: string; action: string; group: string }>;
    };
    expect(json.data).toHaveLength(31);
    const names = json.data.map((p) => p.name);
    for (const expected of [
      'user.view',
      'user.create',
      'user.update',
      'user.delete',
      'role.view',
      'role.create',
      'role.update',
      'role.delete',
      'permission.view',
      'permission.assign',
      'reservation.checkin',
      'finance.report.view',
      'finance.invoice.delete',
      'finance.expense.view',
      'finance.expense.create',
      'finance.expense.update',
      'finance.expense.delete',
      'activity.view',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('requires authentication and permission.view', async () => {
    const anon = await ctx.app.request('/api/permissions', {}, ctx.env);
    expect(anon.status).toBe(401);

    const staffToken = await loginAs(ctx.app, ctx.env, STAFF.email, STAFF.password);
    const staff = await ctx.app.request('/api/permissions', { headers: jsonHeaders(staffToken) }, ctx.env);
    expect(staff.status).toBe(403); // Staff has no permission.view
  });

  it('is read-only (no POST route)', async () => {
    const res = await ctx.app.request('/api/permissions', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ name: 'hack.you' }),
    }, ctx.env);
    expect(res.status).toBe(404);
  });
});
