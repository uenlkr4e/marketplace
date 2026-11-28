import type { APIRoute } from '@wix/custom-extensions/types';
import {
  NOT_FOUND,
  withErrorHandling,
  buildItems,
  customerEmailFor,
  checkEligibility,
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
import { getSettings, insertRequest, listForOrder, withOrderLock } from '../backend/db';
import { roundMoney } from '../shared/returns';

/**
 * POST /return-request
 *   { orderNumber, email, items: [{ lineItemId, quantity }], reason, note? }
 *   (email may be left out for a logged-in member's own order)
 *
 * Re-verifies the customer and eligibility on the server (never trust the
 * widget), then stores a REQUESTED return with an RMA number.
 * The quantity check and insert run under a per-order lock, so two
 * simultaneous requests can't claim the same items.
 */
export const POST: APIRoute = withErrorHandling('return-request', async ({ request }) => {
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

  const reason = String(body.reason ?? '');
  const customerNote = String(body.note ?? '').trim().slice(0, 1000);

  const wanted = parseItems(body.items);
  if (!wanted.size) {
    return fail('items_required', 'Please choose at least one item to return.', 400);
  }

  const limited = await checkLimits(request, caller);
  if (limited) {
    return tooManyRequests(limited);
  }

  const settings = await getSettings(caller.instanceId);
  if (!settings.returnReasons.includes(reason)) {
    return fail('reason_required', 'Please choose a reason for the return.', 400);
  }

  const order = await findCustomerOrder(customer.orderNumber, customer.email, memberId);
  if (!order?._id) {
    await recordFailedLookup(request, caller);
    return json(NOT_FOUND, 404);
  }

  const orderId = order._id;
  const saved = await withOrderLock(caller.instanceId, orderId, async () => {
    const [fulfillments, existing] = await Promise.all([
      getFulfillments(orderId),
      listForOrder(caller.instanceId, orderId),
    ]);
    const eligibility = checkEligibility(order, fulfillments, existing, settings);
    if (!eligibility.eligible) {
      return json({ code: eligibility.code, error: eligibility.reason }, 409);
    }

    const items = buildItems(order, wanted, eligibility.returnable);
    if (!items) {
      return fail('quantity_unavailable', 'One of the selected items can’t be returned in that quantity.', 409);
    }

    return insertRequest(caller.instanceId, {
      kind: 'RETURN',
      orderId,
      orderNumber: String(order.number),
      customerEmail: customerEmailFor(order, customer.email),
      customerName: null,
      contactId: order.buyerInfo?.contactId ?? null,
      items,
      reason,
      customerNote,
      currency: order.currency ?? '',
      requestedAmount: roundMoney(items.reduce((sum, i) => sum + i.unitAmount * i.quantity, 0)),
    });
  });
  if (saved instanceof Response) {
    return saved;
  }

  await notifyCustomer('return_requested', saved);
  return json({ rmaNumber: saved.rmaNumber, status: saved.status }, 201);
});
