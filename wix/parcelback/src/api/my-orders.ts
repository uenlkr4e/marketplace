import type { APIRoute } from '@wix/custom-extensions/types';
import { withErrorHandling, fail, json, listMemberOrders, tooManyRequests } from '../backend/returns';
import { getCaller, memberIdOf } from '../backend/caller';
import { checkLimits } from '../backend/limits';

/**
 * POST /my-orders
 *
 * The logged-in member's recent orders, so the widget can list them and the
 * member doesn't have to type an order number and email. The member ID comes
 * from the request's Wix token, never from the body, so members only ever see
 * their own orders. Visitors get an empty list without touching the rate
 * limits, since the widget calls this on every page view.
 */
export const POST: APIRoute = withErrorHandling('my-orders', async ({ request }) => {
  const caller = await getCaller();
  if (!caller) {
    return fail('invalid_request', 'Invalid request.', 401);
  }
  const memberId = memberIdOf(caller);
  if (!memberId) {
    return json({ member: false, orders: [] });
  }

  const limited = await checkLimits(request, caller);
  if (limited) {
    return tooManyRequests(limited);
  }

  const orders = await listMemberOrders(memberId);
  return json({
    member: true,
    orders: orders.map((order) => ({
      number: order.number,
      createdDate: order._createdDate,
      fulfillmentStatus: order.fulfillmentStatus,
      itemCount: (order.lineItems ?? []).reduce((sum, item) => sum + (item.quantity ?? 0), 0),
      total: order.priceSummary?.total?.formattedAmount ?? null,
    })),
  });
});
