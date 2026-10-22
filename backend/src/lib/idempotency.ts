import { SQL, and, eq, lt, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { idempotencyKeys } from '../db/schema';
import type { AppDb } from '../db/client';
import { isUniqueViolation } from './atomic';
import { ApiError, badRequest, conflict, toErrorBody, unprocessable } from './errors';
import { getAuth } from '../middleware/auth';
import { newId, nowIso } from './tokens';

/**
 * D1-backed idempotency for the create endpoints (approved design, Oct 2026).
 *
 * Only the two documented D1 guarantees are relied on (see `atomic.ts` and the
 * Cloudflare D1 docs): a single statement is atomic, and `batch()` runs its
 * statements inside ONE transaction that rolls back when ANY statement fails.
 * Notably, a statement that MATCHES 0 rows does NOT fail a batch — so a lost
 * claim is enforced with a loud constraint violation (the "tripwire"), never
 * with a silent no-op.
 *
 * Flow of a keyed request:
 *   1. claim    — INSERT a row keyed by (user, endpoint, key). A UNIQUE race
 *                 looks the existing row up and dispatches (replay / 422
 *                 mismatch / 409 in-flight / stale reclaim).
 *   2. execute  — the business batch appends, AFTER its own writes:
 *                   pivot    (UPDATE ... SET status='completed', entity_id=?)
 *                   tripwire (NOT NULL violation unless the pivot stamped
 *                             THIS execution's entity id)
 *                 Either both the entity rows and the pivot commit, or the
 *                 whole batch rolls back. Two executions of one key can never
 *                 both stamp their pivot: the loser's tripwire fires and its
 *                 epoch is rolled back entirely (single-entity guarantee).
 *   3. respond  — the exact `{ data }` envelope is stored for replay. A crash
 *                 between commit and response delivery leaves a `completed`
 *                 row with `entity_id`; a retry replays (rebuild from the
 *                 entity), never re-executing the business batch.
 *
 * Deterministic business 4xx are recorded as 'failed' and replayed verbatim.
 * Unexpected errors delete the in_progress row so the retry re-executes.
 */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
export const IDEMPOTENCY_REPLAYED_HEADER = 'Idempotency-Replayed';

/** Approved key contract: ^[A-Za-z0-9_-]{8,100}$. */
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

/**
 * A claim older than this is treated as a crash artifact and can be reclaimed
 * by a retry with the same fingerprint. Requests do not renew it; every
 * endpoint's total D1 work is far below this bound in practice.
 */
export const CLAIM_STALE_MS = 60_000;

/** Retention window (approved: 48h). Expired rows purge lazily and expire. */
export const RETENTION_MS = 48 * 60 * 60 * 1000;

/** Skip storing responses above this size; the rebuild path serves them. */
const MAX_STORED_BODY_CHARS = 131_072;

/** Lazy purge runs on ~2% of claims; a single bounded indexed statement. */
const PURGE_PROBABILITY = 0.02;

/** Seconds advertised in `Retry-After` while another request holds the key. */
const RETRY_AFTER_SECONDS = 2;

export const PAYLOAD_MISMATCH_MESSAGE =
  'Idempotency-Key was already used with a different request payload.';
const INFLIGHT_MESSAGE =
  'A request with this Idempotency-Key is still processing. Retry after the delay.';
const CONTENDED_MESSAGE = 'Idempotency-Key is contended. Please retry.';

/** Everything the business batch needs to stamp its own pivot + tripwire. */
export interface IdempotencyExecution {
  /** Authenticated owner of the key (cross-user replay is forbidden). */
  userId: string;
  /** Scope of the logical operation, e.g. 'POST /api/invoices'. */
  endpoint: string;
  key: string;
  /** SHA-256 hex of the canonicalized parsed request body. */
  requestHash: string;
  /** HTTP status returned by the original successful create (201). */
  successCode: number;
  /** ISO timestamp stamped on the pivot write. */
  now: string;
}

export interface IdempotentOutcome<T> {
  /** 'executed' = this request ran the business batch (route may audit). */
  mode: 'executed' | 'replayed';
  /** Fresh entity, only when mode === 'executed'. */
  data: T | null;
  /** Fully built response (status + headers) to return to the client. */
  response: Response;
}

interface WithIdempotencyOptions<T> {
  endpoint: string;
  /** The zod-PARSED body — fingerprint source, not the raw bytes. */
  body: unknown;
  successCode: number;
  /** Business operation. Receives `null` when no key was supplied (legacy). */
  execute: (execution: IdempotencyExecution | null) => Promise<T>;
  /** Crash recovery: rebuild the response entity from its persisted id. */
  rebuild: (db: AppDb, entityId: string) => Promise<T>;
}

/* ------------------------------------------------------------------ */
/* Payload fingerprint                                                 */
/* ------------------------------------------------------------------ */

/** Canonical JSON: object keys sorted recursively, `undefined` dropped. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** SHA-256 hex of the canonicalized (zod-parsed) body — Workers compatible. */
export async function fingerprintBody(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ------------------------------------------------------------------ */
/* Batch brackets (used INSIDE the business transaction)               */
/* ------------------------------------------------------------------ */

/**
 * Second-to-last statement of the business batch: flips the live claim row to
 * 'completed' and stamps THIS execution's entity id. `entityGuard` (optional)
 * restricts the flip to executions where the entity actually exists in this
 * batch — required for conditional inserts (reservation overlap guard), whose
 * header can legitimately write 0 rows without failing the batch.
 */
export function idempotencyPivot(execution: IdempotencyExecution, entityId: string, entityGuard?: SQL): SQL {
  return sql`
    UPDATE idempotency_keys SET status = 'completed', result_code = ${execution.successCode},
      entity_id = ${entityId}, updated_at = ${execution.now}
    WHERE user_id = ${execution.userId} AND endpoint = ${execution.endpoint} AND key = ${execution.key}
      AND request_hash = ${execution.requestHash} AND status = 'in_progress'
      ${entityGuard ? sql`AND ${entityGuard}` : sql``}`;
}

/**
 * Last statement: violates idempotency_keys.user_id's NOT NULL constraint
 * (rolling back the WHOLE batch) unless the pivot above stamped THIS
 * execution (same entity_id). A lost race therefore produces an error, not a
 * second entity; the wrapper converts it into a replay.
 * `entityGuard` mirrors `idempotencyPivot` (see above).
 */
export function idempotencyTripwire(execution: IdempotencyExecution, entityId: string, entityGuard?: SQL): SQL {
  return sql`
    INSERT INTO idempotency_keys (user_id) SELECT NULL
    WHERE ${entityGuard ? sql`${entityGuard} AND ` : sql``}NOT EXISTS (
      SELECT 1 FROM idempotency_keys
      WHERE user_id = ${execution.userId} AND endpoint = ${execution.endpoint} AND key = ${execution.key}
        AND request_hash = ${execution.requestHash} AND status = 'completed' AND entity_id = ${entityId}
    )`;
}

/** True when `err` is the tripwire's NOT NULL violation (a lost pivot race). */
export function isIdempotencyLostRace(err: unknown): boolean {
  let e: unknown = err;
  for (let depth = 0; depth < 4 && e; depth += 1) {
    const message = String((e as { message?: unknown }).message ?? e);
    if (message.includes('NOT NULL constraint failed') && message.includes('idempotency_keys.user_id')) {
      return true;
    }
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Row operations (outside the business batch)                         */
/* ------------------------------------------------------------------ */

type Scope = Pick<IdempotencyExecution, 'userId' | 'endpoint' | 'key' | 'requestHash'>;

function scopeWhere(scope: Scope) {
  return and(
    eq(idempotencyKeys.userId, scope.userId),
    eq(idempotencyKeys.endpoint, scope.endpoint),
    eq(idempotencyKeys.key, scope.key),
  );
}

type ClaimOutcome =
  | { kind: 'claimed' }
  | { kind: 'replay'; row: typeof idempotencyKeys.$inferSelect }
  | { kind: 'mismatch'; row: typeof idempotencyKeys.$inferSelect }
  | { kind: 'inflight'; row: typeof idempotencyKeys.$inferSelect }
  | { kind: 'contended' };

/** Claim a key, or classify an existing claim. Bounded loop under contention. */
async function claimKey(db: AppDb, scope: Scope, attemptsLeft = 3): Promise<ClaimOutcome> {
  if (attemptsLeft <= 0) return { kind: 'contended' };
  const now = nowIso();
  try {
    await db.insert(idempotencyKeys).values({
      userId: scope.userId,
      endpoint: scope.endpoint,
      key: scope.key,
      requestHash: scope.requestHash,
      status: 'in_progress',
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + RETENTION_MS).toISOString(),
    });
    maybePurgeExpired(db);
    return { kind: 'claimed' };
  } catch (err) {
    if (!isUniqueViolation(err, 'idempotency_keys.user_id')) throw err;
  }

  const row = await selectRow(db, scope);
  if (!row) {
    // The claim was reclaimed between our INSERT and this SELECT.
    return claimKey(db, scope, attemptsLeft - 1);
  }
  if (row.requestHash !== scope.requestHash) {
    return { kind: 'mismatch', row };
  }
  if (row.status !== 'in_progress') {
    return { kind: 'replay', row };
  }
  const updatedAt = Date.parse(row.updatedAt);
  if (!Number.isNaN(updatedAt) && Date.now() - updatedAt > CLAIM_STALE_MS) {
    // Crash artifact: the original request is presumed dead. Release and
    // re-claim. Losing the delete (another request acted first) just loops
    // once through the normal dispatch.
    await db
      .delete(idempotencyKeys)
      .where(and(scopeWhere(scope), eq(idempotencyKeys.status, 'in_progress')));
    return claimKey(db, scope, attemptsLeft - 1);
  }
  return { kind: 'inflight', row };
}

async function selectRow(db: AppDb, scope: Scope) {
  const rows = await db.select().from(idempotencyKeys).where(scopeWhere(scope)).limit(1);
  return rows[0];
}

/** Deterministic purge (expired rows only); also fired lazily on claims. */
export async function purgeExpiredIdempotencyKeys(db: AppDb): Promise<void> {
  await db.delete(idempotencyKeys).where(lt(idempotencyKeys.expiresAt, nowIso()));
}

function maybePurgeExpired(db: AppDb): void {
  if (Math.random() >= PURGE_PROBABILITY) return;
  void purgeExpiredIdempotencyKeys(db).catch(() => undefined);
}

/** Stamp the replay envelope after a successful business batch (best effort). */
async function storeResponseBody(db: AppDb, scope: Scope, envelope: unknown): Promise<void> {
  try {
    const text = JSON.stringify(envelope);
    if (text.length > MAX_STORED_BODY_CHARS) return; // rebuild path serves it
    await db
      .update(idempotencyKeys)
      .set({ responseBody: text })
      .where(and(scopeWhere(scope), eq(idempotencyKeys.status, 'completed')));
  } catch {
    // Benign: a missing body is rebuilt from entity_id on replay.
  }
}

/** Record a deterministic business 4xx so retries replay it verbatim. */
async function markFailed(db: AppDb, scope: Scope, status: number, body: string): Promise<void> {
  await db
    .update(idempotencyKeys)
    .set({ status: 'failed', resultCode: status, responseBody: body, updatedAt: nowIso() })
    .where(and(scopeWhere(scope), eq(idempotencyKeys.status, 'in_progress')));
}

/** Release an in_progress claim after an unexpected/transient failure. */
async function releaseClaim(db: AppDb, scope: Scope): Promise<void> {
  await db
    .delete(idempotencyKeys)
    .where(and(scopeWhere(scope), eq(idempotencyKeys.status, 'in_progress')));
}

/* ------------------------------------------------------------------ */
/* Route wrapper                                                       */
/* ------------------------------------------------------------------ */

/** Parse a stored envelope; malformed content is treated as absent. */
function parseStoredBody(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function okEnvelope<T>(c: Context, data: T, status: number): Response {
  return c.json({ data }, status as 200);
}

/** Build the replay response, stamping the diagnostic header. */
function replayResponse(c: Context, status: number, body: unknown): Response {
  c.header(IDEMPOTENCY_REPLAYED_HEADER, 'true');
  return c.json(body as Record<string, unknown>, status as 200);
}

/**
 * Run a create endpoint with optional `Idempotency-Key` support. Without the
 * header the legacy path executes verbatim (no key rows are touched).
 * Throws on malformed keys and payload mismatches; the returned response is
 * already complete for every replay/in-flight outcome.
 */
export async function withIdempotency<T>(
  c: Context,
  options: WithIdempotencyOptions<T>,
): Promise<IdempotentOutcome<T>> {
  const rawKey = c.req.header(IDEMPOTENCY_KEY_HEADER)?.trim();
  if (!rawKey) {
    const data = await options.execute(null);
    return { mode: 'executed', data, response: okEnvelope(c, data, options.successCode) };
  }
  if (!KEY_PATTERN.test(rawKey)) {
    throw badRequest('Idempotency-Key must match ^[A-Za-z0-9_-]{8,100}$.');
  }

  const db = c.get('db');
  const userId = getAuth(c).user.id;
  const scope: Scope & { userId: string } = {
    userId,
    endpoint: options.endpoint,
    key: rawKey,
    requestHash: await fingerprintBody(options.body),
  };

  const claim = await claimKey(db, scope);
  if (claim.kind === 'mismatch') throw unprocessable(PAYLOAD_MISMATCH_MESSAGE);
  if (claim.kind === 'contended') throw conflict(CONTENDED_MESSAGE);

  if (claim.kind === 'inflight') {
    c.header('Retry-After', String(RETRY_AFTER_SECONDS));
    return {
      mode: 'replayed',
      data: null,
      response: c.json({ message: INFLIGHT_MESSAGE }, 409),
    };
  }

  if (claim.kind === 'replay') {
    const response = await buildReplay(c, db, options, claim.row);
    return { mode: 'replayed', data: null, response };
  }

  // Fresh claim: execute with the bracket, then classify failures.
  const execution: IdempotencyExecution = { ...scope, successCode: options.successCode, now: nowIso() };
  try {
    const data = await options.execute(execution);
    const envelope = { data };
    const response = okEnvelope(c, data, execution.successCode);
    await storeResponseBody(db, execution, envelope);
    return { mode: 'executed', data, response };
  } catch (err) {
    if (isIdempotencyLostRace(err)) {
      // Another execution of this key committed first; serve its result.
      const row = await selectRow(db, execution);
      if (row && row.status === 'completed') {
        return { mode: 'replayed', data: null, response: await buildReplay(c, db, options, row) };
      }
      throw conflict(
        'Idempotency-Key was claimed concurrently. Please check the result and retry.',
      );
    }
    if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
      const { status, body } = toErrorBody(err);
      await markFailed(db, execution, status, JSON.stringify(body));
    } else {
      // Transient/unexpected: keep the key retryable, cache nothing.
      await releaseClaim(db, execution);
    }
    throw err;
  }
}

/** Serve a recorded outcome; rebuild from entity_id when the body is absent. */
async function buildReplay<T>(
  c: Context,
  db: AppDb,
  options: WithIdempotencyOptions<T>,
  row: typeof idempotencyKeys.$inferSelect,
): Promise<Response> {
  const code = row.resultCode ?? options.successCode;
  const stored = row.responseBody ? parseStoredBody(row.responseBody) : undefined;
  if (stored !== undefined) return replayResponse(c, code, stored);

  if (row.status === 'completed' && row.entityId) {
    // Crash between the business commit and the response store: rebuild.
    try {
      const data = await options.rebuild(db, row.entityId);
      void storeResponseBody(db, row, { data });
      return replayResponse(c, code, { data });
    } catch {
      // The entity vanished later (e.g. admin delete). Release so the next
      // attempt can re-execute instead of dead-end replaying forever.
      await releaseClaim(db, row);
      return replayResponse(
        c,
        500,
        { message: 'Idempotency-Key response could not be reconstructed. Please retry.' },
      );
    }
  }
  if (row.status === 'failed') {
    // A recorded failure must always carry its body; retain honesty on gaps.
    return replayResponse(c, code, { message: 'Idempotency-Key failure record is incomplete.' });
  }
  // 'completed' without entity_id is a hand-corrupted (or future-schema) row.
  throw conflict(CONTENDED_MESSAGE);
}
