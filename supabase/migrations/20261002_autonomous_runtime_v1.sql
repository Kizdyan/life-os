create schema if not exists private;
revoke all on schema private from public;

create table if not exists public.life_runtime_state (
  user_id uuid primary key,
  store_revision bigint not null default 0 check (store_revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.life_runtime_records (
  user_id uuid not null,
  record_id text not null,
  kind text not null check (kind in ('life_item','life_outcome','memory','audit','project','goal','setting')),
  version integer not null check (version > 0),
  payload jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  server_revision bigint not null check (server_revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, record_id)
);

create table if not exists public.life_runtime_mutations (
  user_id uuid not null,
  mutation_id text not null,
  record_id text not null,
  expected_version integer,
  applied_version integer not null check (applied_version > 0),
  store_revision bigint not null check (store_revision > 0),
  applied_at timestamptz not null default now(),
  primary key (user_id, mutation_id)
);

create table if not exists public.life_runtime_audit (
  audit_id bigint generated always as identity primary key,
  user_id uuid not null,
  mutation_id text not null,
  record_id text not null,
  kind text not null,
  before_version integer,
  after_version integer not null,
  store_revision bigint not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, mutation_id)
);

create index if not exists life_runtime_records_revision_idx
  on public.life_runtime_records(user_id, server_revision);
create index if not exists life_runtime_audit_created_idx
  on public.life_runtime_audit(user_id, created_at desc);

alter table public.life_runtime_state enable row level security;
alter table public.life_runtime_records enable row level security;
alter table public.life_runtime_mutations enable row level security;
alter table public.life_runtime_audit enable row level security;

revoke all on table public.life_runtime_state from anon, authenticated;
revoke all on table public.life_runtime_records from anon, authenticated;
revoke all on table public.life_runtime_mutations from anon, authenticated;
revoke all on table public.life_runtime_audit from anon, authenticated;

grant select on table public.life_runtime_state to authenticated;
grant select on table public.life_runtime_records to authenticated;
grant select on table public.life_runtime_audit to authenticated;

drop policy if exists life_runtime_state_select_owner on public.life_runtime_state;
create policy life_runtime_state_select_owner
  on public.life_runtime_state for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists life_runtime_records_select_owner on public.life_runtime_records;
create policy life_runtime_records_select_owner
  on public.life_runtime_records for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists life_runtime_audit_select_owner on public.life_runtime_audit;
create policy life_runtime_audit_select_owner
  on public.life_runtime_audit for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create or replace function private.life_runtime_apply_mutation(
  p_mutation_id text,
  p_record_id text,
  p_kind text,
  p_expected_version integer,
  p_payload jsonb,
  p_deleted boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_revision bigint;
  v_current public.life_runtime_records%rowtype;
  v_receipt public.life_runtime_mutations%rowtype;
  v_next_version integer;
  v_now timestamptz := now();
  v_record jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if coalesce(trim(p_mutation_id), '') = '' then
    raise exception 'mutation id required' using errcode = '22023';
  end if;
  if coalesce(trim(p_record_id), '') = '' then
    raise exception 'record id required' using errcode = '22023';
  end if;
  if p_kind not in ('life_item','life_outcome','memory','audit','project','goal','setting') then
    raise exception 'unsupported record kind' using errcode = '22023';
  end if;
  if p_expected_version is not null and p_expected_version < 1 then
    raise exception 'expected version must be null or positive' using errcode = '22023';
  end if;

  insert into public.life_runtime_state(user_id, store_revision)
  values (v_user_id, 0)
  on conflict (user_id) do nothing;

  select * into v_receipt
  from public.life_runtime_mutations
  where user_id = v_user_id and mutation_id = p_mutation_id;

  if found then
    select jsonb_build_object(
      'id', r.record_id,
      'userId', r.user_id,
      'kind', r.kind,
      'version', r.version,
      'payload', r.payload,
      'deleted', r.deleted,
      'updatedAt', r.updated_at
    ) into v_record
    from public.life_runtime_records r
    where r.user_id = v_user_id and r.record_id = v_receipt.record_id;

    return jsonb_build_object(
      'mutationId', p_mutation_id,
      'status', 'duplicate',
      'storeRevision', v_receipt.store_revision,
      'record', v_record,
      'conflict', null
    );
  end if;

  select store_revision into v_revision
  from public.life_runtime_state
  where user_id = v_user_id
  for update;

  -- Re-check after acquiring the per-user revision lock so concurrent duplicate
  -- requests cannot both pass the first receipt lookup.
  select * into v_receipt
  from public.life_runtime_mutations
  where user_id = v_user_id and mutation_id = p_mutation_id;

  if found then
    select jsonb_build_object(
      'id', r.record_id,
      'userId', r.user_id,
      'kind', r.kind,
      'version', r.version,
      'payload', r.payload,
      'deleted', r.deleted,
      'updatedAt', r.updated_at
    ) into v_record
    from public.life_runtime_records r
    where r.user_id = v_user_id and r.record_id = v_receipt.record_id;

    return jsonb_build_object(
      'mutationId', p_mutation_id,
      'status', 'duplicate',
      'storeRevision', v_receipt.store_revision,
      'record', v_record,
      'conflict', null
    );
  end if;

  select * into v_current
  from public.life_runtime_records
  where user_id = v_user_id and record_id = p_record_id
  for update;

  if (not found and p_expected_version is not null)
     or (found and p_expected_version is distinct from v_current.version) then
    if found then
      v_record := jsonb_build_object(
        'id', v_current.record_id,
        'userId', v_current.user_id,
        'kind', v_current.kind,
        'version', v_current.version,
        'payload', v_current.payload,
        'deleted', v_current.deleted,
        'updatedAt', v_current.updated_at
      );
    else
      v_record := null;
    end if;

    return jsonb_build_object(
      'mutationId', p_mutation_id,
      'status', 'conflict',
      'storeRevision', v_revision,
      'record', v_record,
      'conflict', jsonb_build_object(
        'expectedVersion', p_expected_version,
        'currentVersion', case when v_current.record_id is null then null else v_current.version end
      )
    );
  end if;

  v_next_version := coalesce(v_current.version, 0) + 1;
  v_revision := v_revision + 1;

  update public.life_runtime_state
  set store_revision = v_revision, updated_at = v_now
  where user_id = v_user_id;

  insert into public.life_runtime_records(
    user_id, record_id, kind, version, payload, deleted, server_revision, updated_at
  ) values (
    v_user_id, p_record_id, p_kind, v_next_version, coalesce(p_payload, '{}'::jsonb),
    coalesce(p_deleted, false), v_revision, v_now
  )
  on conflict (user_id, record_id) do update set
    kind = excluded.kind,
    version = excluded.version,
    payload = excluded.payload,
    deleted = excluded.deleted,
    server_revision = excluded.server_revision,
    updated_at = excluded.updated_at;

  insert into public.life_runtime_mutations(
    user_id, mutation_id, record_id, expected_version, applied_version, store_revision, applied_at
  ) values (
    v_user_id, p_mutation_id, p_record_id, p_expected_version, v_next_version, v_revision, v_now
  );

  insert into public.life_runtime_audit(
    user_id, mutation_id, record_id, kind, before_version, after_version, store_revision, payload, created_at
  ) values (
    v_user_id, p_mutation_id, p_record_id, p_kind, v_current.version,
    v_next_version, v_revision, coalesce(p_payload, '{}'::jsonb), v_now
  );

  v_record := jsonb_build_object(
    'id', p_record_id,
    'userId', v_user_id,
    'kind', p_kind,
    'version', v_next_version,
    'payload', coalesce(p_payload, '{}'::jsonb),
    'deleted', coalesce(p_deleted, false),
    'updatedAt', v_now
  );

  return jsonb_build_object(
    'mutationId', p_mutation_id,
    'status', 'applied',
    'storeRevision', v_revision,
    'record', v_record,
    'conflict', null
  );
end;
$$;

revoke all on function private.life_runtime_apply_mutation(text,text,text,integer,jsonb,boolean) from public;
grant usage on schema private to authenticated;
grant execute on function private.life_runtime_apply_mutation(text,text,text,integer,jsonb,boolean) to authenticated;

create or replace function public.life_runtime_apply_mutation(
  p_mutation_id text,
  p_record_id text,
  p_kind text,
  p_expected_version integer,
  p_payload jsonb,
  p_deleted boolean default false
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.life_runtime_apply_mutation(
    p_mutation_id,
    p_record_id,
    p_kind,
    p_expected_version,
    p_payload,
    p_deleted
  );
$$;

revoke all on function public.life_runtime_apply_mutation(text,text,text,integer,jsonb,boolean) from public, anon;
grant execute on function public.life_runtime_apply_mutation(text,text,text,integer,jsonb,boolean) to authenticated;
