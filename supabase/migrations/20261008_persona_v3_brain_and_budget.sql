-- Prototype-only cost/cache tables; no existing production tables are altered.
-- All operations are exclusively through the authenticated Persona V3 Edge Function,
-- using the Supabase service role. Browser/anon/authenticated have no access.
create table if not exists public.persona_v3_brain (
  cache_key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  constraint persona_v3_brain_key_length check (char_length(cache_key) between 1 and 100),
  constraint persona_v3_brain_payload_object check (jsonb_typeof(payload) = 'object')
);
alter table public.persona_v3_brain enable row level security;
revoke all on public.persona_v3_brain from anon, authenticated;

create table if not exists public.persona_v3_budget_usage (
  period_key text primary key,
  ai_calls integer not null default 0,
  reserved_usd numeric(12,6) not null default 0,
  estimated_input_tokens bigint not null default 0,
  estimated_output_tokens bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint persona_v3_budget_nonnegative check (
    ai_calls >= 0 and reserved_usd >= 0 and
    estimated_input_tokens >= 0 and estimated_output_tokens >= 0
  )
);
alter table public.persona_v3_budget_usage enable row level security;
revoke all on public.persona_v3_budget_usage from anon, authenticated;

-- Atomic concurrent spending reservation: denial does not mutate counters.
-- This function belongs to the prototype namespace only.
create or replace function public.persona_v3_budget_reserve(
  p_day text,
  p_month text,
  p_daily_calls integer,
  p_daily_usd numeric,
  p_monthly_usd numeric,
  p_reserve_usd numeric,
  p_est_input_tokens integer,
  p_est_output_tokens integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day public.persona_v3_budget_usage%rowtype;
  v_month public.persona_v3_budget_usage%rowtype;
begin
  if p_day !~ '^day:[0-9]{4}-[0-9]{2}-[0-9]{2}$' or
     p_month !~ '^month:[0-9]{4}-[0-9]{2}$' or
     p_daily_calls < 1 or p_daily_calls > 50 or
     p_daily_usd <= 0 or p_monthly_usd <= 0 or
     p_reserve_usd <= 0 or p_reserve_usd > 1 or
     p_est_input_tokens < 0 or p_est_output_tokens < 0 then
    return jsonb_build_object('allowed',false,'mode','ECONOMY','reason','invalid_budget_config');
  end if;

  insert into public.persona_v3_budget_usage(period_key) values (p_day)
    on conflict(period_key) do nothing;
  insert into public.persona_v3_budget_usage(period_key) values (p_month)
    on conflict(period_key) do nothing;

  -- Consistent row lock order for concurrent Edge worker requests.
  select * into v_day from public.persona_v3_budget_usage
    where period_key = p_day for update;
  select * into v_month from public.persona_v3_budget_usage
    where period_key = p_month for update;

  if v_day.ai_calls >= p_daily_calls or
     v_day.reserved_usd + p_reserve_usd > p_daily_usd or
     v_month.reserved_usd + p_reserve_usd > p_monthly_usd then
    return jsonb_build_object('allowed',false,'mode','ECONOMY','reason','budget_exhausted',
       'dailyCalls',v_day.ai_calls,'dailyUsd',v_day.reserved_usd,
       'monthlyUsd',v_month.reserved_usd);
  end if;

  update public.persona_v3_budget_usage set
    ai_calls = ai_calls + 1,
    reserved_usd = reserved_usd + p_reserve_usd,
    estimated_input_tokens = estimated_input_tokens + p_est_input_tokens,
    estimated_output_tokens = estimated_output_tokens + p_est_output_tokens,
    updated_at = now()
  where period_key in (p_day,p_month);

  return jsonb_build_object('allowed',true,'mode','AI',
     'dailyCalls',v_day.ai_calls + 1,
     'dailyUsd',v_day.reserved_usd + p_reserve_usd,
     'monthlyUsd',v_month.reserved_usd + p_reserve_usd,
     'reservedUsd',p_reserve_usd);
end;
$$;
revoke all on function public.persona_v3_budget_reserve(
  text,text,integer,numeric,numeric,numeric,integer,integer
) from public, anon, authenticated;
grant execute on function public.persona_v3_budget_reserve(
  text,text,integer,numeric,numeric,numeric,integer,integer
) to service_role;
