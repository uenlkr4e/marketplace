import type { APIRoute } from '@wix/custom-extensions/types';
import {
  NOT_FOUND,
  withErrorHandling,
  buildItems,
  checkWithdrawal,
  findCustomerOrder,
  getFulfillments,
  fail,
  json,
  parseCustomer,
  parseItems,
} from '../backend/returns';
import { getCaller } from '../backend/caller';
import { notifyCustomer } from '../backend/notify';
import { insertRequest, listForOrder } from '../backend/db';
import { WITHDRAWAL_REASON, roundMoney } from '../shared/returns';

/**
 * POST /withdrawal
 *   { orderNumber, email, name, items?: [{ lineItemId, quantity }], note? }
 *
 * EU withdrawal declaration ("Confirm withdrawal here"). No reason is asked
 * for. Without items, the customer withdraws from everything still open on
 * the order. The request joins the merchant's returns queue as a WITHDRAWAL
 * and the customer gets a timestamped acknowledgement email.
 */
export const POST: APIRoute = withErrorHandling('withdrawal', async ({ request }) => {
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
  const name = String(body.name ?? '').trim();
  if (!name || name.length > 200) {
    return fail('name_required', 'Please enter your name.', 400);
  }
  const customerNote = String(body.note ?? '').trim().slice(0, 1000);

  const caller = await getCaller();
  if (!caller) {
    return fail('invalid_request', 'Invalid request.', 401);
  }

  const order = await findCustomerOrder(customer.orderNumber, customer.email);
  if (!order?._id) {
    return json(NOT_FOUND, 404);
  }

  const [fulfillments, existing] = await Promise.all([
    getFulfillments(order._id),
    listForOrder(caller.instanceId, order._id),
  ]);
  const eligibility = checkWithdrawal(order, fulfillments, existing);
  if (!eligibility.eligible) {
    return json({ code: eligibility.code, error: eligibility.reason }, 409);
  }

  const chosen = parseItems(body.items);
  const wanted = chosen.size
    ? chosen
    : new Map(Object.entries(eligibility.returnable).filter(([, quantity]) => quantity > 0));
  const items = buildItems(order, wanted, eligibility.returnable);
  if (!items) {
    return fail('withdrawal_items_unavailable', 'One of the selected items is no longer open for withdrawal.', 409);
  }

  const saved = await insertRequest(caller.instanceId, {
    kind: 'WITHDRAWAL',
    orderId: order._id,
    orderNumber: String(order.number),
    customerEmail: customer.email,
    customerName: name,
    contactId: order.buyerInfo?.contactId ?? null,
    items,
    reason: WITHDRAWAL_REASON,
    customerNote,
    currency: order.currency ?? '',
    requestedAmount: roundMoney(items.reduce((sum, i) => sum + i.unitAmount * i.quantity, 0)),
  });

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
