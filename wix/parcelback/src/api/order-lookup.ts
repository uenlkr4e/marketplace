import type { APIRoute } from '@wix/custom-extensions/types';
import {
  NOT_FOUND,
  withErrorHandling,
  checkEligibility,
  checkWithdrawal,
  findCustomerOrder,
  getFulfillments,
  fail,
  json,
  parseCustomer,
} from '../backend/returns';
import { getCaller } from '../backend/caller';
import { getSettings, listForOrder } from '../backend/db';

/**
 * POST /order-lookup  { orderNumber, email }
 *
 * Guest order lookup for the storefront widget. Order access is elevated, so
 * data is only returned when BOTH the order number and the buyer email match,
 * and "no such order" and "wrong email" get the same 404 so the endpoint
 * can't be used to discover order numbers.
 *
 * TODO before launch: per-IP / per-site rate limiting (needs shared storage).
 */
export const POST: APIRoute = withErrorHandling('order-lookup', async ({ request }) => {
  let customer: ReturnType<typeof parseCustomer>;
  try {
    customer = parseCustomer(await request.json());
  } catch {
    return fail('invalid_request', 'Invalid request.', 400);
  }
  if (!customer) {
    return fail('invalid_customer', 'Please enter a valid order number and email.', 400);
  }

  const caller = await getCaller();
  if (!caller) {
    return fail('invalid_request', 'Invalid request.', 401);
  }

  const order = await findCustomerOrder(customer.orderNumber, customer.email);
  if (!order?._id) {
    return json(NOT_FOUND, 404);
  }

  const [fulfillments, requests, settings] = await Promise.all([
    getFulfillments(order._id),
    listForOrder(caller.instanceId, order._id),
    getSettings(caller.instanceId),
  ]);
  const eligibility = checkEligibility(order, fulfillments, requests, settings);
  const withdrawal = checkWithdrawal(order, fulfillments, requests);
  const contact = order.billingInfo?.contactDetails;

  return json({
    number: order.number,
    createdDate: order._createdDate,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    customerName: [contact?.firstName, contact?.lastName].filter(Boolean).join(' '),
    lineItems: (order.lineItems ?? []).map((item) => ({
      id: item._id,
      name: item.productName?.translated ?? item.productName?.original ?? '',
      quantity: item.quantity ?? 0,
      image: item.image ?? null,
      returnableQuantity: (item._id && eligibility.returnable[item._id]) || 0,
      withdrawableQuantity: (item._id && withdrawal.returnable[item._id]) || 0,
    })),
    shipments: fulfillments.map((f) => ({
      createdDate: f._createdDate,
      status: f.status ?? null,
      carrier: f.trackingInfo?.shippingProvider ?? null,
      trackingNumber: f.trackingInfo?.trackingNumber ?? null,
      trackingLink: f.trackingInfo?.trackingLink ?? null,
      lineItems: (f.lineItems ?? []).map((li) => ({ id: li._id, quantity: li.quantity })),
    })),
    returns: {
      eligible: eligibility.eligible,
      reason: eligibility.reason ?? null,
      reasonCode: eligibility.code ?? null,
      windowEndsAt: eligibility.windowEndsAt ?? null,
      reasons: settings.returnReasons,
      requests: requests.map((r) => ({
        kind: r.kind,
        rmaNumber: r.rmaNumber,
        status: r.status,
        createdDate: r.createdAt,
        items: r.items.map((i) => ({ name: i.name, quantity: i.quantity })),
        rejectionReason: r.status === 'REJECTED' ? r.merchantNote : null,
      })),
    },
    withdrawal: {
      available: withdrawal.eligible,
      reason: withdrawal.reason ?? null,
      reasonCode: withdrawal.code ?? null,
      periodEndsAt: withdrawal.windowEndsAt ?? null,
    },
  });
});
