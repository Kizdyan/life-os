begin;

insert into public.life_runtime_state(user_id, store_revision) values
  ('11111111-1111-1111-1111-111111111111', 1),
  ('22222222-2222-2222-2222-222222222222', 1);

insert into public.life_runtime_records(
  user_id, record_id, kind, version, payload, deleted, server_revision
) values
  ('11111111-1111-1111-1111-111111111111', 'one', 'life_item', 1, '{"title":"one"}', false, 1),
  ('22222222-2222-2222-2222-222222222222', 'two', 'life_item', 1, '{"title":"two"}', false, 1);

do $$
begin
  if has_table_privilege('anon', 'public.life_runtime_records', 'SELECT') then
    raise exception 'anon must not have SELECT on life_runtime_records';
  end if;
  if not has_table_privilege('authenticated', 'public.life_runtime_records', 'SELECT') then
    raise exception 'authenticated must have SELECT on life_runtime_records';
  end if;
  if has_table_privilege('authenticated', 'public.life_runtime_records', 'UPDATE') then
    raise exception 'authenticated must not bypass mutation RPC with direct UPDATE';
  end if;
  if has_table_privilege('authenticated', 'public.life_runtime_audit', 'UPDATE')
     or has_table_privilege('authenticated', 'public.life_runtime_audit', 'DELETE') then
    raise exception 'audit rows must be immutable to authenticated clients';
  end if;
  if not has_table_privilege('service_role', 'public.life_runtime_state', 'SELECT,INSERT,UPDATE,DELETE')
     or not has_table_privilege('service_role', 'public.life_runtime_records', 'SELECT,INSERT,UPDATE,DELETE')
     or not has_table_privilege('service_role', 'public.life_runtime_mutations', 'SELECT,INSERT,UPDATE,DELETE')
     or not has_table_privilege('service_role', 'public.life_runtime_audit', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'service_role must have explicit runtime table grants';
  end if;
  if not has_sequence_privilege('service_role', 'public.life_runtime_audit_audit_id_seq', 'USAGE') then
    raise exception 'service_role must have USAGE on the audit identity sequence';
  end if;
  if has_function_privilege(
    'anon',
    'public.life_runtime_apply_mutation(text,text,text,integer,jsonb,boolean)',
    'EXECUTE'
  ) then
    raise exception 'anon must not execute runtime mutation RPC';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.life_runtime_apply_mutation(text,text,text,integer,jsonb,boolean)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must execute runtime mutation RPC';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.life_runtime_apply_mutation_server(uuid,text,text,text,integer,jsonb,boolean)',
    'EXECUTE'
  ) then
    raise exception 'service_role must execute the server runtime mutation RPC';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count from public.life_runtime_records;
  if visible_count <> 1 then
    raise exception 'RLS leak for user one: expected 1 record, got %', visible_count;
  end if;
end $$;

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count from public.life_runtime_records;
  if visible_count <> 1 then
    raise exception 'RLS leak for user two: expected 1 record, got %', visible_count;
  end if;
end $$;

reset role;
rollback;
