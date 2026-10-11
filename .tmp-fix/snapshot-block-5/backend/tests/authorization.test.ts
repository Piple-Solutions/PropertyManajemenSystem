import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, loginAs, setupTestApp } from './helpers/app';
import type { TestContext } from './helpers/app';

/**
 * Block 2 regression tests: BE-002 (hierarchy + last admin), BE-003
 * (permission subset on grants), BE-007 (inactive roles). Converted from the
 * audit PoCs (`.tmp-audit/poc`) and the Block 0 known-unsafe baselines.
 */
let ctx: TestContext;
let admin: string;
let manager: string;

beforeEach(async () => {
  ctx = setupTestApp();
  admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
  manager = await loginAs(ctx.app, ctx.env, 'manager@hotel.com', 'manager123');
});

async function call(method: string, path: string, token: string | undefined, body?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await ctx.app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, ctx.env);
  const text = await res.text();
  return { status: res.status, json: (text ? JSON.parse(text) : null) as any };
}

async function makeUser(email: string, roles: string[], token = admin) {
  const res = await call('POST', '/api/users', token, { name: 'Test Person', email, password: 'person123', roles });
  expect(res.status).toBe(201);
  return res.json.data.id as string;
}

async function makeRole(name: string, permissions: string[]) {
  const res = await call('POST', '/api/roles', admin, { name, permissions });
  expect(res.status).toBe(201);
  return res.json.data.id as string;
}

const rolesOf = (userId: string) =>
  (ctx.sqlite.prepare('SELECT role_id AS r FROM user_roles WHERE user_id = ? ORDER BY role_id').all(userId) as Array<{ r: string }>).map((x) => x.r);

describe('BE-002: an actor cannot act on a user who outranks them', () => {
  it('Manager cannot demote, deactivate, re-email, or rename the Super Admin', async () => {
    const demote = await call('PUT', '/api/users/user-001/roles', manager, { roles: ['role-003'] });
    expect(demote.status).toBe(403);
    expect(demote.json.message).toMatch(/hak akses lebih tinggi/);
    expect(rolesOf('user-001')).toEqual(['role-001']);

    expect((await call('PATCH', '/api/users/user-001/status', manager, { status: 'inactive' })).status).toBe(403);
    expect((await call('PATCH', '/api/users/user-001', manager, { email: 'hijack@hotel.com' })).status).toBe(403);
    expect((await call('PATCH', '/api/users/user-001', manager, { name: 'Hacked' })).status).toBe(403);
    expect((await call('PATCH', '/api/users/user-001', manager, { status: 'inactive' })).status).toBe(403);
    expect((await call('PATCH', '/api/users/user-001', manager, { roles: ['role-003'] })).status).toBe(403);

    // The Super Admin session is untouched.
    expect((await call('GET', '/api/auth/me', admin)).status).toBe(200);
    const row = ctx.sqlite.prepare("SELECT email, status, name FROM users WHERE id = 'user-001'").get() as { email: string; status: string; name: string };
    expect(row).toEqual({ email: 'admin@hotel.com', status: 'active', name: 'Admin User' });
  });

  it('Manager still manages Staff, Reception, Viewer and other Managers', async () => {
    for (const role of ['role-002', 'role-003', 'role-004', 'role-005']) {
      const id = await makeUser(`m-${role}@hotel.com`, [role], manager);
      expect((await call('PATCH', `/api/users/${id}`, manager, { name: 'Renamed Person' })).status, role).toBe(200);
      expect((await call('PATCH', `/api/users/${id}`, manager, { email: `new-${role}@hotel.com` })).status, role).toBe(200);
      expect((await call('PUT', `/api/users/${id}/roles`, manager, { roles: ['role-003'] })).status, role).toBe(200);
      expect((await call('PATCH', `/api/users/${id}/status`, manager, { status: 'inactive' })).status, role).toBe(200);
      expect((await call('PATCH', `/api/users/${id}/status`, manager, { status: 'active' })).status, role).toBe(200);
    }
  });

  it('a user-admin with user.delete cannot delete someone who outranks them', async () => {
    const roleId = await makeRole('User Deleter', ['user.view', 'user.delete']);
    await makeUser('deleter@hotel.com', [roleId]);
    const token = await loginAs(ctx.app, ctx.env, 'deleter@hotel.com', 'person123');
    expect((await call('DELETE', '/api/users/user-002', token)).status).toBe(403);
    expect((await call('DELETE', '/api/users/user-001', token)).status).toBe(403);
    // An equal-or-lower target is fine.
    const peer = await makeUser('peer@hotel.com', [roleId]);
    expect((await call('DELETE', `/api/users/${peer}`, token)).status).toBe(204);
  });

  it('self-service still works and self-lockout is blocked on every route', async () => {
    expect((await call('PATCH', '/api/users/user-002', manager, { name: 'Manager Renamed' })).status).toBe(200);
    expect((await call('PATCH', '/api/users/user-002/status', manager, { status: 'inactive' })).status).toBe(403);
    expect((await call('PATCH', '/api/users/user-002', manager, { status: 'inactive' })).status).toBe(403);
  });
});

describe('BE-002: last active Super Admin protection', () => {
  it('the only Super Admin cannot be demoted, deactivated, or deleted, even by themselves or another Super Admin-level actor', async () => {
    const self = await call('PUT', '/api/users/user-001/roles', admin, { roles: ['role-002'] });
    expect(self.status).toBe(403);
    expect(self.json.message).toMatch(/Super Admin aktif terakhir/);
    expect((await call('PATCH', '/api/users/user-001', admin, { roles: ['role-003'] })).status).toBe(403);
    expect(rolesOf('user-001')).toEqual(['role-001']);

    // A full-permission custom role (not role-001) must not be able to remove the last Super Admin either.
    const all = (await call('GET', '/api/permissions', admin)).json.data.map((p: { name: string }) => p.name) as string[];
    const roleId = await makeRole('Everything', all);
    await makeUser('everything@hotel.com', [roleId]);
    const token = await loginAs(ctx.app, ctx.env, 'everything@hotel.com', 'person123');
    expect((await call('PATCH', '/api/users/user-001/status', token, { status: 'inactive' })).status).toBe(403);
    expect((await call('DELETE', '/api/users/user-001', token)).status).toBe(403);
    expect((await call('PUT', '/api/users/user-001/roles', token, { roles: ['role-003'] })).status).toBe(403);
    expect((await call('PATCH', '/api/users/user-001', token, { email: 'taken@hotel.com' })).status).toBe(403);
    expect((await call('GET', '/api/auth/me', admin)).status).toBe(200);
  });

  it('the last Super Admin may still edit their own name and email, and keep role-001 while adding roles', async () => {
    expect((await call('PATCH', '/api/users/user-001', admin, { name: 'Owner', email: 'owner@joglo.test' })).status).toBe(200);
    expect((await call('PUT', '/api/users/user-001/roles', admin, { roles: ['role-001', 'role-002'] })).status).toBe(200);
    expect((await call('GET', '/api/auth/me', admin)).status).toBe(200);
  });

  it('with two active Super Admins, one may demote/deactivate/delete the other, but the survivor is then protected', async () => {
    const second = await makeUser('second-admin@hotel.com', ['role-001']);
    const secondToken = await loginAs(ctx.app, ctx.env, 'second-admin@hotel.com', 'person123');
    expect((await call('PATCH', `/api/users/${second}/status`, admin, { status: 'inactive' })).status).toBe(200);
    // An inactive Super Admin does not count: user-001 is the last ACTIVE one again.
    expect((await call('PUT', '/api/users/user-001/roles', admin, { roles: ['role-002'] })).status).toBe(403);
    expect((await call('PATCH', `/api/users/${second}/status`, admin, { status: 'active' })).status).toBe(200);
    const again = await loginAs(ctx.app, ctx.env, 'second-admin@hotel.com', 'person123');
    expect(secondToken).toBeTruthy();
    expect((await call('PUT', '/api/users/user-001/roles', again, { roles: ['role-002'] })).status).toBe(200);
    expect((await call('DELETE', '/api/users/user-001', again)).status).toBe(204);
    expect((await call('PUT', `/api/users/${second}/roles`, again, { roles: ['role-003'] })).status).toBe(403);
  });

  it('the Super Admin role itself cannot be deactivated or stripped of its administrative permissions', async () => {
    const off = await call('PATCH', '/api/roles/role-001', admin, { status: 'inactive' });
    expect(off.status).toBe(403);
    expect((await call('PUT', '/api/roles/role-001/permissions', admin, { permissions: ['room.view'] })).status).toBe(403);
    // Renaming / describing it, and adding permissions, stay possible.
    expect((await call('PATCH', '/api/roles/role-001', admin, { description: 'Pemilik' })).status).toBe(200);
    const current = (await call('GET', '/api/roles/role-001', admin)).json.data.permissions as string[];
    expect((await call('PUT', '/api/roles/role-001/permissions', admin, { permissions: current })).status).toBe(200);
  });
});

describe('BE-003: permissions can only be granted by someone who holds them', () => {
  async function actorWith(permissions: string[], email: string) {
    const roleId = await makeRole(`Role for ${email}`, permissions);
    const userId = await makeUser(email, [roleId]);
    return { roleId, userId, token: await loginAs(ctx.app, ctx.env, email, 'person123') };
  }

  it('role.create without permission.assign cannot attach permissions to a new role (PoC)', async () => {
    const maker = await actorWith(['user.view', 'user.update', 'role.view', 'role.create'], 'maker@hotel.com');
    const escalated = await call('POST', '/api/roles', maker.token, { name: 'Escalated', permissions: ['user.delete', 'role.delete', 'user.create'] });
    expect(escalated.status).toBe(403);
    expect(escalated.json.message).toMatch(/permission\.assign/);
    expect(ctx.sqlite.prepare("SELECT id FROM roles WHERE name = 'Escalated'").get()).toBeUndefined();
    // Even permissions the actor already holds need permission.assign.
    expect((await call('POST', '/api/roles', maker.token, { name: 'Own Perms', permissions: ['user.view'] })).status).toBe(403);
    // An empty role is still allowed with role.create alone.
    expect((await call('POST', '/api/roles', maker.token, { name: 'Empty Shell' })).status).toBe(201);
  });

  it('permission.assign holders may grant only permissions they hold themselves', async () => {
    const a = await actorWith(['role.view', 'role.create', 'role.update', 'permission.assign', 'room.view'], 'assigner@hotel.com');
    const tooMuch = await call('POST', '/api/roles', a.token, { name: 'Too Much', permissions: ['room.view', 'user.delete'] });
    expect(tooMuch.status).toBe(403);
    expect(tooMuch.json.message).toMatch(/izin yang tidak Anda miliki/);
    const fine = await call('POST', '/api/roles', a.token, { name: 'Just Rooms', permissions: ['room.view'] });
    expect(fine.status).toBe(201);
    const put = await call('PUT', `/api/roles/${fine.json.data.id}/permissions`, a.token, { permissions: ['room.view', 'finance.invoice.delete'] });
    expect(put.status).toBe(403);
    expect((await call('PUT', `/api/roles/${fine.json.data.id}/permissions`, a.token, { permissions: ['role.view'] })).status).toBe(200);
  });

  it('a role that outranks the actor cannot be edited, re-permissioned, or deleted by them', async () => {
    const a = await actorWith(['role.view', 'role.update', 'role.delete', 'permission.assign', 'room.view'], 'role-editor@hotel.com');
    expect((await call('PATCH', '/api/roles/role-002', a.token, { status: 'inactive' })).status).toBe(403);
    expect((await call('PUT', '/api/roles/role-002/permissions', a.token, { permissions: ['room.view'] })).status).toBe(403);
    const unused = await makeRole('Unused Big', ['user.delete']);
    expect((await call('DELETE', `/api/roles/${unused}`, a.token)).status).toBe(403);
    const small = await makeRole('Unused Small', ['room.view']);
    expect((await call('PATCH', `/api/roles/${small}`, a.token, { description: 'ok' })).status).toBe(200);
    expect((await call('DELETE', `/api/roles/${small}`, a.token)).status).toBe(204);
  });

  it('user.update cannot assign a role whose permissions exceed the actor’s (self-escalation PoC)', async () => {
    const big = await makeRole('Big Role', ['user.delete', 'role.delete', 'finance.invoice.delete']);
    const u = await actorWith(['user.view', 'user.update', 'user.create'], 'user-admin@hotel.com');
    const selfGrant = await call('PUT', `/api/users/${u.userId}/roles`, u.token, { roles: [u.roleId, big] });
    expect(selfGrant.status).toBe(403);
    expect(selfGrant.json.message).toMatch(/izin yang tidak Anda miliki/);
    expect((await call('POST', '/api/users', u.token, { name: 'Sneaky', email: 'sneaky@hotel.com', password: 'sneaky123', roles: [big] })).status).toBe(403);
    expect((await call('PATCH', `/api/users/${u.userId}`, u.token, { roles: [big] })).status).toBe(403);
    expect(rolesOf(u.userId)).toEqual([u.roleId]);
    const me = await call('GET', '/api/auth/me', u.token);
    expect(me.json.data.permissions).not.toContain('user.delete');
  });

  it('Super Admin is exempt from the subset rule (can grant anything, including to others)', async () => {
    const all = (await call('GET', '/api/permissions', admin)).json.data.map((p: { name: string }) => p.name) as string[];
    expect((await call('POST', '/api/roles', admin, { name: 'All Perms', permissions: all })).status).toBe(201);
    // Even if role-001 itself lacks a permission, its holder is not blocked.
    ctx.sqlite.prepare("DELETE FROM role_permissions WHERE role_id = 'role-001' AND permission_id = (SELECT id FROM permissions WHERE name = 'finance.expense.delete')").run();
    expect((await call('POST', '/api/roles', admin, { name: 'Has Expense Delete', permissions: ['finance.expense.delete'] })).status).toBe(201);
  });
});

describe('BE-007: an inactive role grants nothing (Super Admin immune)', () => {
  it('deactivating a role revokes its permissions immediately and reactivating restores them', async () => {
    const before = (await call('GET', '/api/auth/me', manager)).json.data.permissions as string[];
    expect(before.length).toBeGreaterThan(0);
    expect((await call('PATCH', '/api/roles/role-002', admin, { status: 'inactive' })).status).toBe(200);
    const me = await call('GET', '/api/auth/me', manager);
    expect(me.status).toBe(200); // the account still exists and can sign in
    expect(me.json.data.permissions).toEqual([]);
    expect(me.json.data.user.roles).toEqual(['role-002']); // shape unchanged
    expect((await call('GET', '/api/reservations', manager)).status).toBe(403);
    expect((await call('PATCH', '/api/roles/role-002', admin, { status: 'active' })).status).toBe(200);
    expect((await call('GET', '/api/auth/me', manager)).json.data.permissions.sort()).toEqual([...before].sort());
  });

  it('the seeded inactive Viewer role (role-004) grants nothing; only its active sibling roles count', async () => {
    const id = await makeUser('viewer@hotel.com', ['role-004']);
    const token = await loginAs(ctx.app, ctx.env, 'viewer@hotel.com', 'person123');
    expect((await call('GET', '/api/auth/me', token)).json.data.permissions).toEqual([]);
    expect((await call('GET', '/api/rooms', token)).status).toBe(403);
    expect((await call('PUT', `/api/users/${id}/roles`, admin, { roles: ['role-004', 'role-005'] })).status).toBe(200);
    const perms = (await call('GET', '/api/auth/me', token)).json.data.permissions as string[];
    expect(perms).toContain('activity.view');
    expect(perms.sort()).toEqual(['activity.view', 'reservation.checkin', 'reservation.checkout', 'reservation.create', 'reservation.view', 'room.view']);
  });

  it('login response reflects only active roles', async () => {
    await call('PATCH', '/api/roles/role-003', admin, { status: 'inactive' });
    const res = await call('POST', '/api/auth/login', undefined, { email: 'staff@hotel.com', password: 'staff123' });
    expect(res.status).toBe(200);
    expect(res.json.data.permissions).toEqual([]);
  });

  it('Super Admin stays fully privileged even if role-001 is marked inactive directly in the database', async () => {
    ctx.sqlite.prepare("UPDATE roles SET status = 'inactive' WHERE id = 'role-001'").run();
    const me = await call('GET', '/api/auth/me', admin);
    expect(me.status).toBe(200);
    expect(me.json.data.permissions).toContain('permission.assign');
    expect((await call('GET', '/api/users', admin)).status).toBe(200);
  });
});
