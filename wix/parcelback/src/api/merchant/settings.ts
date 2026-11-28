import type { APIRoute } from '@wix/custom-extensions/types';
import { json, withErrorHandling } from '../../backend/returns';
import { getMerchant } from '../../backend/caller';
import { getSettings, saveSettings } from '../../backend/db';
import { getInstalledVersion } from '../../backend/app-version';
import { validateSettings } from '../../shared/settings';

/**
 * GET /merchant/settings: the store's settings (defaults if never saved) and
 * the installed app version. Dashboard only.
 */
export const GET: APIRoute = withErrorHandling('merchant/settings', async () => {
  const merchant = await getMerchant();
  if (!merchant) {
    return json({ error: 'Not allowed.' }, 403);
  }
  const [settings, appVersion] = await Promise.all([getSettings(merchant.instanceId), getInstalledVersion()]);
  return json({ settings, appVersion });
});

/** POST /merchant/settings  { acceptReturns, returnWindowDays, returnReasons } */
export const POST: APIRoute = withErrorHandling('merchant/settings', async ({ request }) => {
  const merchant = await getMerchant();
  if (!merchant) {
    return json({ error: 'Not allowed.' }, 403);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  const result = validateSettings(body);
  if ('error' in result) {
    return json({ error: result.error }, 400);
  }
  return json({ settings: await saveSettings(merchant.instanceId, result.settings) });
});
