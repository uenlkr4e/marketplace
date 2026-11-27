import { neon } from '@neondatabase/serverless';
import type { HistoryEntry, ReturnItem, ReturnRequest, ReturnStatus } from '../shared/returns';

// Data access for return requests. Every function takes the Wix app
// instance ID and filters on it, so one store can never see another's data.

let client: ReturnType<typeof neon> | null = null;

function sql() {
  if (!client) {
    // Secret set with `wix app env set`; exposed as a server-side env var.
    const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    const url = nodeEnv?.DATABASE_URL ?? (import.meta.env.DATABASE_URL as string | undefined);
    if (!url) throw new Error('DATABASE_URL is not configured (wix app env set --key DATABASE_URL ...)');
    client = neon(url);
  }
  return client;
}

type Row = {
  id: string;
  rma_number: string;
  order_id: string;
  order_number: string;
  customer_email: string;
  contact_id: string | null;
  items: ReturnItem[];
  reason: string;
  customer_note: string;
  currency: string;
  requested_amount: string;
  status: ReturnStatus;
  merchant_note: string | null;
  refunded_amount: string | null;
  history: HistoryEntry[];
  created_at: string | Date;
  updated_at: string | Date;
};

const toRequest = (r: Row): ReturnRequest => ({
  id: r.id,
  rmaNumber: r.rma_number,
  orderId: r.order_id,
  orderNumber: r.order_number,
  customerEmail: r.customer_email,
  contactId: r.contact_id,
  items: r.items,
  reason: r.reason,
  customerNote: r.customer_note,
  currency: r.currency,
  requestedAmount: Number(r.requested_amount),
  status: r.status,
  merchantNote: r.merchant_note,
  refundedAmount: r.refunded_amount === null ? null : Number(r.refunded_amount),
  history: r.history,
  createdAt: new Date(r.created_at).toISOString(),
  updatedAt: new Date(r.updated_at).toISOString(),
});

const rows = (result: unknown) => (result as Row[]).map(toRequest);

// Request IDs come from the dashboard; reject malformed ones before Postgres does.
const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export async function listForOrder(instanceId: string, orderId: string): Promise<ReturnRequest[]> {
  return rows(
    await sql()`select * from return_requests
                where instance_id = ${instanceId} and order_id = ${orderId}
                order by created_at`,
  );
}

export async function listAll(instanceId: string, limit = 500): Promise<ReturnRequest[]> {
  return rows(
    await sql()`select * from return_requests
                where instance_id = ${instanceId}
                order by created_at desc limit ${limit}`,
  );
}

export async function getById(instanceId: string, id: string): Promise<ReturnRequest | null> {
  if (!isUuid(id)) return null;
  const found = rows(await sql()`select * from return_requests where instance_id = ${instanceId} and id = ${id}`);
  return found[0] ?? null;
}

export type NewReturnRequest = Omit<
  ReturnRequest,
  'id' | 'rmaNumber' | 'status' | 'merchantNote' | 'refundedAmount' | 'history' | 'createdAt' | 'updatedAt'
>;

/**
 * Inserts a REQUESTED return. The RMA number is R<order>-<n>; if two requests
 * race for the same n, the unique constraint rejects one and we retry.
 */
export async function insertRequest(instanceId: string, input: NewReturnRequest): Promise<ReturnRequest> {
  const history = JSON.stringify([{ status: 'REQUESTED', at: new Date().toISOString() }]);
  for (let attempt = 0; attempt < 3; attempt++) {
    const [{ n }] = (await sql()`select count(*)::int + 1 as n from return_requests
                                 where instance_id = ${instanceId} and order_id = ${input.orderId}`) as { n: number }[];
    try {
      return rows(
        await sql()`insert into return_requests
          (instance_id, rma_number, order_id, order_number, customer_email, contact_id, items, reason,
           customer_note, currency, requested_amount, status, history)
          values (${instanceId}, ${`R${input.orderNumber}-${n}`}, ${input.orderId}, ${input.orderNumber},
                  ${input.customerEmail}, ${input.contactId}, ${JSON.stringify(input.items)}::jsonb, ${input.reason},
                  ${input.customerNote}, ${input.currency}, ${input.requestedAmount}, 'REQUESTED', ${history}::jsonb)
          returning *`,
      )[0];
    } catch (e) {
      if (!String((e as Error).message).includes('return_requests_instance_id_rma_number_key')) throw e;
    }
  }
  throw new Error('Could not allocate an RMA number');
}

/**
 * Atomically moves a request from one of `from` to `to` and appends history.
 * Returns null when the request isn't in an allowed state (or doesn't exist),
 * which is how double clicks and stale dashboards are rejected.
 */
export async function transition(
  instanceId: string,
  id: string,
  from: ReturnStatus[],
  to: ReturnStatus,
  extra: { note?: string; merchantNote?: string; refundedAmount?: number } = {},
): Promise<ReturnRequest | null> {
  if (!isUuid(id)) return null;
  const entry = JSON.stringify([{ status: to, at: new Date().toISOString(), ...(extra.note ? { note: extra.note } : {}) }]);
  const updated = rows(
    await sql()`update return_requests
                set status = ${to},
                    history = history || ${entry}::jsonb,
                    refunded_amount = coalesce(${extra.refundedAmount ?? null}::numeric, refunded_amount),
                    merchant_note = coalesce(${extra.merchantNote ?? null}, merchant_note),
                    updated_at = now()
                where instance_id = ${instanceId} and id = ${id} and status = any(${from})
                returning *`,
  );
  return updated[0] ?? null;
}
