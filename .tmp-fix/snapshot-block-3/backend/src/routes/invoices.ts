import { Hono } from 'hono';
import type { AppEnv } from '../env';
import type { AppDb } from '../db/client';
import { badRequest, ok, paginated } from '../lib/errors';
import { auditActor, auditIp } from '../lib/audit';
import {
  createInvoiceSchema,
  invoiceListQuerySchema,
  parseOr422,
  pathParam,
  updateInvoiceSchema,
} from '../lib/validation';
import { authenticate, getAuth, type AuthContext } from '../middleware/auth';
import { requirePermissions } from '../middleware/rbac';
import { recordActivity } from '../services/activityService';
import {
  cancelInvoice,
  createInvoice,
  deleteInvoice,
  getInvoice,
  listInvoices,
  nextInvoiceNumber,
  payInvoice,
  sendInvoice,
  updateInvoice,
} from '../services/invoiceService';

type Vars = { db: AppDb; auth: AuthContext };

const invoices = new Hono<{ Bindings: AppEnv; Variables: Vars }>();

invoices.use('*', authenticate);

function financeMeta(inv: { invoiceNumber: string; guestName: string; total: number }) {
  return { invoiceNumber: inv.invoiceNumber, guestName: inv.guestName, total: String(inv.total) };
}

invoices.get('/', requirePermissions('finance.invoice.view'), async (c) => {
  const query = parseOr422(invoiceListQuerySchema, {
    search: c.req.query('search'),
    status: c.req.query('status'),
    payment: c.req.query('payment'),
    source: c.req.query('source'),
    start: c.req.query('start'),
    end: c.req.query('end'),
    page: c.req.query('page'),
    pageSize: c.req.query('pageSize'),
  });
  if (query.start && query.end && query.end < query.start) throw badRequest('`end` must be on or after `start`.');
  const { items, total } = await listInvoices(c.get('db'), query);
  return paginated(c, items, { page: query.page, pageSize: query.pageSize, total });
});

invoices.get('/next-number', requirePermissions('finance.invoice.create'), async (c) => {
  const date = c.req.query('date') ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest('`date` must be YYYY-MM-DD.');
  return ok(c, { invoiceNumber: await nextInvoiceNumber(c.get('db'), date) });
});

invoices.get('/:id', requirePermissions('finance.invoice.view'), async (c) => {
  return ok(c, await getInvoice(c.get('db'), pathParam(c, 'id')));
});

invoices.post('/', requirePermissions('finance.invoice.create'), async (c) => {
  const body = parseOr422(createInvoiceSchema, await c.req.json().catch(() => ({})));
  const created = await createInvoice(c.get('db'), body);
  const actor = auditActor(getAuth(c));
  await recordActivity(c.get('db'), {
    category: 'finance',
    action: 'invoice_create',
    description: `Created invoice ${created.invoiceNumber} for ${created.guestName}`,
    userId: actor.id,
    userName: actor.name,
    entityType: 'invoice',
    entityId: created.id,
    metadata: financeMeta(created),
    ipAddress: auditIp(c),
  });
  return c.json({ data: created }, 201);
});

invoices.patch('/:id', requirePermissions('finance.invoice.update'), async (c) => {
  const body = parseOr422(updateInvoiceSchema, await c.req.json().catch(() => ({})));
  const updated = await updateInvoice(c.get('db'), pathParam(c, 'id'), body);
  const actor = auditActor(getAuth(c));
  await recordActivity(c.get('db'), {
    category: 'finance',
    action: 'invoice_update',
    description: `Updated invoice ${updated.invoiceNumber} for ${updated.guestName}`,
    userId: actor.id,
    userName: actor.name,
    entityType: 'invoice',
    entityId: updated.id,
    metadata: financeMeta(updated),
    ipAddress: auditIp(c),
  });
  return ok(c, updated);
});

invoices.post('/:id/send', requirePermissions('finance.invoice.update'), async (c) => {
  const updated = await sendInvoice(c.get('db'), pathParam(c, 'id'));
  const actor = auditActor(getAuth(c));
  await recordActivity(c.get('db'), {
    category: 'finance',
    action: 'invoice_send',
    description: `Sent invoice ${updated.invoiceNumber} to ${updated.guestName}`,
    userId: actor.id,
    userName: actor.name,
    entityType: 'invoice',
    entityId: updated.id,
    metadata: financeMeta(updated),
    ipAddress: auditIp(c),
  });
  return ok(c, updated);
});

invoices.post('/:id/pay', requirePermissions('finance.invoice.update'), async (c) => {
  const updated = await payInvoice(c.get('db'), pathParam(c, 'id'));
  const actor = auditActor(getAuth(c));
  await recordActivity(c.get('db'), {
    category: 'finance',
    action: 'invoice_pay',
    description: `Marked invoice ${updated.invoiceNumber} as paid`,
    userId: actor.id,
    userName: actor.name,
    entityType: 'invoice',
    entityId: updated.id,
    metadata: financeMeta(updated),
    ipAddress: auditIp(c),
  });
  return ok(c, updated);
});

invoices.post('/:id/cancel', requirePermissions('finance.invoice.update'), async (c) => {
  const updated = await cancelInvoice(c.get('db'), pathParam(c, 'id'));
  const actor = auditActor(getAuth(c));
  await recordActivity(c.get('db'), {
    category: 'finance',
    action: 'invoice_cancel',
    description: `Cancelled invoice ${updated.invoiceNumber}`,
    userId: actor.id,
    userName: actor.name,
    entityType: 'invoice',
    entityId: updated.id,
    metadata: financeMeta(updated),
    ipAddress: auditIp(c),
  });
  return ok(c, updated);
});

invoices.delete('/:id', requirePermissions('finance.invoice.delete'), async (c) => {
  const id = pathParam(c, 'id');
  const existing = await getInvoice(c.get('db'), id);
  await deleteInvoice(c.get('db'), id);
  const actor = auditActor(getAuth(c));
  await recordActivity(c.get('db'), {
    category: 'finance',
    action: 'invoice_delete',
    description: `Deleted invoice ${existing.invoiceNumber}`,
    userId: actor.id,
    userName: actor.name,
    entityType: 'invoice',
    entityId: id,
    metadata: { invoiceNumber: existing.invoiceNumber },
    ipAddress: auditIp(c),
  });
  return c.body(null, 204);
});

export default invoices;
