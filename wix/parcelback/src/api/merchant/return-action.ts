import type { APIRoute } from '@wix/custom-extensions/types';
import { json, withErrorHandling } from '../../backend/returns';
import { getMerchant } from '../../backend/caller';
import { getById, transition } from '../../backend/db';
import { notifyCustomer, type ReturnEvent } from '../../backend/notify';
import type { MerchantAction, ReturnStatus } from '../../shared/returns';

// Allowed status changes. Refunds go through /merchant/refund instead.
const TRANSITIONS: Record<MerchantAction, { from: ReturnStatus[]; to: ReturnStatus }> = {
  approve: { from: ['REQUESTED'], to: 'APPROVED' },
  reject: { from: ['REQUESTED'], to: 'REJECTED' },
  receive: { from: ['APPROVED'], to: 'RECEIVED' },
};

const EMAILS: Partial<Record<MerchantAction, ReturnEvent>> = {
  approve: 'return_approved',
  reject: 'return_rejected',
};

// Rejecting needs a reason; it's stored as the merchant note and sent to the customer.
const MAX_NOTE_LENGTH = 1000;

/** POST /merchant/return-action  { id, action: 'approve' | 'reject' | 'receive', note? }  (note required for reject) */
export const POST: APIRoute = withErrorHandling('merchant/return-action', async ({ request }) => {
  const merchant = await getMerchant();
  if (!merchant) {
    return json({ error: 'Not allowed.' }, 403);
  }

  const body = (await request.json().catch(() => ({}))) as { id?: unknown; action?: unknown; note?: unknown };
  const id = String(body.id ?? '');
  const action = String(body.action) as MerchantAction;
  const rule = TRANSITIONS[action];
  if (!id || !rule) {
    return json({ error: 'Invalid request.' }, 400);
  }

  const note = action === 'reject' && typeof body.note === 'string' ? body.note.trim() : '';
  if (action === 'reject' && !note) {
    return json({ error: 'Add a reason for the rejection.' }, 400);
  }
  if (note.length > MAX_NOTE_LENGTH) {
    return json({ error: `Keep the note under ${MAX_NOTE_LENGTH} characters.` }, 400);
  }
  const updated = await transition(merchant.instanceId, id, rule.from, rule.to, note ? { note, merchantNote: note } : {});
  if (!updated) {
    const current = await getById(merchant.instanceId, id);
    return current
      ? json({ error: `This request is already ${current.status.toLowerCase()}. Refresh the page.`, request: current }, 409)
      : json({ error: 'Return request not found.' }, 404);
  }
  const email = EMAILS[action];
  if (email) await notifyCustomer(email, updated);
  return json({ request: updated });
});
