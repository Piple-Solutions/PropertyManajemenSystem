import { Hono } from 'hono';
import type { AppEnv } from '../env';
import type { AppDb } from '../db/client';
import { badRequest, ok } from '../lib/errors';
import { parseOr422, reportSummaryQuerySchema } from '../lib/validation';
import { authenticate, type AuthContext } from '../middleware/auth';
import { requirePermissions } from '../middleware/rbac';
import { getReportSummary, getTopInvoices } from '../services/reportService';

type Vars = { db: AppDb; auth: AuthContext };

/** Financial report summary (server-computed; export/print stay client-side). */
const reports = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

reports.use('*', authenticate);

reports.get('/summary', requirePermissions('finance.report.view'), async (c) => {
  const query = parseOr422(reportSummaryQuerySchema, {
    start: c.req.query('start'),
    end: c.req.query('end'),
    categories: c.req.query('categories'),
  });
  if (query.end < query.start) throw badRequest('`end` must be on or after `start`.');
  const categories = query.categories
    ? query.categories.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  return ok(c, await getReportSummary(c.get('db'), query.start, query.end, categories));
});

reports.get('/top-invoices', requirePermissions('finance.report.view'), async (c) => {
  const raw = Number(c.req.query('limit') ?? 5);
  const limit = Number.isInteger(raw) && raw >= 1 && raw <= 50 ? raw : 5;
  return ok(c, await getTopInvoices(c.get('db'), limit));
});

export default reports;
