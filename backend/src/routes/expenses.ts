import { Hono } from 'hono';
import type { AppEnv } from '../env';
import type { AppDb } from '../db/client';
import { badRequest, ok, paginated } from '../lib/errors';
import { auditActor, auditIp, withPrefix } from '../lib/audit';
import {
  createExpenseSchema,
  expenseListQuerySchema,
  parseOr422,
  pathParam,
  updateExpenseSchema,
} from '../lib/validation';
import { authenticate, getAuth, type AuthContext } from '../middleware/auth';
import { requirePermissions } from '../middleware/rbac';
import { recordActivity } from '../services/activityService';
import { withIdempotency } from '../lib/idempotency';
import { createExpense, deleteExpense, getExpense, listExpenses, updateExpense } from '../services/expenseService';

type Vars = { db: AppDb; auth: AuthContext };

const expenses = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

expenses.use('*', authenticate);

expenses.get('/', requirePermissions('finance.expense.view'), async (c) => {
  const query = parseOr422(expenseListQuerySchema, {
    search: c.req.query('search'),
    category: c.req.query('category'),
    status: c.req.query('status'),
    start: c.req.query('start'),
    end: c.req.query('end'),
    page: c.req.query('page'),
    pageSize: c.req.query('pageSize'),
  });
  if (query.start && query.end && query.end < query.start) throw badRequest('`end` must be on or after `start`.');
  const { items, total } = await listExpenses(c.get('db'), query);
  return paginated(c, items, { page: query.page, pageSize: query.pageSize, total });
});

expenses.get('/:id', requirePermissions('finance.expense.view'), async (c) => {
  return ok(c, await getExpense(c.get('db'), pathParam(c, 'id')));
});

expenses.post('/', requirePermissions('finance.expense.create'), async (c) => {
  const body = parseOr422(createExpenseSchema, await c.req.json().catch(() => ({})));
  const outcome = await withIdempotency(c, {
    endpoint: 'POST /api/expenses',
    body,
    successCode: 201,
    execute: (execution) => createExpense(c.get('db'), body, execution ?? undefined),
    rebuild: (db, entityId) => getExpense(db, entityId),
  });
  if (outcome.mode === 'executed' && outcome.data) {
    const actor = auditActor(getAuth(c));
    await recordActivity(c.get('db'), {
      category: 'finance',
      action: 'expense_create',
      description: `Recorded expense ${outcome.data.description} (${outcome.data.category})`,
      userId: actor.id,
      userName: actor.name,
      entityType: 'expense',
      entityId: outcome.data.id,
      metadata: { category: outcome.data.category, amount: String(outcome.data.amount) },
      ipAddress: auditIp(c),
    });
  }
  return outcome.response;
});

expenses.patch('/:id', requirePermissions('finance.expense.update'), async (c) => {
  const body = parseOr422(updateExpenseSchema, await c.req.json().catch(() => ({})));
  let before: Record<string, string> = {};
  const updated = await updateExpense(c.get('db'), pathParam(c, 'id'), body, (row) => {
    before = withPrefix('before', { date: row.date, category: row.category, amount: row.amount, status: row.status });
  });
  const actor = auditActor(getAuth(c));
  await recordActivity(c.get('db'), {
    category: 'finance',
    action: 'expense_update',
    description: `Updated expense ${updated.description} (${updated.category})`,
    userId: actor.id,
    userName: actor.name,
    entityType: 'expense',
    entityId: updated.id,
metadata: {
      category: updated.category,
      amount: String(updated.amount),
      ...before,
      ...withPrefix('after', { date: updated.date, category: updated.category, amount: updated.amount, status: updated.status }),
    },
    ipAddress: auditIp(c),
  });
  return ok(c, updated);
});

expenses.delete('/:id', requirePermissions('finance.expense.delete'), async (c) => {
  const id = pathParam(c, 'id');
  const existing = await getExpense(c.get('db'), id);
  await deleteExpense(c.get('db'), id);
  const actor = auditActor(getAuth(c));
  await recordActivity(c.get('db'), {
    category: 'finance',
    action: 'expense_delete',
    description: `Deleted expense ${existing.description} (${existing.category})`,
    userId: actor.id,
    userName: actor.name,
    entityType: 'expense',
    entityId: id,
    metadata: {
      category: existing.category,
      amount: String(existing.amount),
      ...withPrefix('before', { date: existing.date, category: existing.category, amount: existing.amount, status: existing.status }),
    },
    ipAddress: auditIp(c),
  });
  return c.body(null, 204);
});

export default expenses;
