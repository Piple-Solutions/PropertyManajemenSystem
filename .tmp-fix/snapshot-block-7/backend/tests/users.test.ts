import { compareSync } from 'bcryptjs';
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

describe('GET /api/users', () => {
  it('requires authentication (401)', async () => {
    const res = await ctx.app.request('/api/users', {}, ctx.env);
    expect(res.status).toBe(401);
  });

  it('denies staff without user.view (403); manager lists users', async () => {
    const denied = await ctx.app.request('/api/users?page=1&pageSize=2', { headers: jsonHeaders(staffToken) }, ctx.env);
    expect(denied.status).toBe(403);

    const managerToken = await loginAs(ctx.app, ctx.env, 'manager@hotel.com', 'manager123');
    const res = await ctx.app.request('/api/users?page=1&pageSize=2', { headers: jsonHeaders(managerToken) }, ctx.env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: Array<{ id: string; passwordHash?: string }>;
      pagination: { page: number; pageSize: number; total: number };
    };
    expect(json.data).toHaveLength(2);
    expect(json.pagination.total).toBe(5);
    expect(json.data[0]).not.toHaveProperty('passwordHash');
  });

  it('supports search and status filter', async () => {
    const search = await ctx.app.request('/api/users?search=staff', { headers: jsonHeaders(adminToken) }, ctx.env);
    const sjson = (await search.json()) as { data: Array<{ name: string; email: string }> };
    expect(sjson.data.length).toBeGreaterThanOrEqual(2); // Staff User + Another Staff
    expect(
      sjson.data.every((u) => `${u.name} ${u.email}`.toLowerCase().includes('staff')),
    ).toBe(true);

    const inactive = await ctx.app.request('/api/users?status=inactive', { headers: jsonHeaders(adminToken) }, ctx.env);
    const ijson = (await inactive.json()) as { data: Array<{ status: string }> };
    expect(ijson.data.length).toBe(1);
    expect(ijson.data[0].status).toBe('inactive');
  });
});

describe('GET /api/users/:id', () => {
  it('returns one user and 404 for unknown ids', async () => {
    const res = await ctx.app.request('/api/users/user-001', { headers: jsonHeaders(adminToken) }, ctx.env);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { email: string } }).data.email).toBe(ADMIN.email);

    const missing = await ctx.app.request('/api/users/nope', { headers: jsonHeaders(adminToken) }, ctx.env);
    expect(missing.status).toBe(404);
  });
});

describe('POST /api/users', () => {
  it('creates a user with hashed password and valid roles', async () => {
    const res = await ctx.app.request('/api/users', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ name: 'New Guy', email: 'new@hotel.com', password: 'newguy123', roles: ['role-003'] }),
    }, ctx.env);
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { id: string; roles: string[] } };
    expect(json.data.roles).toEqual(['role-003']);

    const row = ctx.sqlite.prepare('SELECT password_hash AS h FROM users WHERE email = ?').get('new@hotel.com') as { h: string };
    expect(row.h).not.toBe('newguy123');
    expect(compareSync('newguy123', row.h)).toBe(true);
  });

  it('rejects duplicate email with 409', async () => {
    const res = await ctx.app.request('/api/users', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ name: 'Dup', email: ADMIN.email, password: 'dup12345', roles: ['role-003'] }),
    }, ctx.env);
    expect(res.status).toBe(409);
  });

  it('rejects unknown roles with 409', async () => {
    const res = await ctx.app.request('/api/users', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ name: 'Xavier', email: 'x@hotel.com', password: 'x123456', roles: ['role-999'] }),
    }, ctx.env);
    expect(res.status).toBe(409);
  });

  it('forbids staff without user.create (403)', async () => {
    const res = await ctx.app.request('/api/users', {
      method: 'POST',
      headers: jsonHeaders(staffToken),
      body: JSON.stringify({ name: 'X', email: 'x@hotel.com', password: 'x123456', roles: ['role-003'] }),
    }, ctx.env);
    expect(res.status).toBe(403);
  });

  it('validates input with 422 + field errors', async () => {
    const res = await ctx.app.request('/api/users', {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ name: 'A', email: 'bad', password: 'short', roles: [] }),
    }, ctx.env);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { errors: object }).errors).toBeDefined();
  });
});

describe('PATCH /api/users/:id', () => {
  it('updates name/email and rejects email clashes', async () => {
    const res = await ctx.app.request('/api/users/user-005', {
      method: 'PATCH',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ name: 'Renamed Staff' }),
    }, ctx.env);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { name: string } }).data.name).toBe('Renamed Staff');

    const clash = await ctx.app.request('/api/users/user-005', {
      method: 'PATCH',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ email: ADMIN.email }),
    }, ctx.env);
    expect(clash.status).toBe(409);
  });

  it('forbids staff without user.update (403)', async () => {
    const res = await ctx.app.request('/api/users/user-005', {
      method: 'PATCH',
      headers: jsonHeaders(staffToken),
      body: JSON.stringify({ name: 'Nope' }),
    }, ctx.env);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/users/:id/status', () => {
  it('toggles active/inactive', async () => {
    const res = await ctx.app.request('/api/users/user-005/status', {
      method: 'PATCH',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ status: 'inactive' }),
    }, ctx.env);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { status: string } }).data.status).toBe('inactive');
  });

  it('refuses self-deactivation', async () => {
    const res = await ctx.app.request('/api/users/user-001/status', {
      method: 'PATCH',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ status: 'inactive' }),
    }, ctx.env);
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/users/:id/roles', () => {
  it('replaces role assignments', async () => {
    const res = await ctx.app.request('/api/users/user-005/roles', {
      method: 'PUT',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ roles: ['role-002', 'role-005'] }),
    }, ctx.env);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { roles: string[] } }).data.roles).toEqual(
      expect.arrayContaining(['role-002', 'role-005']),
    );
  });

  it('rejects unknown roles', async () => {
    const res = await ctx.app.request('/api/users/user-005/roles', {
      method: 'PUT',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ roles: ['role-999'] }),
    }, ctx.env);
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/users/:id', () => {
  it('deletes and refuses self-deletion', async () => {
    const del = await ctx.app.request('/api/users/user-005', {
      method: 'DELETE',
      headers: jsonHeaders(adminToken),
    }, ctx.env);
    expect(del.status).toBe(204);

    const gone = await ctx.app.request('/api/users/user-005', { headers: jsonHeaders(adminToken) }, ctx.env);
    expect(gone.status).toBe(404);

    const self = await ctx.app.request('/api/users/user-001', {
      method: 'DELETE',
      headers: jsonHeaders(adminToken),
    }, ctx.env);
    expect(self.status).toBe(403);
  });
});
