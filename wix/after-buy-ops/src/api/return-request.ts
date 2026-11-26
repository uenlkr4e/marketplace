import type { APIRoute } from '@wix/custom-extensions/types';
import {
  NOT_FOUND,
  withErrorHandling,
  checkEligibility,
  findCustomerOrder,
  getFulfillments,
  json,
  parseCustomer,
  unitAmount,
} from '../backend/returns';
import { getCaller } from '../backend/caller';
import { notifyCustomer } from '../backend/notify';
import { insertRequest, listForOrder } from '../backend/db';
import { RETURN_REASONS, roundMoney, type ReturnItem } from '../shared/returns';

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
    return json({ error: 'Invalid request.' }, 400);
  }

  const customer = parseCustomer(body);
  if (!customer) {
    return json({ error: 'Please enter a valid order number and email.' }, 400);
  }

  const reason = String(body.reason ?? '');
  if (!(RETURN_REASONS as readonly string[]).includes(reason)) {
    return json({ error: 'Please choose a reason for the return.' }, 400);
  }
  const customerNote = String(body.note ?? '').trim().slice(0, 1000);

  const requested = Array.isArray(body.items) ? body.items : [];
  const wanted = new Map<string, number>();
  for (const entry of requested) {
    const lineItemId = String((entry as { lineItemId?: unknown })?.lineItemId ?? '');
    const quantity = Number((entry as { quantity?: unknown })?.quantity ?? 0);
    if (lineItemId && Number.isInteger(quantity) && quantity > 0) {
      wanted.set(lineItemId, (wanted.get(lineItemId) ?? 0) + quantity);
    }
  }
  if (!wanted.size) {
    return json({ error: 'Please choose at least one item to return.' }, 400);
  }

  const caller = await getCaller();
  if (!caller) {
    return json({ error: 'Invalid request.' }, 401);
  }

  const order = await findCustomerOrder(customer.orderNumber, customer.email);
  if (!order?._id) {
    return json(NOT_FOUND, 404);
  }

  const [fulfillments, existing] = await Promise.all([
    getFulfillments(order._id),
    listForOrder(caller.instanceId, order._id),
  ]);
  const eligibility = checkEligibility(order, fulfillments, existing);
  if (!eligibility.eligible) {
    return json({ error: eligibility.reason }, 409);
  }

  const items: ReturnItem[] = [];
  for (const [lineItemId, quantity] of wanted) {
    const lineItem = order.lineItems?.find((li) => li._id === lineItemId);
    const available = eligibility.returnable[lineItemId] ?? 0;
    if (!lineItem || quantity > available) {
      return json({ error: 'One of the selected items can’t be returned in that quantity.' }, 409);
    }
    items.push({
      lineItemId,
      name: lineItem.productName?.translated ?? lineItem.productName?.original ?? '',
      quantity,
      unitAmount: unitAmount(lineItem),
    });
  }

  const saved = await insertRequest(caller.instanceId, {
    orderId: order._id,
    orderNumber: String(order.number),
    customerEmail: customer.email,
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
