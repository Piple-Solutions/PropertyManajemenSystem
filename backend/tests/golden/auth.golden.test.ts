import { afterEach, describe, expect, it } from 'vitest';
import { startGolden, unfreezeClock } from '../helpers/golden';

afterEach(() => unfreezeClock());

describe('golden: auth (current happy paths)', () => {
  it('login, me, logout, change-password, forgot/reset password', async () => {
    const { rec, admin } = await startGolden();

    await rec.call('login admin', 'POST', '/api/auth/login', undefined, { email: 'admin@hotel.com', password: 'admin123' });
    await rec.call('login email is case/space insensitive', 'POST', '/api/auth/login', undefined, {
      email: '  Manager@Hotel.com ',
      password: 'manager123',
    });
    await rec.call('login wrong password', 'POST', '/api/auth/login', undefined, { email: 'admin@hotel.com', password: 'nope-nope' });
    await rec.call('login unknown email', 'POST', '/api/auth/login', undefined, { email: 'ghost@hotel.com', password: 'whatever1' });
    await rec.call('login inactive user', 'POST', '/api/auth/login', undefined, { email: 'inactive@hotel.com', password: 'inactive123' });
    await rec.call('login invalid body', 'POST', '/api/auth/login', undefined, { email: 'not-an-email', password: '' });

    await rec.call('me (admin)', 'GET', '/api/auth/me', admin);
    await rec.call('me without token', 'GET', '/api/auth/me');
    await rec.call('me with garbage token', 'GET', '/api/auth/me', 'garbage');

    // Use a dedicated account so the shared admin token stays valid.
    const login = await rec.call('login another', 'POST', '/api/auth/login', undefined, {
      email: 'another@hotel.com',
      password: 'another123',
    });
    const anotherToken = login.json.data.token as string;
    await rec.call('change-password wrong current', 'POST', '/api/auth/change-password', anotherToken, {
      currentPassword: 'bad-bad', newPassword: 'newpass123',
    });
    await rec.call('change-password ok', 'POST', '/api/auth/change-password', anotherToken, {
      currentPassword: 'another123', newPassword: 'newpass123',
    });
    await rec.call('old token rejected after change', 'GET', '/api/auth/me', anotherToken);
    await rec.call('login with new password', 'POST', '/api/auth/login', undefined, { email: 'another@hotel.com', password: 'newpass123' });

    const forgot = await rec.call('forgot-password (existing, local origin)', 'POST', '/api/auth/forgot-password', undefined, {
      email: 'another@hotel.com',
    });
    await rec.call('forgot-password (unknown email, generic)', 'POST', '/api/auth/forgot-password', undefined, { email: 'ghost@hotel.com' });
    const resetToken = forgot.json.data.resetToken as string;
    expect(typeof resetToken).toBe('string');
    await rec.call('reset-password invalid token', 'POST', '/api/auth/reset-password', undefined, { token: 'invalid', newPassword: 'resetpass1' });
    await rec.call('reset-password ok', 'POST', '/api/auth/reset-password', undefined, { token: resetToken, newPassword: 'resetpass1' });
    await rec.call('reset-password token reuse rejected', 'POST', '/api/auth/reset-password', undefined, { token: resetToken, newPassword: 'resetpass2' });
    await rec.call('login after reset', 'POST', '/api/auth/login', undefined, { email: 'another@hotel.com', password: 'resetpass1' });

    await rec.call('logout', 'POST', '/api/auth/logout', admin);
    await rec.call('logout without token', 'POST', '/api/auth/logout');
    await rec.call('unknown route', 'GET', '/api/does-not-exist', admin);
    await rec.call('health', 'GET', '/api/health');

    await expect(rec.serialize()).toMatchFileSnapshot('./snapshots/auth.json');
  });
});
