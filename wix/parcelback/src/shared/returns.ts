// Types and constants shared by the backend, the dashboard and the site widget.

// MVP defaults; these move to the Settings page.
export const RETURN_WINDOW_DAYS = 30;
export const RETURN_REASONS = [
  'Changed my mind',
  'Wrong size or fit',
  'Damaged or defective',
  'Not as described',
  'Received the wrong item',
  'Other',
] as const;

// EU right of withdrawal (Directive (EU) 2023/2673): 14 days from delivery,
// no reason needed. Wix doesn't record delivery, so the period is counted from
// the last shipment plus a delivery buffer, erring on the customer's side.
export const WITHDRAWAL_PERIOD_DAYS = 14;
export const WITHDRAWAL_DELIVERY_BUFFER_DAYS = 7;
export const WITHDRAWAL_REASON = 'Withdrawal from contract';

// RETURN = the store's return policy; WITHDRAWAL = statutory EU withdrawal.
export type RequestKind = 'RETURN' | 'WITHDRAWAL';

// REFUNDING is a short-lived lock while the payment provider processes a refund.
export type ReturnStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'RECEIVED' | 'REFUNDING' | 'REFUNDED';

// Requests in these states "hold" their quantities against the order. REFUNDED
// isn't listed: once refunded, Wix's own line-item refundQuantity covers it.
export const ACTIVE_STATUSES: ReturnStatus[] = ['REQUESTED', 'APPROVED', 'RECEIVED', 'REFUNDING'];

export type ReturnItem = {
  lineItemId: string;
  name: string;
  quantity: number;
  unitAmount: number; // per-unit price paid, after discounts and tax
};

/** How many of a returned line item go back into stock on refund (damaged ones can stay out). */
export type RestockItem = { lineItemId: string; quantity: number };

/**
 * Checks the merchant's restock choice against the request's items. Returns
 * the non-zero entries, or null if a line item isn't in the request or a
 * quantity is out of range.
 */
export function validateRestock(items: ReturnItem[], raw: unknown): RestockItem[] | null {
  if (!Array.isArray(raw)) return null;
  const chosen: RestockItem[] = [];
  for (const entry of raw) {
    const lineItemId = String((entry as { lineItemId?: unknown })?.lineItemId ?? '');
    const quantity = Number((entry as { quantity?: unknown })?.quantity);
    const item = items.find((i) => i.lineItemId === lineItemId);
    if (!item || !Number.isInteger(quantity) || quantity < 0 || quantity > item.quantity) return null;
    if (quantity > 0) chosen.push({ lineItemId, quantity });
  }
  return chosen;
}

export type HistoryEntry = { status: ReturnStatus; at: string; note?: string };

export type ReturnRequest = {
  id: string;
  kind: RequestKind;
  rmaNumber: string;
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  customerName: string | null;
  contactId: string | null;
  items: ReturnItem[];
  reason: string;
  customerNote: string;
  currency: string;
  requestedAmount: number;
  status: ReturnStatus;
  merchantNote: string | null;
  refundedAmount: number | null;
  history: HistoryEntry[];
  createdAt: string;
  updatedAt: string;
};

export type MerchantAction = 'approve' | 'reject' | 'receive';

export type RefundPlan =
  | { kind: 'automatic'; paymentId: string; method: string }
  | { kind: 'manual'; paymentId: string; method: string; reason: string; providerLink?: string | null }
  | { kind: 'none'; reason: string };

export const roundMoney = (n: number) => Math.round(n * 100) / 100;
