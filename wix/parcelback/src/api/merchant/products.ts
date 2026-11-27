import type { APIRoute } from '@wix/custom-extensions/types';
import { json, withErrorHandling } from '../../backend/returns';
import { getMerchant } from '../../backend/caller';
import { searchProducts } from '../../backend/catalog';

/** GET /merchant/products?q=: store products for the final-sale picker. Dashboard only. */
export const GET: APIRoute = withErrorHandling('merchant/products', async ({ url }) => {
  const merchant = await getMerchant();
  if (!merchant) {
    return json({ error: 'Not allowed.' }, 403);
  }
  const text = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
  return json({ products: await searchProducts(text) });
});
