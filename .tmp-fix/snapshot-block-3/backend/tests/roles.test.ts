import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, jsonHeaders, loginAs, setupTestApp } from './helpers/app';
import type { TestContext } from './helpers/app';

let ctx: TestContext;
let adminToken: string;
let staffToken: string;
beforeEach(async () => {
  ctx = setupTestApp();
  adminToken = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
  staffToken = await loginAs(ctx.app, ctx.env, STAFF.email, STAFF.password);
});

describe('GET /api/roles', () => {
  it('lists roles with permission names and pagination', async () => {
    const res = await ctx.app.request('/api/roles', { headers: jsonHeaders(adminToken) }, ctx.env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: Array<{ id: string; name: string; permissions: string[] }>;
      pagination: { total: number };
    };
    expect(json.pagination.total).toBe(5);
    const admin = json.data.find((r) => r.id === 'role-001');
    expect(admin?.permissions).toContain('permission.assign');
  });

  it('requires role.view (staff lacks it → 403)', async () => {
    const res = await ctx.app.request('/api/roles', { headers: jsonHeaders(staffToken) }, ctx.env);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/roles', () => {
  it('creates a role with permissions', async () => {
    const res = await ctx.app.request('/api/roles', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ name: 'Night Audit', description: 'Night shift', permissions: ['reservation.view', 'room.view'] }),
    }, ctx.env);
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { permissions: string[] } };
    expect(json.data.permissions).toEqual(expect.arrayContaining(['reservation.view']));
  });

  it('rejects duplicate role names with 409', async () => {
    const res = await ctx.app.request('/api/roles', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ name: 'Staff', permissions: [] }),
    }, ctx.env);
    expect(res.status).toBe(409);
  });

  it('rejects invalid permission ids with 409', async () => {
    const res = await ctx.app.request('/api/roles', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ name: 'Bogus', permissions: ['nope.nothing'] }),
    }, ctx.env);
    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/roles/:id', () => {
  it('renames a role and rejects name clashes', async () => {
    const res = await ctx.app.request('/api/roles/role-005', {
      method: 'PATCH',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ name: 'Front Desk' }),
    }, ctx.env);
    expect(res.status).toBe(200);

    const clash = await ctx.app.request('/api/roles/role-005', {
      method: 'PATCH',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ name: 'Staff' }),
    }, ctx.env);
    expect(clash.status).toBe(409);
  });
});

describe('PUT /api/roles/:id/permissions', () => {
  it('replaces the permission set (union visible on /me)', async () => {
    const res = await ctx.app.request('/api/roles/role-003/permissions', {
      method: 'PUT',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ permissions: ['reservation.view', 'activity.view'] }),
    }, ctx.env);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { permissions: string[] } }).data.permissions).toEqual(
      expect.arrayContaining(['activity.view']),
    );

    const me = await ctx.app.request('/api/auth/me', { headers: jsonHeaders(staffToken) }, ctx.env);
    expect(((await me.json()) as { data: { permissions: string[] } }).data.permissions).toEqual(
      expect.arrayContaining(['activity.view']),
    );
  });

  it('requires permission.assign (manager-style user.update alone → 403)', async () => {
    // Staff has no permission.assign at all.
    const res = await ctx.app.request('/api/roles/role-003/permissions', {
      method: 'PUT',
      headers: jsonHeaders(staffToken),
      body: JSON.stringify({ permissions: ['reservation.view'] }),
    }, ctx.env);
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/roles/:id', () => {
  it('refuses to delete a role still assigned to users (409)', async () => {
    const res = await ctx.app.request('/api/roles/role-001', {
      method: 'DELETE',
      headers: jsonHeaders(adminToken),
    }, ctx.env);
    expect(res.status).toBe(409);
  });

  it('deletes an unassigned role', async () => {
    const created = await ctx.app.request('/api/roles', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ name: 'Temp', permissions: [] }),
    }, ctx.env);
    const { id } = ((await created.json()) as { data: { id: string } }).data;
    const del = await ctx.app.request(`/api/roles/${id}`, {
      method: 'DELETE',
      headers: jsonHeaders(adminToken),
    }, ctx.env);
    expect(del.status).toBe(204);
  });
});

describe('effective permission union', () => {
  it('unions permissions across multiple roles', async () => {
    await ctx.app.request('/api/users/user-005/roles', {
      method: 'PUT',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ roles: ['role-003', 'role-005'] }),
    }, ctx.env);
    const token = await loginAs(ctx.app, ctx.env, 'another@hotel.com', 'another123');
    const me = await ctx.app.request('/api/auth/me', { headers: jsonHeaders(token) }, ctx.env);
    const perms = ((await me.json()) as { data: { permissions: string[] } }).data.permissions;
    // role-005 adds activity.view on top of role-003's set.
    expect(perms).toEqual(expect.arrayContaining(['activity.view', 'reservation.create']));
  });
});
