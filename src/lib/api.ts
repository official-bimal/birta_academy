import { auth } from './firebase';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string, public details?: unknown) {
    super(message || code);
  }
}

/** Calls the trusted Birta API with the current Firebase ID token. */
export async function apiFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new ApiError(401, 'UNAUTHENTICATED');
  const token = await user.getIdToken();
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; reasons?: unknown } & T;
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'SERVER_ERROR', data.error, data.reasons);
  return data;
}
