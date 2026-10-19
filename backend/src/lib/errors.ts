import type { Context } from 'hono';
import { maskPii } from './audit';

export interface ApiErrorBody {
  message: string;
  errors?: Record<string, string[]>;
}

/**
 * HTTP-aware error. Services throw these; the Hono error handler
 * serializes them into the consistent `{ message, errors? }` contract.
 */
export class ApiError extends Error {
  status: number;
  errors?: Record<string, string[]>;

  constructor(status: number, message: string, errors?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export const badRequest = (message = 'Bad request', errors?: Record<string, string[]>) =>
  new ApiError(400, message, errors);
export const unauthorized = (message = 'Unauthenticated') => new ApiError(401, message);
export const forbidden = (message = 'Forbidden') => new ApiError(403, message);
export const notFound = (message = 'Not found') => new ApiError(404, message);
export const conflict = (message = 'Conflict', errors?: Record<string, string[]>) =>
  new ApiError(409, message, errors);
export const unprocessable = (message = 'Validation failed', errors?: Record<string, string[]>) =>
  new ApiError(422, message, errors);

/**
 * BE-033: unexpected errors are logged as ONE structured JSON line with PII
 * masked (emails, tokens, hashes) and a bounded stack. Never the raw error
 * object, request body, headers or query string.
 */
export function logUnexpectedError(err: unknown, meta: { method?: string; path?: string } = {}): void {
  const e = err as { name?: unknown; message?: unknown; stack?: unknown } | null;
  const entry = {
    level: 'error',
    event: 'unhandled_error',
    method: meta.method,
    path: meta.path,
    name: typeof e?.name === 'string' ? e.name : typeof err,
    message: maskPii(typeof e?.message === 'string' ? e.message : String(err)).slice(0, 500),
    stack:
      typeof e?.stack === 'string'
        ? maskPii(e.stack).split(/\r?\n/).slice(0, 6).join(' | ').slice(0, 1000)
        : undefined,
  };
  console.error(JSON.stringify(entry));
}

export function toErrorBody(
  err: unknown,
  meta?: { method?: string; path?: string },
): { status: number; body: ApiErrorBody } {
  if (err instanceof ApiError) {
    const body: ApiErrorBody = { message: err.message };
    if (err.errors) body.errors = err.errors;
    return { status: err.status, body };
  }
  logUnexpectedError(err, meta);
  return { status: 500, body: { message: 'Internal server error' } };
}

/** Success envelope helpers — keep every response shape predictable. */
export function ok<T>(c: Context, data: T, status = 200) {
  return c.json({ data }, status as 200);
}

export function paginated<T>(
  c: Context,
  items: T[],
  pagination: { page: number; pageSize: number; total: number },
) {
  return c.json({ data: items, pagination }, 200);
}
