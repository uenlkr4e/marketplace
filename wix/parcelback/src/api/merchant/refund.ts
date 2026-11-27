import type { APIRoute } from '@wix/custom-extensions/types';
import { json, planRefund, refundInWix, withErrorHandling } from '../../backend/returns';
import { getMerchant } from '../../backend/caller';
import { getById, transition } from '../../backend/db';
import { roundMoney, type ReturnStatus } from '../../shared/returns';

const REFUNDABLE: ReturnStatus[] = ['APPROVED', 'RECEIVED'];

/**
 * POST /merchant/refund  { id, amount, restock, notifyCustomer }
 *
 * Locks the request (→ REFUNDING) before calling the payment provider, so a
 * double click or a second tab can't refund twice. On failure the request
 * goes back to its previous status.
 */
export const POST: APIRoute = withErrorHandling('merchant/refund', async ({ request }) => {
  const merchant = await getMerchant();
  if (!merchant) {
    return json({ error: 'Not allowed.' }, 403);
  }

  const body = (await request.json().catch(() => ({}))) as {
    id?: unknown;
    amount?: unknown;
    restock?: unknown;
    notifyCustomer?: unknown;
  };
  const id = String(body.id ?? '');
  const amount = roundMoney(Number(body.amount));
  if (!id || !Number.isFinite(amount) || amount <= 0) {
    return json({ error: 'Enter a refund amount greater than zero.' }, 400);
  }

  const before = await getById(merchant.instanceId, id);
  if (!before) {
    return json({ error: 'Return request not found.' }, 404);
  }
  if (!REFUNDABLE.includes(before.status)) {
    return json({ error: `This request is already ${before.status.toLowerCase()}. Refresh the page.` }, 409);
  }

  const plan = await planRefund(before.orderId);
  if (plan.kind === 'none') {
    return json({ error: `This order can’t be refunded: ${plan.reason}.` }, 409);
  }

  const locked = await transition(merchant.instanceId, id, REFUNDABLE, 'REFUNDING');
  if (!locked) {
    return json({ error: 'This request is already being refunded. Refresh the page.' }, 409);
  }

  try {
    await refundInWix(locked, plan, {
      amount,
      restock: body.restock !== false,
      notifyCustomer: body.notifyCustomer !== false,
    });
  } catch (e) {
    await transition(merchant.instanceId, id, ['REFUNDING'], before.status, { note: 'Refund failed; status restored' });
    throw e;
  }

  const refunded = await transition(merchant.instanceId, id, ['REFUNDING'], 'REFUNDED', {
    refundedAmount: amount,
    note: plan.kind === 'manual' ? `Recorded as refunded outside Wix (${plan.method})` : undefined,
  });
  return json({ request: refunded, plan });
});
