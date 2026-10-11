import { afterEach, describe, it, expect } from 'vitest';
import { startGolden, unfreezeClock } from '../helpers/golden';

afterEach(() => unfreezeClock());

describe('golden: rooms and room types (current happy paths)', () => {
  it('room types CRUD + public catalog', async () => {
    const { rec, admin, staff } = await startGolden();

    await rec.call('list room types', 'GET', '/api/room-types?page=1&pageSize=100', admin);
    await rec.call('filter room types', 'GET', '/api/room-types?search=fam&status=active', staff);
    await rec.call('get room type', 'GET', '/api/room-types/room-type-004', staff);
    await rec.call('get room type 404', 'GET', '/api/room-types/nope', staff);
    const created = await rec.call('create room type', 'POST', '/api/room-types', admin, {
      name: 'Golden Suite', description: 'golden', capacity: 3, facilities: ['WiFi'], defaultRate: 900000, images: [],
    });
    const id = created.json.data.id as string;
    expect(typeof id).toBe('string');
    await rec.call('duplicate room type name', 'POST', '/api/room-types', admin, {
      name: 'Golden Suite', description: 'golden', capacity: 3, defaultRate: 900000,
    });
    await rec.call('patch room type', 'PATCH', `/api/room-types/${id}`, admin, { capacity: 4, facilities: ['WiFi', 'TV'] });
    await rec.call('toggle room type status', 'PATCH', `/api/room-types/${id}/status`, admin, { status: 'inactive' });
    await rec.call('delete room type', 'DELETE', `/api/room-types/${id}`, admin);
    await rec.call('delete room type in use (409)', 'DELETE', '/api/room-types/room-type-001', admin);
    await rec.call('staff cannot create room type (403)', 'POST', '/api/room-types', staff, {
      name: 'Nope', description: 'x', capacity: 1, defaultRate: 1,
    });
    await rec.call('public room types', 'GET', '/api/public/room-types');

    await expect(rec.serialize()).toMatchFileSnapshot('./snapshots/room-types.json');
  });

  it('rooms CRUD', async () => {
    const { rec, admin, staff } = await startGolden();

    await rec.call('list rooms', 'GET', '/api/rooms?page=1&pageSize=100', staff);
    await rec.call('filter rooms by type', 'GET', '/api/rooms?roomTypeId=room-type-004&status=active', staff);
    await rec.call('search rooms', 'GET', '/api/rooms?search=1&page=1&pageSize=5', staff);
    await rec.call('get room', 'GET', '/api/rooms/room-04', staff);
    await rec.call('get room 404', 'GET', '/api/rooms/nope', staff);
    const created = await rec.call('create room', 'POST', '/api/rooms', admin, { roomNumber: 'G-1', roomTypeId: 'room-type-001' });
    const id = created.json.data.id as string;
    expect(typeof id).toBe('string');
    await rec.call('duplicate room number', 'POST', '/api/rooms', admin, { roomNumber: 'G-1', roomTypeId: 'room-type-001' });
    await rec.call('unknown room type', 'POST', '/api/rooms', admin, { roomNumber: 'G-2', roomTypeId: 'nope' });
    await rec.call('patch room', 'PATCH', `/api/rooms/${id}`, admin, { roomNumber: 'G-1B', status: 'maintenance' });
    await rec.call('toggle room status', 'PATCH', `/api/rooms/${id}/status`, admin, { status: 'active' });
    await rec.call('delete room', 'DELETE', `/api/rooms/${id}`, admin);
    await rec.call('staff cannot create room (403)', 'POST', '/api/rooms', staff, { roomNumber: 'X', roomTypeId: 'room-type-001' });

    await expect(rec.serialize()).toMatchFileSnapshot('./snapshots/rooms.json');
  });
});
