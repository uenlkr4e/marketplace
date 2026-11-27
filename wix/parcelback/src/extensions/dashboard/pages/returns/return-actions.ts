import { httpClient } from '@wix/essentials';
import type { MerchantAction, RefundPlan, ReturnRequest } from '../../../../shared/returns';

// Dashboard calls to the app's merchant endpoints. The backend checks that
// the caller is a Wix user on this site and enforces the status rules.

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
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

export async function listReturnRequests(): Promise<ReturnRequest[]> {
  return (await call<{ requests: ReturnRequest[] }>('merchant/returns')).requests;
}

export async function applyAction(request: ReturnRequest, action: MerchantAction, note?: string): Promise<ReturnRequest> {
  const { request: updated } = await call<{ request: ReturnRequest }>('merchant/return-action', {
    method: 'POST',
    body: { id: request.id, action, note },
  });
  return updated;
}

export async function planRefund(request: ReturnRequest): Promise<RefundPlan> {
  return (await call<{ plan: RefundPlan }>('merchant/refund-plan', { method: 'POST', body: { id: request.id } })).plan;
}

export async function refundRequest(
  request: ReturnRequest,
  options: { amount: number; restock: boolean; notifyCustomer: boolean },
): Promise<ReturnRequest> {
  const { request: updated } = await call<{ request: ReturnRequest }>('merchant/refund', {
    method: 'POST',
    body: { id: request.id, ...options },
  });
  return updated;
}
