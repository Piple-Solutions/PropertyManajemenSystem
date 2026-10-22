/**
 * Idempotency key lifecycle for the three create submissions (invoices,
 * expenses, reservations) — pairs with the backend `Idempotency-Key` support
 * (migration 0007):
 *
 * - ONE key per logical submission: the same key is reused while the request
 *   is in flight and after a failure WITH THE SAME payload (the exact case
 *   "the server committed but the response was lost" — a retry replays the
 *   original 201 instead of creating a second entity).
 * - A changed payload starts a NEW logical submission → fresh key.
 * - A settled success drops the key: the next Save is deliberately new.
 *
 * Storage choice: a module-level Map (tab-scoped, cleared on reload). A
 * reload re-renders the form from scratch; resubmitting after a reload means
 * the user deliberately re-entered the data, which is a new attempt. This
 * avoids persisting payloads or reusing keys across ambiguous reloads, per
 * the approved "avoid persisting sensitive payloads" constraint.
 *
 * Keys are UUIDs (letters/digits/hyphens), matching the server contract
 * ^[A-Za-z0-9_-]{8,100}$.
 */

interface IdempotencyEntry {
  key: string;
  /** `JSON.stringify` of the exact request body this key was minted for. */
  fingerprint: string;
  /** `pending` while in flight; `retryable` after the request failed. */
  state: 'pending' | 'retryable';
}

const entries = new Map<string, IdempotencyEntry>();

/**
 * Mint (or reuse) the key for one logical submission. Called right before the
 * HTTP call; `fingerprint` must be the serialized request body.
 */
export function beginIdempotencyKey(scope: string, fingerprint: string): string {
  const existing = entries.get(scope);
  if (existing && existing.fingerprint === fingerprint) {
    // Same payload: keep the key while pending AND after a failure so a user
    // retry can replay instead of duplicating. (A settled success cleared it.)
    existing.state = 'pending';
    return existing.key;
  }
  const key = crypto.randomUUID();
  entries.set(scope, { key, fingerprint, state: 'pending' });
  return key;
}

/**
 * Record the outcome. A success clears the key (the submission is done); a
 * failure keeps it so the same payload can safely retry later.
 */
export function settleIdempotencyKey(scope: string, fingerprint: string, failed: boolean): void {
  const existing = entries.get(scope);
  if (!existing || existing.fingerprint !== fingerprint) return;
  if (failed) {
    existing.state = 'retryable';
  } else {
    entries.delete(scope);
  }
}

/** Test cleanup helper: drop every retained key. */
export function resetIdempotencyKeys(): void {
  entries.clear();
}
