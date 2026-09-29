create table if not exists public.life_plan_requests(idempotency_key text primary key,user_id uuid not null default auth.uid(),created_at timestamptz not null default now(),result jsonb not null default '{}'::jsonb);
alter table public.life_plan_requests enable row level security;
drop policy if exists life_plan_requests_owner on public.life_plan_requests;
create policy life_plan_requests_owner on public.life_plan_requests for all using(user_id=auth.uid()) with check(user_id=auth.uid());

create or replace function public.life_apply_plan(p_idempotency_key text,p_items jsonb,p_source text default 'erika')
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_existing jsonb; v_item jsonb; v_ids jsonb:='[]'::jsonb; v_id text; v_start timestamptz; v_end timestamptz;
begin
 select result into v_existing from public.life_plan_requests where idempotency_key=p_idempotency_key and user_id=auth.uid();
 if found then return v_existing||jsonb_build_object('replayed',true); end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'empty_plan'; end if;
 for v_item in select * from jsonb_array_elements(p_items) loop
  v_id:=coalesce(v_item->>'id',gen_random_uuid()::text);v_start:=(v_item->>'planned_start')::timestamptz;v_end:=(v_item->>'planned_end')::timestamptz;
  if v_start is null or v_end is null or v_end<=v_start then raise exception 'invalid_plan_interval'; end if;
  if exists(select 1 from public.life_items x where x.user_id=auth.uid() and x.planned_start<v_end and x.planned_end>v_start and coalesce(x.status,'planned') not in('completed','not_completed')) then raise exception 'plan_conflict'; end if;
  insert into public.life_items(id,user_id,kind,title,status,planned_start,planned_end,version,created_at,updated_at,source)
  values(v_id,auth.uid(),coalesce(v_item->>'kind','task'),v_item->>'title','planned',v_start,v_end,1,now(),now(),p_source);
  v_ids:=v_ids||jsonb_build_array(v_id);
 end loop;
 v_existing:=jsonb_build_object('applied',true,'ids',v_ids,'replayed',false);
 insert into public.life_plan_requests(idempotency_key,user_id,result)values(p_idempotency_key,auth.uid(),v_existing);
 return v_existing;
exception when others then raise;
end;$$;