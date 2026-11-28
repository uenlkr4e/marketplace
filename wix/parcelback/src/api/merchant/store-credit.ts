import type { APIRoute } from '@wix/custom-extensions/types';
import { json, withErrorHandling } from '../../backend/returns';
import { getMerchant } from '../../backend/caller';
import { getById, transition } from '../../backend/db';
import { issueStoreCredit } from '../../backend/credit';
import { notifyCustomer } from '../../backend/notify';
import { roundMoney, type ReturnStatus } from '../../shared/returns';

const CREDITABLE: ReturnStatus[] = ['APPROVED', 'RECEIVED'];

// Credit may include a bonus on top of the refund value, within reason.
const MAX_CREDIT_FACTOR = 2;

/**
 * POST /merchant/store-credit  { id, amount, notifyCustomer }
 *
 * Settles a return with store credit instead of a refund: creates a single-use
 * coupon for `amount` and moves the request to CREDITED. Locked like refunds
 * (→ REFUNDING first), so a double click can't create two coupons.
 */
export const POST: APIRoute = withErrorHandling('merchant/store-credit', async ({ request }) => {
  const merchant = await getMerchant();
  if (!merchant) {
    return json({ error: 'Not allowed.' }, 403);
  }

  const body = (await request.json().catch(() => ({}))) as { id?: unknown; amount?: unknown; notifyCustomer?: unknown };
  const id = String(body.id ?? '');
  const amount = roundMoney(Number(body.amount));

  const before = await getById(merchant.instanceId, id);
  if (!before) {
    return json({ error: 'Return request not found.' }, 404);
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > roundMoney(before.requestedAmount * MAX_CREDIT_FACTOR)) {
    return json({ error: `Enter a credit amount between 0 and ${roundMoney(before.requestedAmount * MAX_CREDIT_FACTOR)}.` }, 400);
  }
  // EU law: a withdrawal is refunded with the same means of payment unless the
  // customer expressly agrees otherwise, so store credit is for returns only.
  if (before.kind === 'WITHDRAWAL') {
    return json({ error: 'Withdrawals must be refunded to the original payment, not with store credit.' }, 409);
  }
  if (!CREDITABLE.includes(before.status)) {
    return json({ error: `This request is already ${before.status.toLowerCase()}. Refresh the page.` }, 409);
  }

  const locked = await transition(merchant.instanceId, id, CREDITABLE, 'REFUNDING');
  if (!locked) {
    return json({ error: 'This request is already being settled. Refresh the page.' }, 409);
  }

  let credit: Awaited<ReturnType<typeof issueStoreCredit>>;
  try {
    credit = await issueStoreCredit(locked, amount);
  } catch (e) {
    await transition(merchant.instanceId, id, ['REFUNDING'], before.status, { note: 'Store credit failed; status restored' });
    throw e;
  }

  const credited = await transition(merchant.instanceId, id, ['REFUNDING'], 'CREDITED', {
    credit,
    note: `Store credit ${credit.code}`,
  });
  if (credited && body.notifyCustomer !== false) {
    await notifyCustomer('store_credit_issued', credited);
  }
  return json({ request: credited });
});
