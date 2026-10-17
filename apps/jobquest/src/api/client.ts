import type { FieldErrors } from '../../shared/forms';

/** A non-2xx answer from the Worker, with its message and any per-field errors. */
export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: FieldErrors;

  constructor(status: number, message: string, fieldErrors: FieldErrors = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

/** Calls the Worker's /api. The server knows who the visitor is; no profile id is sent. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}) {
  const hasBody = init.body !== undefined;
  const response = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(init.body) : undefined,
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error ?? `Something went wrong (${response.status}).`,
      data?.fieldErrors
    );
  }
  return data as T;
}
