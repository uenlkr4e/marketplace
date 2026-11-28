import type { APIRoute } from '@wix/custom-extensions/types';
import {
  NOT_FOUND,
  withErrorHandling,
  buildItems,
  customerEmailFor,
  checkWithdrawal,
  findCustomerOrder,
  getFulfillments,
  fail,
  json,
  parseCustomer,
  tooManyRequests,
  parseItems,
} from '../backend/returns';
import { getCaller, memberIdOf } from '../backend/caller';
import { checkLimits, recordFailedLookup } from '../backend/limits';
import { notifyCustomer } from '../backend/notify';
import { insertRequest, listForOrder, withOrderLock } from '../backend/db';
import { WITHDRAWAL_REASON, roundMoney } from '../shared/returns';

/**
 * POST /withdrawal
 *   { orderNumber, email, name, items?: [{ lineItemId, quantity }], note? }
 *   (email may be left out for a logged-in member's own order)
 *
 * EU withdrawal declaration ("Confirm withdrawal here"). No reason is asked
 * for. Without items, the customer withdraws from everything still open on
 * the order. The request joins the merchant's returns queue as a WITHDRAWAL
 * and the customer gets a timestamped acknowledgement email. The quantity
 * check and insert run under a per-order lock, like returns.
 */
export const POST: APIRoute = withErrorHandling('withdrawal', async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail('invalid_request', 'Invalid request.', 400);
  }

  const caller = await getCaller();
  if (!caller) {
    return fail('invalid_request', 'Invalid request.', 401);
  }
  const memberId = memberIdOf(caller);

  const customer = parseCustomer(body, Boolean(memberId));
  if (!customer) {
    return fail('invalid_customer', 'Please enter a valid order number and email.', 400);
  }
  const name = String(body.name ?? '').trim();
  if (!name || name.length > 200) {
    return fail('name_required', 'Please enter your name.', 400);
  }
  const customerNote = String(body.note ?? '').trim().slice(0, 1000);

  const limited = await checkLimits(request, caller);
  if (limited) {
    return tooManyRequests(limited);
  }

  const order = await findCustomerOrder(customer.orderNumber, customer.email, memberId);
  if (!order?._id) {
    await recordFailedLookup(request, caller);
    return json(NOT_FOUND, 404);
  }

  const orderId = order._id;
  const chosen = parseItems(body.items);
  const saved = await withOrderLock(caller.instanceId, orderId, async () => {
    const [fulfillments, existing] = await Promise.all([
      getFulfillments(orderId),
      listForOrder(caller.instanceId, orderId),
    ]);
    const eligibility = checkWithdrawal(order, fulfillments, existing);
    if (!eligibility.eligible) {
      return json({ code: eligibility.code, error: eligibility.reason }, 409);
    }

    const wanted = chosen.size
      ? chosen
      : new Map(Object.entries(eligibility.returnable).filter(([, quantity]) => quantity > 0));
    const items = buildItems(order, wanted, eligibility.returnable);
    if (!items) {
      return fail('withdrawal_items_unavailable', 'One of the selected items is no longer open for withdrawal.', 409);
    }

    return insertRequest(caller.instanceId, {
      kind: 'WITHDRAWAL',
      orderId,
      orderNumber: String(order.number),
      customerEmail: customerEmailFor(order, customer.email),
      customerName: name,
      contactId: order.buyerInfo?.contactId ?? null,
      items,
      reason: WITHDRAWAL_REASON,
      customerNote,
      currency: order.currency ?? '',
      requestedAmount: roundMoney(items.reduce((sum, i) => sum + i.unitAmount * i.quantity, 0)),
    });
  });
  if (saved instanceof Response) {
    return saved;
  }

  await notifyCustomer('withdrawal_received', saved);
  return json(
    {
      reference: saved.rmaNumber,
      submittedAt: saved.createdAt,
      items: saved.items.map((i) => ({ name: i.name, quantity: i.quantity })),
    },
    201,
  );
});
