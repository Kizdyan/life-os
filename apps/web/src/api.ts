import type{Item}from'./types';import{applyLocalOutcome,applyLocalPlan,readLocalToday}from'./localRuntime';const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;const trialLocal=typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('local')==='1';export const backendMode=trialLocal?'local':url&&key?'supabase':'local';function headers(){return{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};}function storage(){if(typeof localStorage==='undefined')throw Error('Локальное хранилище недоступно');return localStorage;}export async function today(date:string):Promise<Item[]>{if(backendMode==='local')return readLocalToday(storage(),date);const r=await fetch(`${url}/rest/v1/life_items?select=*&planned_start=gte.${date}T00:00:00&planned_start=lt.${date}T23:59:59&order=planned_start.asc`,{headers:headers()});if(!r.ok)throw Error(await r.text());return r.json();}export interface OutcomeMutation { idempotencyKey: string; createdAt: string; }
export async function outcome(item:Item,command:'complete'|'not_complete',mutation?:OutcomeMutation){
  if(backendMode==='local')return applyLocalOutcome(storage(),item,command,()=>crypto.randomUUID());
  const carry=command==='not_complete'&&!!item.carry_forward;
  const d=item.planned_start?.slice(0,10)??new Date().toISOString().slice(0,10);
  const next=new Date(d+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);
  const nextDate=carry?next.toISOString().slice(0,10):null;
  // A successor belongs to a source occurrence and target date, not to a click.
  const successorId=carry?await carrySuccessorId(item.id,d,nextDate!):null;
  const r=await fetch(`${url}/rest/v1/rpc/life_set_outcome`,{
    method:'POST',headers:headers(),body:JSON.stringify({
      p_item_id:item.id,p_planned_date:d,p_command:command,p_source:'ui',
      p_now:mutation?.createdAt??new Date().toISOString(),
      p_carry_forward:carry,p_next_date:nextDate,p_successor_id:successorId,
    }),
  });
  if(!r.ok)throw Error(await r.text());
  const result=await r.json();
  const expected=command==='complete'?'completed':carry?'missed_time':'not_completed';
  if(!result||result.item_id!==item.id||result.status!==expected||
    (carry&&result.successor?.id!==successorId))
    throw Error('Сервер не подтвердил изменение задачи. Повторная синхронизация сохранена.');
  return result;
}
// UUIDv8 with SHA-256-derived content identity; separate from the mutation key.
async function carrySuccessorId(itemId:string,plannedDate:string,nextDate:string):Promise<string>{
  const identity=JSON.stringify(['life-os:carry:v1',itemId,plannedDate,nextDate]);
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity))).slice(0,16);
  bytes[6]=(bytes[6]&0x0f)|0x80;
  bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export type PlanInput={title:string;planned_start:string;planned_end:string;kind?:string;carry_forward?:boolean};
export async function applyPlan(idempotencyKey:string,items:PlanInput[]){if(backendMode==='local')return applyLocalPlan(storage(),idempotencyKey,items,()=>crypto.randomUUID());const r=await fetch(`${url}/rest/v1/rpc/life_apply_plan`,{method:'POST',headers:headers(),body:JSON.stringify({p_idempotency_key:idempotencyKey,p_items:items,p_source:'erika'})});if(!r.ok)throw Error(await r.text());return r.json() as Promise<{applied:boolean;ids:string[];replayed:boolean}>}
