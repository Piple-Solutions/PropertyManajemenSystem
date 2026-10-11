import { Hono } from 'hono';
import type { AppEnv } from '../env';
import type { AppDb } from '../db/client';
import { badRequest, ok, paginated } from '../lib/errors';
import { auditActor, auditIp } from '../lib/audit';
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
  const created = await createExpense(c.get('db'), body);
  const actor = auditActor(getAuth(c));
  await recordActivity(c.get('db'), {
    category: 'finance',
    action: 'expense_create',
    description: `Recorded expense ${created.description} (${created.category})`,
    userId: actor.id,
    userName: actor.name,
    entityType: 'expense',
    entityId: created.id,
    metadata: { category: created.category, amount: String(created.amount) },
    ipAddress: auditIp(c),
  });
  return c.json({ data: created }, 201);
});

expenses.patch('/:id', requirePermissions('finance.expense.update'), async (c) => {
  const body = parseOr422(updateExpenseSchema, await c.req.json().catch(() => ({})));
  const updated = await updateExpense(c.get('db'), pathParam(c, 'id'), body);
  const actor = auditActor(getAuth(c));
  await recordActivity(c.get('db'), {
    category: 'finance',
    action: 'expense_update',
    description: `Updated expense ${updated.description} (${updated.category})`,
    userId: actor.id,
    userName: actor.name,
    entityType: 'expense',
    entityId: updated.id,
    metadata: { category: updated.category, amount: String(updated.amount) },
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
    metadata: { category: existing.category, amount: String(existing.amount) },
    ipAddress: auditIp(c),
  });
  return c.body(null, 204);
});

export default expenses;
