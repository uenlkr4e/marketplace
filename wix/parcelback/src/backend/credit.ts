import { auth } from '@wix/essentials';
import { coupons } from '@wix/marketing';
import { STORE_CREDIT_VALID_DAYS, type ReturnRequest, type StoreCredit } from '../shared/returns';

// Store credit is a single-use Wix Stores coupon worth a fixed amount, created
// instead of a refund. Wix has no balance for coupons: whatever the customer
// doesn't use on the next order is lost, and the customer is told so.

const createCoupon = auth.elevate(coupons.createCoupon);

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I

function randomPart(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/** e.g. "R10003-1" -> "CR10003-1-7K2Q". Coupon codes are capped at 20 characters. */
export function creditCode(rmaNumber: string): string {
  const prefix = `C${rmaNumber}`.replace(/[^A-Z0-9-]/gi, '').toUpperCase();
  const code = `${prefix}-${randomPart(4)}`;
  return code.length <= 20 ? code : `CREDIT-${randomPart(10)}`;
}

/** Creates the coupon; returns the credit and the coupon's ID. */
export async function issueStoreCredit(
  request: ReturnRequest,
  amount: number,
): Promise<StoreCredit & { couponId: string }> {
  const now = Date.now();
  const expiresAt = new Date(now + STORE_CREDIT_VALID_DAYS * 24 * 60 * 60 * 1000);
  const code = creditCode(request.rmaNumber);
  const { _id } = await createCoupon({
    name: `Store credit ${request.rmaNumber}`,
    code,
    startTime: String(now),
    expirationTime: String(expiresAt.getTime()),
    usageLimit: 1,
    limitPerCustomer: 1,
    // Wix defaults limitedToOneItem to true, which caps the discount at the cheapest item in the cart.
    limitedToOneItem: false,
    appliesToSubscriptions: false,
    active: true,
    scope: { namespace: 'stores' },
    moneyOffAmount: amount,
  });
  if (!_id) throw new Error('Wix did not return a coupon ID');
  return { code, amount, expiresAt: expiresAt.toISOString(), couponId: _id };
}
