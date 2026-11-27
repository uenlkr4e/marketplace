import type { APIRoute } from '@wix/custom-extensions/types';
import { json, withErrorHandling } from '../../backend/returns';
import { getMerchant } from '../../backend/caller';
import { listAll } from '../../backend/db';

/** GET /merchant/returns: the store's return requests, newest first. Dashboard only. */
export const GET: APIRoute = withErrorHandling('merchant/returns', async () => {
  const merchant = await getMerchant();
  if (!merchant) {
    return json({ error: 'Not allowed.' }, 403);
  }
  return json({ requests: await listAll(merchant.instanceId) });
});
