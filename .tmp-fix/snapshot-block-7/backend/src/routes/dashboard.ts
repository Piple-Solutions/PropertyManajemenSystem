import { Hono } from 'hono';
import type { AppEnv } from '../env';
import type { AppDb } from '../db/client';
import { ok } from '../lib/errors';
import { authenticate, type AuthContext } from '../middleware/auth';
import { requireAnyPermission } from '../middleware/rbac';
import { getDashboardOverview } from '../services/dashboardService';

type Vars = { db: AppDb; auth: AuthContext };

/**
 * Dashboard aggregates. Single server-computed overview (reservation + room
 * metrics) so the client no longer downloads full lists. Revenue/sales/
 * invoice/expense figures are intentionally absent — Finance stays deferred.
 */
const dashboard = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

dashboard.use('*', authenticate);

dashboard.get(
  '/overview',
  requireAnyPermission('reservation.view', 'room.view'),
  async (c) => ok(c, await getDashboardOverview(c.get('db'))),
);

export default dashboard;
