import { Hono } from 'hono';
import type { AppEnv } from '../env';
import type { AppDb } from '../db/client';
import { eq } from 'drizzle-orm';
import { roomTypes } from '../db/schema';
import { ok } from '../lib/errors';
import { toPublicRoomType } from '../lib/presenters';
import { holidaysQuerySchema, parseOr422 } from '../lib/validation';
import { getHolidaysForYear } from '../services/holidayService';
import type { AuthContext } from '../middleware/auth';

type Vars = { db: AppDb; auth: AuthContext };

/**
 * Public (no-auth) catalog used by the homepage `Rooms & Suites` section.
 * Returns ACTIVE room types only. No pagination — the homepage slices the
 * first three client-side, `/rooms` can fetch the full list the same way.
 * Kept intentionally narrow: only what the public site needs.
 */
const pub = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

pub.get('/room-types', async (c) => {
  const rows = await c.get('db').select().from(roomTypes).where(eq(roomTypes.status, 'active'));
  rows.sort((a, b) => (a.name < b.name ? -1 : 1));
  return ok(c, rows.map(toPublicRoomType));
});

/**
 * Indonesian public holidays for one year, proxied + normalized from upstream
 * (see `services/holidayService.ts`). Read-only and unauthenticated: holidays
 * are public reference data and the homepage/public pages may want them.
 *
 * Never fails the request when upstream is down — it returns `available: false`
 * with an empty `days` array so the calendar still renders reservations. An
 * unpublished year is likewise a normal empty result, not an error.
 */
pub.get('/holidays', async (c) => {
  const query = parseOr422(holidaysQuerySchema, {
    year: c.req.query('year'),
    force: c.req.query('force'),
  });
  return ok(
    c,
    await getHolidaysForYear(query.year, {
      force: query.force,
      sourceUrl: c.env.HOLIDAY_SOURCE_URL,
    }),
  );
});

export default pub;
