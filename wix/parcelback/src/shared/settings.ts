import { RETURN_REASONS, RETURN_WINDOW_DAYS } from './returns';

// Merchant settings from the Settings page. Stores without saved settings get
// DEFAULT_SETTINGS, which match the app's behaviour before the page existed.

export type StoreSettings = {
  acceptReturns: boolean;
  returnWindowDays: number;
  // Reasons offered in the return form, in display order. Built-in reasons
  // (RETURN_REASONS) are translated in the widget; custom ones are shown as typed.
  returnReasons: string[];
  // Wix Stores products that can't be returned. They can still be withdrawn
  // from under EU law; legal exemptions are decided case by case.
  finalSaleProducts: FinalSaleProduct[];
};

export type FinalSaleProduct = { id: string; name: string };

export const DEFAULT_SETTINGS: StoreSettings = {
  acceptReturns: true,
  returnWindowDays: RETURN_WINDOW_DAYS,
  returnReasons: [...RETURN_REASONS],
  finalSaleProducts: [],
};

export const LIMITS = {
  minWindowDays: 1,
  maxWindowDays: 365,
  maxReasons: 12,
  maxCustomReasons: 5,
  maxReasonLength: 60,
  maxFinalSaleProducts: 200,
};

export const isBuiltInReason = (reason: string) => (RETURN_REASONS as readonly string[]).includes(reason);

export type SettingsError = { error: string; field: keyof StoreSettings };

/** Checks and normalises settings from the dashboard. Returns the clean settings, or an error and the field it's about. */
export function validateSettings(input: unknown): { settings: StoreSettings } | SettingsError {
  const raw = (input ?? {}) as Record<string, unknown>;

  if (typeof raw.acceptReturns !== 'boolean') {
    return { error: 'Choose whether you accept returns.', field: 'acceptReturns' };
  }

  const days = Number(raw.returnWindowDays);
  if (!Number.isInteger(days) || days < LIMITS.minWindowDays || days > LIMITS.maxWindowDays) {
    return {
      error: `The return window must be between ${LIMITS.minWindowDays} and ${LIMITS.maxWindowDays} days.`,
      field: 'returnWindowDays',
    };
  }

  if (!Array.isArray(raw.returnReasons)) return { error: 'Invalid return reasons.', field: 'returnReasons' };
  const reasons: string[] = [];
  for (const value of raw.returnReasons) {
    const reason = String(value ?? '').trim().replace(/\s+/g, ' ');
    if (!reason) continue;
    if (reason.length > LIMITS.maxReasonLength) {
      return { error: `Keep each reason under ${LIMITS.maxReasonLength} characters.`, field: 'returnReasons' };
    }
    if (!reasons.some((r) => r.toLowerCase() === reason.toLowerCase())) reasons.push(reason);
  }
  if (!reasons.length) return { error: 'Offer at least one return reason.', field: 'returnReasons' };
  if (reasons.length > LIMITS.maxReasons) {
    return { error: `Offer at most ${LIMITS.maxReasons} return reasons.`, field: 'returnReasons' };
  }
  if (reasons.filter((r) => !isBuiltInReason(r)).length > LIMITS.maxCustomReasons) {
    return { error: `Add at most ${LIMITS.maxCustomReasons} custom reasons.`, field: 'returnReasons' };
  }

  if (!Array.isArray(raw.finalSaleProducts)) return { error: 'Invalid final sale products.', field: 'finalSaleProducts' };
  const finalSaleProducts: FinalSaleProduct[] = [];
  for (const value of raw.finalSaleProducts) {
    const id = String((value as { id?: unknown })?.id ?? '');
    const name = String((value as { name?: unknown })?.name ?? '').trim().slice(0, 200);
    if (!/^[\w-]{1,100}$/.test(id)) return { error: 'Invalid final sale products.', field: 'finalSaleProducts' };
    if (!finalSaleProducts.some((p) => p.id === id)) finalSaleProducts.push({ id, name });
  }
  if (finalSaleProducts.length > LIMITS.maxFinalSaleProducts) {
    return { error: `Mark at most ${LIMITS.maxFinalSaleProducts} products as final sale.`, field: 'finalSaleProducts' };
  }

  return {
    settings: { acceptReturns: raw.acceptReturns, returnWindowDays: days, returnReasons: reasons, finalSaleProducts },
  };
}
