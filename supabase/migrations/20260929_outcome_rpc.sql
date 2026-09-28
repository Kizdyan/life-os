create or replace function public.life_set_outcome(
  p_item_id text,
  p_command text,
  p_planned_date date,
  p_source text,
  p_now timestamptz,
  p_carry_forward boolean default false,
  p_next_date date default null,
  p_successor_id text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.life_items%rowtype;
  v_result text;
  v_status text;
  v_successor jsonb := null;
begin
  select * into v_item from public.life_items where id=p_item_id for update;
  if not found then raise exception 'life_item_not_found'; end if;

  if p_command='complete' then v_result:='completed'; v_status:='completed';
  elsif p_command='partial' then v_result:='partial'; v_status:='partial';
  elsif p_command='move' then v_result:='moved'; v_status:='moved';
  elsif p_command='not_complete' and p_carry_forward then v_result:='missed_time'; v_status:='missed_time';
  elsif p_command='not_complete' then v_result:='not_completed'; v_status:='not_completed';
  else raise exception 'invalid_outcome_command'; end if;

  update public.life_items set
    status=v_status,
    actual_end=case when p_command='complete' then p_now else actual_end end,
    version=version+1,
    updated_at=p_now
  where id=p_item_id;

  if p_carry_forward then
    if p_next_date is null or p_successor_id is null then raise exception 'carry_forward_requires_successor'; end if;
    insert into public.life_items(id,kind,title,status,planned_start,planned_end,project_id,version,created_at,updated_at,carry_forward,carry_count,origin_item_id,source)
    values(
      p_successor_id,v_item.kind,v_item.title,'planned',
      case when v_item.planned_start is null then null else p_next_date + v_item.planned_start::time end,
      case when v_item.planned_end is null then null else p_next_date + v_item.planned_end::time end,
      v_item.project_id,1,p_now,p_now,v_item.carry_forward,v_item.carry_count+1,coalesce(v_item.origin_item_id,v_item.id),'life_os'
    ) on conflict(id) do nothing;
    v_successor:=jsonb_build_object('id',p_successor_id);
  end if;

  insert into public.life_outcomes(id,item_id,planned_date,result,source,successor_item_id,recorded_at)
  values(p_item_id||':'||p_planned_date,p_item_id,p_planned_date,v_result,p_source,p_successor_id,p_now)
  on conflict(item_id,planned_date) do update set
    result=excluded.result,source=excluded.source,successor_item_id=excluded.successor_item_id,recorded_at=excluded.recorded_at;

  return jsonb_build_object('item_id',p_item_id,'status',v_status,'result',v_result,'successor',v_successor);
end;
$$;
