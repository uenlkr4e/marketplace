-- Parcelback database schema (Neon Postgres).
-- Idempotent: safe to run repeatedly with `npm run db:migrate`.

create table if not exists return_requests (
  id               uuid primary key default gen_random_uuid(),
  -- Wix app instance = one store. Every query must filter on it.
  instance_id      text not null,
  rma_number       text not null,
  order_id         text not null,
  order_number     text not null,
  customer_email   text not null,
  -- [{ lineItemId, name, quantity, unitAmount }]
  items            jsonb not null,
  reason           text not null,
  customer_note    text not null default '',
  currency         text not null,
  requested_amount numeric(12, 2) not null,
  status           text not null
                   check (status in ('REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDING', 'REFUNDED')),
  merchant_note    text,
  refunded_amount  numeric(12, 2),
  -- [{ status, at, note? }]
  history          jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (instance_id, rma_number)
);

create index if not exists return_requests_order_idx on return_requests (instance_id, order_id);
create index if not exists return_requests_created_idx on return_requests (instance_id, created_at desc);

-- Wix CRM contact of the buyer; lets automations email the customer. (added 2026-11-26)
alter table return_requests add column if not exists contact_id text;

-- EU right of withdrawal (Directive (EU) 2023/2673). (added 2026-11-27)
-- kind: RETURN = store return policy; WITHDRAWAL = statutory withdrawal (no reason required).
alter table return_requests add column if not exists kind text not null default 'RETURN';
alter table return_requests add column if not exists customer_name text;
alter table return_requests drop constraint if exists return_requests_kind_check;
alter table return_requests add constraint return_requests_kind_check check (kind in ('RETURN', 'WITHDRAWAL'));

-- Per-store settings (Settings page). A missing row means the defaults in src/shared/settings.ts. (added 2026-11-27)
create table if not exists store_settings (
  instance_id text primary key,
  accept_returns boolean not null default true,
  return_window_days integer not null default 30 check (return_window_days between 1 and 365),
  return_reasons jsonb not null,
  updated_at timestamptz not null default now()
);

-- Rate limiting for the public (customer) endpoints: one counter per key and fixed time window.
-- Keys are hashed (store + rule + client), so no IP addresses are stored. (added 2026-11-27)
create table if not exists rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 1,
  primary key (key, window_start)
);

-- Short per-order lock so two simultaneous requests can't claim the same items.
-- Expires on its own if a request dies while holding it. (added 2026-11-27)
create table if not exists order_locks (
  instance_id text not null,
  order_id text not null,
  token uuid not null,
  locked_until timestamptz not null,
  primary key (instance_id, order_id)
);

-- Final-sale products: [{ id, name }] by Wix Stores catalog item ID; excluded from returns, not from EU withdrawal. (added 2026-11-27)
alter table store_settings add column if not exists final_sale_products jsonb not null default '[]'::jsonb;

-- Shown to the customer once a return is approved: return address, packing notes. (added 2026-11-28)
alter table store_settings add column if not exists return_instructions text not null default '';

-- Store credit: instead of a refund, the merchant issues a single-use Wix Stores
-- coupon for the amount. CREDITED keeps holding the items (Wix doesn't see a
-- coupon as a refund). (added 2026-11-28)
alter table return_requests drop constraint if exists return_requests_status_check;
alter table return_requests add constraint return_requests_status_check
  check (status in ('REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDING', 'REFUNDED', 'CREDITED'));
alter table return_requests add column if not exists credit_code text;
alter table return_requests add column if not exists credit_amount numeric(12, 2);
alter table return_requests add column if not exists credit_expires_at timestamptz;
alter table return_requests add column if not exists credit_coupon_id text;
