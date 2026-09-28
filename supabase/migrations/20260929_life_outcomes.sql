create table if not exists public.life_items (
  id text primary key,
  kind text not null,
  title text not null,
  status text not null default 'planned',
  planned_start timestamptz,
  planned_end timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  project_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.life_outcomes (
  id text primary key,
  item_id text not null references public.life_items(id) on delete cascade,
  planned_date date not null,
  result text not null,
  source text not null check (source in ('ui','erika','system')),
  successor_item_id text references public.life_items(id),
  recorded_at timestamptz not null default now(),
  unique(item_id, planned_date)
);

create index if not exists life_items_planned_start_idx on public.life_items(planned_start);
create index if not exists life_outcomes_planned_date_idx on public.life_outcomes(planned_date);

alter table public.life_items enable row level security;
alter table public.life_outcomes enable row level security;
