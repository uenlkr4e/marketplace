import type { APIRoute } from '@wix/custom-extensions/types';
import {
  NOT_FOUND,
  withErrorHandling,
  buildItems,
  checkEligibility,
  findCustomerOrder,
  getFulfillments,
  fail,
  json,
  parseCustomer,
  parseItems,
} from '../backend/returns';
import { getCaller } from '../backend/caller';
import { notifyCustomer } from '../backend/notify';
import { getSettings, insertRequest, listForOrder } from '../backend/db';
import { roundMoney } from '../shared/returns';

/**
 * POST /return-request
 *   { orderNumber, email, items: [{ lineItemId, quantity }], reason, note? }
 *
 * Re-verifies the customer and eligibility on the server (never trust the
 * widget), then stores a REQUESTED return with an RMA number.
 *
 * Known MVP gap: two simultaneous requests for the same items could both pass
 * the quantity check. Fine for now; revisit with a per-order lock.
 */
export const POST: APIRoute = withErrorHandling('return-request', async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail('invalid_request', 'Invalid request.', 400);
  }

  const customer = parseCustomer(body);
  if (!customer) {
    return fail('invalid_customer', 'Please enter a valid order number and email.', 400);
  }

  const reason = String(body.reason ?? '');
  const customerNote = String(body.note ?? '').trim().slice(0, 1000);

  const wanted = parseItems(body.items);
  if (!wanted.size) {
    return fail('items_required', 'Please choose at least one item to return.', 400);
  }

  const caller = await getCaller();
  if (!caller) {
    return fail('invalid_request', 'Invalid request.', 401);
  }

  const settings = await getSettings(caller.instanceId);
  if (!settings.returnReasons.includes(reason)) {
    return fail('reason_required', 'Please choose a reason for the return.', 400);
  }

  const order = await findCustomerOrder(customer.orderNumber, customer.email);
  if (!order?._id) {
    return json(NOT_FOUND, 404);
  }

  const [fulfillments, existing] = await Promise.all([
    getFulfillments(order._id),
    listForOrder(caller.instanceId, order._id),
  ]);
  const eligibility = checkEligibility(order, fulfillments, existing, settings);
  if (!eligibility.eligible) {
    return json({ code: eligibility.code, error: eligibility.reason }, 409);
  }

  const items = buildItems(order, wanted, eligibility.returnable);
  if (!items) {
    return fail('quantity_unavailable', 'One of the selected items can’t be returned in that quantity.', 409);
  }

  const saved = await insertRequest(caller.instanceId, {
    kind: 'RETURN',
    orderId: order._id,
    orderNumber: String(order.number),
    customerEmail: customer.email,
    customerName: null,
    contactId: order.buyerInfo?.contactId ?? null,
    items,
    reason,
    customerNote,
    currency: order.currency ?? '',
    requestedAmount: roundMoney(items.reduce((sum, i) => sum + i.unitAmount * i.quantity, 0)),
  });

  await notifyCustomer('return_requested', saved);
  return json({ rmaNumber: saved.rmaNumber, status: saved.status }, 201);
});
