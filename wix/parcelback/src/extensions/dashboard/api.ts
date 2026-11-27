import { httpClient } from '@wix/essentials';

// Dashboard calls to the app's merchant endpoints. The backend checks that
// the caller is a Wix user on this site.

export async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await httpClient.fetchWithAuth(`${new URL(import.meta.url).origin}/${path}`, {
    method: init?.method ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? `Request failed (${response.status})`);
  }
  return data as T;
}
