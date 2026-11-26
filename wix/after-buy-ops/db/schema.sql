-- after-buy-ops database schema (Neon Postgres).
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
