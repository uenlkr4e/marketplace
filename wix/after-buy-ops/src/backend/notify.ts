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

export type ReturnEvent = 'return_requested' | 'return_approved' | 'return_rejected';

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
  try {
    await reportEvent(event, {
      payload: {
        contact_id: request.contactId,
        rma_number: request.rmaNumber,
        order_number: request.orderNumber,
        items_summary: request.items.map((i) => `${i.name} × ${i.quantity}`).join(', '),
        reason: request.reason,
        merchant_note: request.merchantNote ?? '',
        requested_at: request.createdAt,
      },
      externalEntityId: request.id,
      idempotency: { key: `${request.id}:${event}` },
    });
  } catch (e) {
    console.error(`[parcelback] ${event} for ${request.rmaNumber} not reported:`, e instanceof Error ? e.message : e);
  }
}
