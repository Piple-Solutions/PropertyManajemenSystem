import { afterEach, describe, it, expect } from 'vitest';
import { startGolden, unfreezeClock } from '../helpers/golden';

afterEach(() => unfreezeClock());

describe('golden: users, roles, permissions (current happy paths)', () => {
  it('users CRUD, status, roles', async () => {
    const { rec, admin, staff } = await startGolden();

    await rec.call('list users', 'GET', '/api/users?page=1&pageSize=100', admin);
    await rec.call('list users filtered', 'GET', '/api/users?search=staff&status=active&page=1&pageSize=10', admin);
    await rec.call('get user', 'GET', '/api/users/user-003', admin);
    await rec.call('get user 404', 'GET', '/api/users/nope', admin);
    await rec.call('staff cannot list users (403)', 'GET', '/api/users', staff);
    await rec.call('list users without token', 'GET', '/api/users');

    const created = await rec.call('create user', 'POST', '/api/users', admin, {
      name: 'Golden User', email: 'Golden@Hotel.com', password: 'golden123', roles: ['role-003'],
    });
    const id = created.json.data.id as string;
    expect(typeof id).toBe('string');
    await rec.call('create user duplicate email', 'POST', '/api/users', admin, {
      name: 'Golden User', email: 'golden@hotel.com', password: 'golden123', roles: ['role-003'],
    });
    await rec.call('create user unknown role', 'POST', '/api/users', admin, {
      name: 'Golden Two', email: 'golden2@hotel.com', password: 'golden123', roles: ['role-999'],
    });
    await rec.call('create user invalid', 'POST', '/api/users', admin, { name: 'G', email: 'x', password: '1', roles: [] });
    await rec.call('patch user', 'PATCH', `/api/users/${id}`, admin, { name: 'Golden Renamed' });
    await rec.call('patch user email clash', 'PATCH', `/api/users/${id}`, admin, { email: 'admin@hotel.com' });
    await rec.call('set status inactive', 'PATCH', `/api/users/${id}/status`, admin, { status: 'inactive' });
    await rec.call('set status active', 'PATCH', `/api/users/${id}/status`, admin, { status: 'active' });
    await rec.call('cannot deactivate self', 'PATCH', '/api/users/user-001/status', admin, { status: 'inactive' });
    await rec.call('set roles', 'PUT', `/api/users/${id}/roles`, admin, { roles: ['role-005', 'role-003'] });
    await rec.call('delete user', 'DELETE', `/api/users/${id}`, admin);
    await rec.call('delete user again 404', 'DELETE', `/api/users/${id}`, admin);
    await rec.call('cannot delete self', 'DELETE', '/api/users/user-001', admin);

    await expect(rec.serialize()).toMatchFileSnapshot('./snapshots/users.json');
  });

  it('roles + permissions CRUD', async () => {
    const { rec, admin, staff } = await startGolden();

    await rec.call('list permissions', 'GET', '/api/permissions', admin);
    await rec.call('list roles', 'GET', '/api/roles?page=1&pageSize=100', admin);
    await rec.call('list roles filtered', 'GET', '/api/roles?search=man&status=active', admin);
    await rec.call('get role', 'GET', '/api/roles/role-002', admin);
    await rec.call('get role 404', 'GET', '/api/roles/nope', admin);
    await rec.call('staff cannot create role (403)', 'POST', '/api/roles', staff, { name: 'Nope Role' });

    const created = await rec.call('create role', 'POST', '/api/roles', admin, {
      name: 'Golden Role', description: 'for golden test', permissions: ['room.view', 'reservation.view'],
    });
    const id = created.json.data.id as string;
    expect(typeof id).toBe('string');
    await rec.call('create role duplicate name', 'POST', '/api/roles', admin, { name: 'Golden Role' });
    await rec.call('create role unknown permission', 'POST', '/api/roles', admin, { name: 'Bad Perm Role', permissions: ['does.not.exist'] });
    await rec.call('patch role', 'PATCH', `/api/roles/${id}`, admin, { description: 'edited', status: 'inactive' });
    await rec.call('set role permissions', 'PUT', `/api/roles/${id}/permissions`, admin, { permissions: ['room.view', 'activity.view'] });
    await rec.call('get created role', 'GET', `/api/roles/${id}`, admin);
    await rec.call('delete role', 'DELETE', `/api/roles/${id}`, admin);
    await rec.call('delete role again 404', 'DELETE', `/api/roles/${id}`, admin);
    await rec.call('delete role in use (409)', 'DELETE', '/api/roles/role-003', admin);

    await expect(rec.serialize()).toMatchFileSnapshot('./snapshots/roles.json');
  });
});
