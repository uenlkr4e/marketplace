import { auth } from '@wix/essentials';
import { orderBilling, orders, orderFulfillments } from '@wix/ecom';
import {
  ACTIVE_STATUSES,
  RETURN_WINDOW_DAYS,
  roundMoney,
  type RefundPlan,
  type ReturnRequest,
} from '../shared/returns';

// Backend-only helpers. Wix calls here run with elevated permissions, so
// customer-facing callers must verify the customer (order number + email)
// first, and merchant callers must be checked with getMerchant().

const searchOrders = auth.elevate(orders.searchOrders);
const listFulfillments = auth.elevate(orderFulfillments.listFulfillmentsForSingleOrder);
const getRefundability = auth.elevate(orderBilling.getOrderRefundability);
const refundPayments = auth.elevate(orderBilling.refundPayments);

type Order = orders.Order;
type Fulfillment = orderFulfillments.Fulfillment;

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const NOT_FOUND = { error: 'We could not find an order matching those details.' };

/** Logs unexpected errors server-side and returns a generic 500. */
export function withErrorHandling<A extends unknown[]>(name: string, handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (e) {
      console.error(
        `[after-buy-ops] ${name} failed:`,
        e instanceof Error ? (e.stack ?? e.message) : e,
        (e as { details?: unknown })?.details ?? '',
      );
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }
  };
}

export function parseCustomer(body: { orderNumber?: unknown; email?: unknown }) {
  const orderNumber = String(body.orderNumber ?? '').trim().replace(/^#/, '');
  const email = String(body.email ?? '').trim().toLowerCase();
  const valid = /^\d{1,20}$/.test(orderNumber) && email.includes('@') && email.length <= 254;
  return valid ? { orderNumber, email } : null;
}

/** Returns the order only when both the number and the buyer email match. */
export async function findCustomerOrder(orderNumber: string, email: string): Promise<Order | null> {
  const { orders: found = [] } = await searchOrders({
    filter: { number: { $eq: orderNumber } },
    cursorPaging: { limit: 1 },
  });
  const order = found[0];
  return order?._id && order.buyerInfo?.email?.toLowerCase() === email ? order : null;
}

export async function getFulfillments(orderId: string): Promise<Fulfillment[]> {
  const { orderWithFulfillments } = await listFulfillments(orderId);
  return orderWithFulfillments?.fulfillments ?? [];
}

/** Per-unit amount actually paid for a line item (after discounts and tax). */
export function unitAmount(item: NonNullable<Order['lineItems']>[number]): number {
  const total = Number(item.totalPriceAfterTax?.amount ?? item.price?.amount ?? 0);
  const quantity = item.quantity || 1;
  return roundMoney(total / quantity);
}

export type Eligibility = {
  eligible: boolean;
  reason?: string;
  windowEndsAt?: string;
  returnable: Record<string, number>; // lineItemId -> quantity still returnable
};

/**
 * MVP rules:
 * - the order must be paid (or partially refunded)
 * - the window runs RETURN_WINDOW_DAYS from the first shipment, or from the order date if nothing shipped
 * - quantity = ordered - refunded (per Wix) - held by open return requests
 */
export function checkEligibility(
  order: Order,
  fulfillments: Fulfillment[],
  requests: ReturnRequest[],
  now = new Date(),
): Eligibility {
  const returnable: Record<string, number> = {};
  for (const item of order.lineItems ?? []) {
    if (!item._id) continue;
    const held = requests
      .filter((r) => ACTIVE_STATUSES.includes(r.status))
      .flatMap((r) => r.items)
      .filter((i) => i.lineItemId === item._id)
      .reduce((sum, i) => sum + i.quantity, 0);
    returnable[item._id] = Math.max(0, (item.quantity ?? 0) - (item.refundQuantity ?? 0) - held);
  }

  if (!['PAID', 'PARTIALLY_REFUNDED'].includes(String(order.paymentStatus))) {
    return { eligible: false, reason: 'This order can’t be returned online. Please contact the store.', returnable };
  }

  const shipDates = fulfillments
    .map((f) => (f._createdDate ? new Date(f._createdDate).getTime() : NaN))
    .filter((t) => !Number.isNaN(t));
  const start = shipDates.length ? Math.min(...shipDates) : new Date(order._createdDate ?? now).getTime();
  const windowEndsAt = new Date(start + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  if (now.toISOString() > windowEndsAt) {
    return { eligible: false, reason: 'The return window for this order has closed.', windowEndsAt, returnable };
  }
  if (!Object.values(returnable).some((q) => q > 0)) {
    return { eligible: false, reason: 'All items in this order already have a return or refund.', windowEndsAt, returnable };
  }
  return { eligible: true, windowEndsAt, returnable };
}

/**
 * Picks the payment to refund: one the provider can refund automatically,
 * otherwise one the merchant must refund outside Wix (offline payments, …).
 * MVP assumption: the whole refund fits on a single payment.
 */
export async function planRefund(orderId: string): Promise<RefundPlan> {
  const { payments = [] } = await getRefundability(orderId);
  const automatic = payments.find((p) => p.refundable && p.payment?.paymentId);
  if (automatic) {
    return { kind: 'automatic', paymentId: automatic.payment!.paymentId!, method: automatic.payment?.paymentMethod ?? '' };
  }
  const manual = payments.find((p) => p.manuallyRefundable && p.payment?.paymentId);
  if (manual) {
    return {
      kind: 'manual',
      paymentId: manual.payment!.paymentId!,
      method: manual.payment?.paymentMethod ?? '',
      reason: String(manual.manuallyRefundable?.reason ?? ''),
      providerLink: manual.providerLink,
    };
  }
  const blocked = payments.find((p) => p.nonRefundable);
  return { kind: 'none', reason: String(blocked?.nonRefundable?.reason ?? 'No refundable payment on this order') };
}

/** Refunds (or, for manual payments, records the refund of) a request's items in Wix. */
export async function refundInWix(
  request: ReturnRequest,
  plan: Extract<RefundPlan, { kind: 'automatic' | 'manual' }>,
  options: { amount: number; restock: boolean; notifyCustomer: boolean },
): Promise<void> {
  const lineItems = request.items.map((i) => ({ lineItemId: i.lineItemId, quantity: i.quantity }));
  await refundPayments(request.orderId, {
    paymentRefunds: [
      { paymentId: plan.paymentId, amount: { amount: options.amount.toFixed(2) }, externalRefund: plan.kind === 'manual' },
    ],
    refundItems: { lineItems },
    sideEffects: {
      restock: options.restock ? { lineItems } : undefined,
      notifications: { sendCustomerEmail: options.notifyCustomer },
    },
    customerReason: request.reason,
  });
}
