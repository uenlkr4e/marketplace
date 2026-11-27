import type { Caller } from './caller';
import { hitCounter, peekCounter } from './db';

// Rate limits for the public endpoints (order lookup, return request,
// withdrawal). They stop order-number/email guessing and request floods while
// leaving plenty of room for a real customer.
//
// A "client" is the visitor's IP address when the platform forwards one, else
// the Wix visitor ID from the token. Keys are SHA-256 hashes, so no IP
// addresses end up in the database.

const RULES = {
  // Any call to a public endpoint, per client.
  requests: { limit: 30, windowSeconds: 10 * 60 },
  // Lookups that matched no order (wrong number or email), per client.
  failedLookups: { limit: 10, windowSeconds: 60 * 60 },
  // Failed lookups across all clients of one store, against distributed guessing.
  storeFailedLookups: { limit: 200, windowSeconds: 60 * 60 },
};

type RuleName = keyof typeof RULES;

const IP_HEADERS = ['cf-connecting-ip', 'x-real-ip', 'x-forwarded-for'];

function clientId(request: Request, caller: Caller): string {
  for (const header of IP_HEADERS) {
    const value = request.headers.get(header)?.split(',')[0]?.trim();
    if (value) return `ip:${value}`;
  }
  return `visitor:${caller.subjectId}`;
}

async function hash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const keyFor = (rule: RuleName, caller: Caller, client: string | null) =>
  hash(`${caller.instanceId}|${rule}|${client ?? '*'}`);

export type Limited = { retryAfter: number };

/**
 * Counts this call and checks the limits. Returns null when the call may go
 * ahead, or how many seconds to wait.
 */
export async function checkLimits(request: Request, caller: Caller): Promise<Limited | null> {
  const client = clientId(request, caller);
  const [requests, failed, storeFailed] = await Promise.all([
    hitCounter(await keyFor('requests', caller, client), RULES.requests.windowSeconds),
    peekCounter(await keyFor('failedLookups', caller, client), RULES.failedLookups.windowSeconds),
    peekCounter(await keyFor('storeFailedLookups', caller, null), RULES.storeFailedLookups.windowSeconds),
  ]);
  if (requests.count > RULES.requests.limit) return { retryAfter: requests.resetIn };
  if (failed.count >= RULES.failedLookups.limit) return { retryAfter: failed.resetIn };
  if (storeFailed.count >= RULES.storeFailedLookups.limit) return { retryAfter: storeFailed.resetIn };
  return null;
}

/** Records a lookup that matched no order (wrong order number or email). */
export async function recordFailedLookup(request: Request, caller: Caller): Promise<void> {
  const client = clientId(request, caller);
  await Promise.all([
    hitCounter(await keyFor('failedLookups', caller, client), RULES.failedLookups.windowSeconds),
    hitCounter(await keyFor('storeFailedLookups', caller, null), RULES.storeFailedLookups.windowSeconds),
  ]);
}
