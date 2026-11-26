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

/** POST /merchant/return-action  { id, action: 'approve' | 'reject' | 'receive', note? } */
export const POST: APIRoute = withErrorHandling('merchant/return-action', async ({ request }) => {
  const merchant = await getMerchant();
  if (!merchant) {
    return json({ error: 'Not allowed.' }, 403);
  }

  const body = (await request.json().catch(() => ({}))) as { id?: unknown; action?: unknown; note?: unknown };
  const id = String(body.id ?? '');
  const rule = TRANSITIONS[String(body.action) as MerchantAction];
  if (!id || !rule) {
    return json({ error: 'Invalid request.' }, 400);
  }

  const note = typeof body.note === 'string' ? body.note.slice(0, 1000) : undefined;
  const updated = await transition(merchant.instanceId, id, rule.from, rule.to, { note, merchantNote: note });
  if (!updated) {
    const current = await getById(merchant.instanceId, id);
    return current
      ? json({ error: `This request is already ${current.status.toLowerCase()}. Refresh the page.`, request: current }, 409)
      : json({ error: 'Return request not found.' }, 404);
  }
  const email = EMAILS[String(body.action) as MerchantAction];
  if (email) await notifyCustomer(email, updated);
  return json({ request: updated });
});
