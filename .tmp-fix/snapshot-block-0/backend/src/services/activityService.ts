import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { activities } from '../db/schema';
import type { AppDb } from '../db/client';
import { notFound } from '../lib/errors';
import { toPublicActivity, type PublicActivity } from '../lib/presenters';
import { newId, nowIso } from '../lib/tokens';
import type { ActivityListQuery } from '../lib/validation';

export interface RecordActivityInput {
  category: 'authentication' | 'reservation' | 'finance' | 'system';
  action: string;
  description: string;
  userId: string;
  userName: string;
  entityType?: string;
  entityId?: string;
  /** Values are coerced to strings — matches `Record<string, string>`. */
  metadata?: Record<string, string | number | boolean>;
  ipAddress?: string;
  /** Override for seed imports (defaults to now). */
  createdAt?: string;
}

function toMetadataJson(metadata: RecordActivityInput['metadata']): string {
  if (!metadata) return '{}';
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(metadata)) {
    out[k] = String(v);
  }
  return JSON.stringify(out);
}

/**
 * Append one audit row. Called ONLY by server-side audit hooks after a
 * trusted mutation succeeds — there is no public write API, so the frontend
 * can never fabricate audit records. Never stores secrets (passwords,
 * hashes, tokens).
 */
export async function recordActivity(db: AppDb, input: RecordActivityInput): Promise<PublicActivity> {
  const action = input.action.trim();
  if (!action) throw new Error('recordActivity requires a non-empty action');
  const now = input.createdAt ?? nowIso();
  const id = newId('act');
  await db.insert(activities).values({
    id,
    category: input.category,
    action,
    description: input.description ?? '',
    userId: input.userId,
    userName: input.userName ?? '',
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: toMetadataJson(input.metadata),
    ipAddress: input.ipAddress,
    createdAt: now,
  });
  const rows = await db.select().from(activities).where(eq(activities.id, id)).limit(1);
  return toPublicActivity(rows[0]);
}

export async function listActivities(
  db: AppDb,
  query: ActivityListQuery,
): Promise<{ items: PublicActivity[]; total: number }> {
  const conditions = [];
  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(or(like(activities.description, pattern), like(activities.userName, pattern)));
  }
  if (query.category !== 'all') conditions.push(eq(activities.category, query.category));
  if (query.userId) conditions.push(eq(activities.userId, query.userId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(activities)
    .where(where);
  const total = Number(totalRows[0]?.count ?? 0);

  const offset = (query.page - 1) * query.pageSize;
  const rows = await db
    .select()
    .from(activities)
    .where(where)
    .orderBy(desc(activities.createdAt), desc(activities.id))
    .limit(query.pageSize)
    .offset(offset);

  return { items: rows.map(toPublicActivity), total };
}

export async function getActivity(db: AppDb, id: string): Promise<PublicActivity> {
  const rows = await db.select().from(activities).where(eq(activities.id, id)).limit(1);
  const row = rows[0] as (typeof rows)[number] | undefined;
  if (!row) throw notFound('Activity not found');
  return toPublicActivity(row);
}
