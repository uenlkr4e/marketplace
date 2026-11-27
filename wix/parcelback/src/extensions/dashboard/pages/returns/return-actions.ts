import type { MerchantAction, RefundPlan, ReturnRequest } from '../../../../shared/returns';
import { call } from '../../api';

// The backend enforces the status rules; these just call the merchant endpoints.

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
