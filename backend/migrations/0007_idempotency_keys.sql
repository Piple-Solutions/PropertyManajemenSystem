-- Idempotency keys for the create endpoints (`POST /api/invoices`, `POST /api/expenses`,
-- `POST /api/reservations`). Approved design (Oct 2026):
--
--   - A key is scoped to (user_id, endpoint, key): the PRIMARY KEY below.
--     Cross-user replay is impossible and the claim INSERT races safely on it.
--   - `request_hash` is the SHA-256 of the CANONICALIZED parsed body (not the
--     raw bytes), so a duplicate with reordered JSON properties matches.
--   - `status` lifecycle: 'in_progress' (claimed) -> 'completed' (business
--     effect committed, response storable) or 'failed' (deterministic 4xx,
--     replayed verbatim). Unexpected 5xx releases the row so retries work.
--   - `entity_id` + `result_code` are stamped INSIDE the business batch (same
--     D1 transaction as the entity rows), so a crash after commit can never
--     produce a second entity on retry.
--   - `response_body` stores the exact `{ data }` / `{ message }` envelope for
--     replay; when missing, the response is rebuilt from `entity_id`.
--   - Retention is 48h; expired rows are purged lazily (probabilistic, one
--     bounded indexed DELETE) and are reclaimable regardless.
--
-- Applies with: wrangler d1 migrations apply pms-internal-db --local|--remote
-- SQLite-only syntax. Idempotent: safe to run repeatedly.

CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id       TEXT NOT NULL,
  endpoint      TEXT NOT NULL,
  key           TEXT NOT NULL,
  request_hash  TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'failed')),
  result_code   INTEGER,
  entity_id     TEXT,
  response_body TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  PRIMARY KEY (user_id, endpoint, key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expiry ON idempotency_keys (expires_at);
