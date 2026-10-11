import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN, loginAs, setupTestApp } from '../helpers/app';
import type { TestContext } from '../helpers/app';
import { backendRoot } from '../helpers/fake-d1';
import { freezeClock, unfreezeClock } from '../helpers/golden';

/**
 * SEED ROLE MATRIX (Block 0, 0.6) — actor role x action x target role.
 *
 * Records the HTTP status of every user/role administration action for each
 * seeded actor role against each seeded target role, on UNMODIFIED code. It
 * is the lockout-safety net for Block 2 (BE-002/003/007): the only cells that
 * may change are the ones where an actor acts on a role that outranks them
 * (listed in `.tmp-fix/role-matrix-notes.md`). Legitimate cells must keep
 * their status.
 *
 * Seeded roles: role-001 Super Admin, role-002 Manager, role-003 Staff,
 * role-004 Viewer (status=inactive!), role-005 Reception.
 */
const ROLES = ['role-001', 'role-002', 'role-003', 'role-004', 'role-005'] as const;
const ACTORS = ['role-001', 'role-002', 'role-003', 'role-005'] as const;
const ACTIONS = [
  'createUserWithRole',
  'assignRoleToStaffUser',
  'demoteUserHoldingRole',
  'deactivateUserHoldingRole',
  'changeEmailOfUserHoldingRole',
  'deleteUserHoldingRole',
  'createRoleCopyingRole',
  'setPermissionsOfCustomRoleToRole',
] as const;

afterEach(() => unfreezeClock());

interface Cell {
  ctx: TestContext;
  actorToken: string;
  targetUserId: string;
  staffUserId: string;
}

async function http(ctx: TestContext, method: string, path: string, token: string, body?: unknown) {
  const res = await ctx.app.request(
    path,
    {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    ctx.env,
  );
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

async function build(actorRole: string, targetRole: string): Promise<Cell> {
  freezeClock();
  const ctx = setupTestApp();
  const admin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);

  let actorToken = admin;
  if (actorRole !== 'role-001') {
    const email = `actor-${actorRole}@hotel.com`;
    const made = await http(ctx, 'POST', '/api/users', admin, { name: 'Matrix Actor', email, password: 'matrix123', roles: [actorRole] });
    expect(made.status).toBe(201);
    actorToken = await loginAs(ctx.app, ctx.env, email, 'matrix123');
  }
  const target = await http(ctx, 'POST', '/api/users', admin, {
    name: 'Matrix Target',
    email: `target-${targetRole}@hotel.com`,
    password: 'matrix123',
    roles: [targetRole],
  });
  expect(target.status).toBe(201);
  const staffUser = await http(ctx, 'POST', '/api/users', admin, {
    name: 'Matrix Staff',
    email: 'matrix-staff@hotel.com',
    password: 'matrix123',
    roles: ['role-003'],
  });
  expect(staffUser.status).toBe(201);
  return { ctx, actorToken, targetUserId: target.json.data.id, staffUserId: staffUser.json.data.id };
}

async function perform(action: (typeof ACTIONS)[number], cell: Cell, targetRole: string): Promise<number> {
  const { ctx, actorToken } = cell;
  switch (action) {
    case 'createUserWithRole':
      return (await http(ctx, 'POST', '/api/users', actorToken, { name: 'New Person', email: 'new-person@hotel.com', password: 'newperson1', roles: [targetRole] })).status;
    case 'assignRoleToStaffUser':
      return (await http(ctx, 'PUT', `/api/users/${cell.staffUserId}/roles`, actorToken, { roles: [targetRole] })).status;
    case 'demoteUserHoldingRole':
      return (await http(ctx, 'PUT', `/api/users/${cell.targetUserId}/roles`, actorToken, { roles: ['role-003'] })).status;
    case 'deactivateUserHoldingRole':
      return (await http(ctx, 'PATCH', `/api/users/${cell.targetUserId}/status`, actorToken, { status: 'inactive' })).status;
    case 'changeEmailOfUserHoldingRole':
      return (await http(ctx, 'PATCH', `/api/users/${cell.targetUserId}`, actorToken, { email: 'changed@hotel.com' })).status;
    case 'deleteUserHoldingRole':
      return (await http(ctx, 'DELETE', `/api/users/${cell.targetUserId}`, actorToken)).status;
    case 'createRoleCopyingRole': {
      const src = await http(ctx, 'GET', `/api/roles/${targetRole}`, actorToken);
      if (src.status !== 200) return src.status; // actor cannot even read roles
      return (await http(ctx, 'POST', '/api/roles', actorToken, { name: `Copy of ${targetRole}`, permissions: src.json.data.permissions })).status;
    }
    case 'setPermissionsOfCustomRoleToRole': {
      // Custom role is created by the Super Admin so that only the actor's own
      // permission checks are being measured.
      const adminLogin = await loginAs(ctx.app, ctx.env, ADMIN.email, ADMIN.password);
      const custom = await http(ctx, 'POST', '/api/roles', adminLogin, { name: 'Matrix Custom', permissions: [] });
      const src = await http(ctx, 'GET', `/api/roles/${targetRole}`, adminLogin);
      return (await http(ctx, 'PUT', `/api/roles/${custom.json.data.id}/permissions`, actorToken, { permissions: src.json.data.permissions })).status;
    }
  }
}

describe('seed role matrix', () => {
  it('records actor role x action x target role', async () => {
    const matrix: Record<string, Record<string, Record<string, number>>> = {};
    for (const actor of ACTORS) {
      matrix[actor] = {};
      for (const action of ACTIONS) {
        matrix[actor][action] = {};
        for (const target of ROLES) {
          const cell = await build(actor, target);
          matrix[actor][action][target] = await perform(action, cell, target);
          unfreezeClock();
        }
      }
    }
    await expect(JSON.stringify(matrix, null, 2) + '\n').toMatchFileSnapshot('./snapshots/role-matrix.json');
  }, 300_000);

  it('differs from the Block 0 baseline ONLY in the cells fixed by Block 2 (BE-002)', () => {
    const read = (name: string) =>
      JSON.parse(readFileSync(resolve(backendRoot, 'tests', 'golden', 'snapshots', name), 'utf8')) as Record<
        string,
        Record<string, Record<string, number>>
      >;
    const before = read('role-matrix.block0.json');
    const after = read('role-matrix.json');
    const changed: string[] = [];
    for (const actor of Object.keys(before)) {
      for (const action of Object.keys(before[actor])) {
        for (const target of Object.keys(before[actor][action])) {
          const a = before[actor][action][target];
          const b = after[actor][action][target];
          if (a !== b) changed.push(`${actor}|${action}|${target}|${a}->${b}`);
        }
      }
    }
    // A Manager can no longer demote, deactivate, or re-email a Super Admin.
    expect(changed.sort()).toEqual([
      'role-002|changeEmailOfUserHoldingRole|role-001|200->403',
      'role-002|deactivateUserHoldingRole|role-001|200->403',
      'role-002|demoteUserHoldingRole|role-001|200->403',
    ]);
  });
});
