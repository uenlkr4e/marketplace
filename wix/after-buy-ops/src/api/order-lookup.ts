import type { APIRoute } from '@wix/custom-extensions/types';
import {
  NOT_FOUND,
  withErrorHandling,
  checkEligibility,
  findCustomerOrder,
  getFulfillments,
  json,
  parseCustomer,
} from '../backend/returns';
import { getCaller } from '../backend/caller';
import { listForOrder } from '../backend/db';

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
    return json({ error: 'Invalid request.' }, 400);
  }
  if (!customer) {
    return json({ error: 'Please enter a valid order number and email.' }, 400);
  }

  const caller = await getCaller();
  if (!caller) {
    return json({ error: 'Invalid request.' }, 401);
  }

  const order = await findCustomerOrder(customer.orderNumber, customer.email);
  if (!order?._id) {
    return json(NOT_FOUND, 404);
  }

  const [fulfillments, requests] = await Promise.all([
    getFulfillments(order._id),
    listForOrder(caller.instanceId, order._id),
  ]);
  const eligibility = checkEligibility(order, fulfillments, requests);

  return json({
    number: order.number,
    createdDate: order._createdDate,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    lineItems: (order.lineItems ?? []).map((item) => ({
      id: item._id,
      name: item.productName?.translated ?? item.productName?.original ?? '',
      quantity: item.quantity ?? 0,
      image: item.image ?? null,
      returnableQuantity: (item._id && eligibility.returnable[item._id]) || 0,
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
      windowEndsAt: eligibility.windowEndsAt ?? null,
      requests: requests.map((r) => ({
        rmaNumber: r.rmaNumber,
        status: r.status,
        createdDate: r.createdAt,
        items: r.items.map((i) => ({ name: i.name, quantity: i.quantity })),
        rejectionReason: r.status === 'REJECTED' ? r.merchantNote : null,
      })),
    },
  });
});
