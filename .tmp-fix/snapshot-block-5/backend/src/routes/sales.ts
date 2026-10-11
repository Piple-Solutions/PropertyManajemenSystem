import { Hono } from 'hono';
import type { AppEnv } from '../env';
import type { AppDb } from '../db/client';
import { badRequest, ok, paginated } from '../lib/errors';
import { parseOr422, salesListQuerySchema } from '../lib/validation';
import { authenticate, type AuthContext } from '../middleware/auth';
import { requirePermissions } from '../middleware/rbac';
import { listSales, salesSourceBreakdown } from '../services/salesService';

type Vars = { db: AppDb; auth: AuthContext };

/** Read-only derived sales — no write endpoints (no sales table exists). */
const sales = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

sales.use('*', authenticate);

sales.get('/', requirePermissions('finance.sales.view'), async (c) => {
  const query = parseOr422(salesListQuerySchema, {
    start: c.req.query('start'),
    end: c.req.query('end'),
    source: c.req.query('source'),
    page: c.req.query('page'),
    pageSize: c.req.query('pageSize'),
  });
  if (query.start && query.end && query.end < query.start) throw badRequest('`end` must be on or after `start`.');
  const { items, total } = await listSales(c.get('db'), query);
  return paginated(c, items, { page: query.page, pageSize: query.pageSize, total });
});

sales.get('/breakdown', requirePermissions('finance.sales.view'), async (c) => {
  const start = c.req.query('start') ?? '';
  const end = c.req.query('end') ?? '';
  return ok(c, await salesSourceBreakdown(c.get('db'), start, end));
});

export default sales;

