import { auth } from '@wix/essentials';
import { activations } from '@wix/automations';
import type { ReturnRequest } from '../shared/returns';

// Customer emails go through Wix Automations: the app reports an event and
// the store's automation (pre-installed with the app, editable by the
// merchant) sends the email from the store. Refund emails come from Wix's
// own refund flow, so there's no trigger for those.
//
// Trigger keys and payload fields must match the triggers configured in the
// app dashboard (Develop > Automations).

export type ReturnEvent =
  | 'return_requested'
  | 'return_approved'
  | 'return_rejected'
  | 'withdrawal_received'
  | 'store_credit_issued';

const reportEvent = auth.elevate(activations.reportEvent);

/**
 * Best effort: a failed notification is logged, never thrown, so it can't
 * block the return itself. Idempotent per request + event, so retries don't
 * send duplicate emails.
 */
export async function notifyCustomer(event: ReturnEvent, request: ReturnRequest): Promise<void> {
  if (!request.contactId) {
    console.warn(`[parcelback] ${event}: no contact ID for ${request.rmaNumber}; email skipped`);
    return;
  }
  const itemsSummary = request.items.map((i) => `${i.name} × ${i.quantity}`).join(', ');
  // The withdrawal acknowledgement must state what was submitted and when.
  const payload =
    event === 'store_credit_issued' && request.credit
      ? {
          contact_id: request.contactId,
          rma_number: request.rmaNumber,
          order_number: request.orderNumber,
          items_summary: itemsSummary,
          credit_code: request.credit.code,
          credit_amount: formatMoney(request.credit.amount, request.currency),
          expires_on: formatDate(request.credit.expiresAt),
        }
      : event === 'withdrawal_received'
      ? {
          contact_id: request.contactId,
          reference: request.rmaNumber,
          order_number: request.orderNumber,
          customer_name: request.customerName ?? '',
          items_summary: itemsSummary,
          customer_note: request.customerNote,
          submitted_at: formatTimestamp(request.createdAt),
        }
      : {
          contact_id: request.contactId,
          rma_number: request.rmaNumber,
          order_number: request.orderNumber,
          items_summary: itemsSummary,
          reason: request.reason,
          merchant_note: request.merchantNote ?? '',
          requested_at: request.createdAt,
        };
  try {
    await reportEvent(event, {
      payload,
      externalEntityId: request.id,
      idempotency: { key: `${request.id}:${event}` },
    });
  } catch (e) {
    console.error(`[parcelback] ${event} for ${request.rmaNumber} not reported:`, e instanceof Error ? e.message : e);
  }
}

/** e.g. "27 November 2026 at 14:03 UTC" */
export function formatTimestamp(iso: string): string {
  const formatted = new Date(iso).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' });
  return `${formatted} UTC`;
}

/** e.g. "€40.00"; falls back to "40.00 EUR" for unknown currencies. */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** e.g. "28 November 2027" */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { dateStyle: 'long', timeZone: 'UTC' });
}
