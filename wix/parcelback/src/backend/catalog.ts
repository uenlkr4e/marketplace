import { auth } from '@wix/essentials';
import { catalogVersioning, products, productsV3 } from '@wix/stores';
import type { FinalSaleProduct } from '../shared/settings';

// Product search for the Settings page ("Final sale products"). Wix Stores
// sites run catalog V1 or V3, with different APIs; both return the product ID
// that orders reference as lineItem.catalogReference.catalogItemId.

const getCatalogVersion = auth.elevate(catalogVersioning.getCatalogVersion);
const searchV3 = auth.elevate(productsV3.searchProducts);
const queryV1 = auth.elevate(products.queryProducts);

const LIMIT = 20;

export async function searchProducts(text: string): Promise<FinalSaleProduct[]> {
  const { catalogVersion } = await getCatalogVersion();
  if (catalogVersion === 'STORES_NOT_INSTALLED') return [];

  if (catalogVersion === 'V3_CATALOG') {
    const { products: found = [] } = await searchV3({
      search: text ? { expression: text, fields: ['name'] } : undefined,
      cursorPaging: { limit: LIMIT },
    });
    return found.filter((p) => p._id).map((p) => ({ id: p._id!, name: p.name ?? '' }));
  }

  let query = queryV1().limit(LIMIT).ascending('name');
  if (text) query = query.startsWith('name', text);
  const { items } = await query.find();
  return items.filter((p) => p._id).map((p) => ({ id: p._id!, name: p.name ?? '' }));
}
