import type { Context } from 'hono';

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

export function toErrorBody(err: unknown): { status: number; body: ApiErrorBody } {
  if (err instanceof ApiError) {
    const body: ApiErrorBody = { message: err.message };
    if (err.errors) body.errors = err.errors;
    return { status: err.status, body };
  }
  console.error('Unexpected error:', err);
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
