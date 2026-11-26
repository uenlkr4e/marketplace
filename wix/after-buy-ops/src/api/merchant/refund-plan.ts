import type { APIRoute } from '@wix/custom-extensions/types';
import { json, planRefund, withErrorHandling } from '../../backend/returns';
import { getMerchant } from '../../backend/caller';
import { getById } from '../../backend/db';

/** POST /merchant/refund-plan  { id }: how a refund for this request would be paid. */
export const POST: APIRoute = withErrorHandling('merchant/refund-plan', async ({ request }) => {
  const merchant = await getMerchant();
  if (!merchant) {
    return json({ error: 'Not allowed.' }, 403);
  }
  const { id } = (await request.json().catch(() => ({}))) as { id?: string };
  const returnRequest = id ? await getById(merchant.instanceId, String(id)) : null;
  if (!returnRequest) {
    return json({ error: 'Return request not found.' }, 404);
  }
  return json({ plan: await planRefund(returnRequest.orderId) });
});
