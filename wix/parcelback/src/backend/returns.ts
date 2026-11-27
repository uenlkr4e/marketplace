import { auth } from '@wix/essentials';
import { orderBilling, orders, orderFulfillments } from '@wix/ecom';
import {
  ACTIVE_STATUSES,
  WITHDRAWAL_DELIVERY_BUFFER_DAYS,
  WITHDRAWAL_PERIOD_DAYS,
  roundMoney,
  type RefundPlan,
  type ReturnItem,
  type ReturnRequest,
} from '../shared/returns';
import type { StoreSettings } from '../shared/settings';

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

// Customer-facing errors carry a code; the widget translates it and falls back to the English text.
export const fail = (code: string, error: string, status: number) => json({ code, error }, status);

export const NOT_FOUND = { code: 'order_not_found', error: 'We could not find an order matching those details.' };

/** Logs unexpected errors server-side and returns a generic 500. */
export function withErrorHandling<A extends unknown[]>(name: string, handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (e) {
      console.error(
        `[parcelback] ${name} failed:`,
        e instanceof Error ? (e.stack ?? e.message) : e,
        (e as { details?: unknown })?.details ?? '',
      );
      return fail('server_error', 'Something went wrong. Please try again.', 500);
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

/** Parses `[{ lineItemId, quantity }]` from a request body into lineItemId -> quantity. */
export function parseItems(raw: unknown): Map<string, number> {
  const wanted = new Map<string, number>();
  for (const entry of Array.isArray(raw) ? raw : []) {
    const lineItemId = String((entry as { lineItemId?: unknown })?.lineItemId ?? '');
    const quantity = Number((entry as { quantity?: unknown })?.quantity ?? 0);
    if (lineItemId && Number.isInteger(quantity) && quantity > 0) {
      wanted.set(lineItemId, (wanted.get(lineItemId) ?? 0) + quantity);
    }
  }
  return wanted;
}

/** Builds the stored items, or null if any line item is unknown or over its returnable quantity. */
export function buildItems(order: Order, wanted: Map<string, number>, returnable: Record<string, number>): ReturnItem[] | null {
  const items: ReturnItem[] = [];
  for (const [lineItemId, quantity] of wanted) {
    const lineItem = order.lineItems?.find((li) => li._id === lineItemId);
    if (!lineItem || quantity > (returnable[lineItemId] ?? 0)) return null;
    items.push({
      lineItemId,
      name: lineItem.productName?.translated ?? lineItem.productName?.original ?? '',
      quantity,
      unitAmount: unitAmount(lineItem),
    });
  }
  return items;
}

export type Eligibility = {
  eligible: boolean;
  code?: string; // translatable form of `reason`
  reason?: string;
  windowEndsAt?: string;
  returnable: Record<string, number>; // lineItemId -> quantity still returnable
};

const DAY_MS = 24 * 60 * 60 * 1000;

const shipmentTimes = (fulfillments: Fulfillment[]) =>
  fulfillments
    .map((f) => (f._createdDate ? new Date(f._createdDate).getTime() : NaN))
    .filter((t) => !Number.isNaN(t));

/** Quantity per line item = ordered - refunded (per Wix) - held by open returns and withdrawals. */
function returnableQuantities(order: Order, requests: ReturnRequest[]): Record<string, number> {
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
  return returnable;
}

/**
 * Return rules:
 * - the store accepts returns (Settings page)
 * - the order must be paid (or partially refunded)
 * - the window runs settings.returnWindowDays from the first shipment, or from the order date if nothing shipped
 * - quantity: see returnableQuantities
 */
export function checkEligibility(
  order: Order,
  fulfillments: Fulfillment[],
  requests: ReturnRequest[],
  settings: StoreSettings,
  now = new Date(),
): Eligibility {
  const returnable = returnableQuantities(order, requests);

  if (!settings.acceptReturns) {
    return {
      eligible: false,
      code: 'returns_disabled',
      reason: 'This store doesn’t accept returns online. Please contact the store.',
      returnable,
    };
  }

  if (!['PAID', 'PARTIALLY_REFUNDED'].includes(String(order.paymentStatus))) {
    return {
      eligible: false,
      code: 'not_returnable_online',
      reason: 'This order can’t be returned online. Please contact the store.',
      returnable,
    };
  }

  const shipDates = shipmentTimes(fulfillments);
  const start = shipDates.length ? Math.min(...shipDates) : new Date(order._createdDate ?? now).getTime();
  const windowEndsAt = new Date(start + settings.returnWindowDays * DAY_MS).toISOString();

  if (now.toISOString() > windowEndsAt) {
    return {
      eligible: false,
      code: 'return_window_closed',
      reason: 'The return window for this order has closed.',
      windowEndsAt,
      returnable,
    };
  }
  if (!Object.values(returnable).some((q) => q > 0)) {
    return {
      eligible: false,
      code: 'nothing_left',
      reason: 'All items in this order already have a return, withdrawal or refund.',
      windowEndsAt,
      returnable,
    };
  }
  return { eligible: true, windowEndsAt, returnable };
}

/**
 * EU withdrawal rules (deliberately more generous than returns):
 * - any order that isn't cancelled or fully refunded; no payment needed
 * - open until the order is fulfilled, then WITHDRAWAL_PERIOD_DAYS plus a
 *   delivery buffer from the last shipment (the period runs from receipt of
 *   the last item)
 * - quantity: see returnableQuantities
 */
export function checkWithdrawal(
  order: Order,
  fulfillments: Fulfillment[],
  requests: ReturnRequest[],
  now = new Date(),
): Eligibility {
  const returnable = returnableQuantities(order, requests);

  if (order.status === 'CANCELED' || ['FULLY_REFUNDED', 'CANCELED', 'DECLINED'].includes(String(order.paymentStatus))) {
    return {
      eligible: false,
      code: 'order_cancelled',
      reason: 'This order has already been cancelled or refunded.',
      returnable,
    };
  }

  let windowEndsAt: string | undefined;
  if (order.fulfillmentStatus === 'FULFILLED') {
    // Orders marked fulfilled without a shipment record count from the order date.
    const shipDates = shipmentTimes(fulfillments);
    const start = shipDates.length ? Math.max(...shipDates) : new Date(order._createdDate ?? now).getTime();
    const days = WITHDRAWAL_PERIOD_DAYS + WITHDRAWAL_DELIVERY_BUFFER_DAYS;
    windowEndsAt = new Date(start + days * DAY_MS).toISOString();
    if (now.toISOString() > windowEndsAt) {
      return {
        eligible: false,
        code: 'withdrawal_period_ended',
        reason: 'The withdrawal period for this order has ended.',
        windowEndsAt,
        returnable,
      };
    }
  }
  if (!Object.values(returnable).some((q) => q > 0)) {
    return {
      eligible: false,
      code: 'nothing_left',
      reason: 'All items in this order already have a return, withdrawal or refund.',
      windowEndsAt,
      returnable,
    };
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
