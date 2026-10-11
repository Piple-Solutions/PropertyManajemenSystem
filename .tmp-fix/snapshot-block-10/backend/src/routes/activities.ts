import { Hono } from 'hono';
import type { AppEnv } from '../env';
import type { AppDb } from '../db/client';
import { ok, paginated } from '../lib/errors';
import { activityListQuerySchema, parseOr422, pathParam } from '../lib/validation';
import { authenticate, type AuthContext } from '../middleware/auth';
import { requirePermissions } from '../middleware/rbac';
import { getActivity, listActivities } from '../services/activityService';

type Vars = { db: AppDb; auth: AuthContext };

/**
 * Read-only audit log. There are deliberately NO write endpoints: rows are
 * appended server-side by audit hooks in the auth / reservation / room /
 * room-type routes after trusted mutations succeed.
 */
const activities = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

activities.use('*', authenticate);

activities.get('/', requirePermissions('activity.view'), async (c) => {
  const query = parseOr422(activityListQuerySchema, {
    search: c.req.query('search'),
    category: c.req.query('category'),
    userId: c.req.query('userId'),
    page: c.req.query('page'),
    pageSize: c.req.query('pageSize'),
  });
  const { items, total } = await listActivities(c.get('db'), query);
  return paginated(c, items, { page: query.page, pageSize: query.pageSize, total });
});

activities.get('/:id', requirePermissions('activity.view'), async (c) => {
  return ok(c, await getActivity(c.get('db'), pathParam(c, 'id')));
});

export default activities;
