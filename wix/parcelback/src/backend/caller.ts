import { auth } from '@wix/essentials';

export type Caller = { instanceId: string; subjectType: string; subjectId: string };

/** Identifies the store (app instance) and the kind of caller from the request's Wix token. */
export async function getCaller(): Promise<Caller | null> {
  const info = await auth.getTokenInfo();
  if (!info.active || !info.instanceId) return null;
  return { instanceId: info.instanceId, subjectType: info.subjectType, subjectId: info.subjectId };
}

/** Merchant endpoints: only Wix users (site owner or collaborators in the dashboard). */
export async function getMerchant(): Promise<Caller | null> {
  const caller = await getCaller();
  return caller?.subjectType === 'USER' ? caller : null;
}
