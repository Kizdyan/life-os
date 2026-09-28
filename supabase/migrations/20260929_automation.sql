alter table public.life_items add column if not exists carry_forward boolean not null default false;
alter table public.life_items add column if not exists carry_count integer not null default 0;
alter table public.life_items add column if not exists origin_item_id text;
alter table public.life_items add column if not exists source text not null default 'life_os';

create table if not exists public.life_outbox (
 id text primary key,
 kind text not null,
 payload jsonb not null,
 idempotency_key text not null unique,
 state text not null default 'pending',
 attempts integer not null default 0,
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create index if not exists life_outbox_state_idx on public.life_outbox(state,created_at);
