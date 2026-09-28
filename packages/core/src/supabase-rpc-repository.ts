import type { ApplyOutcomeInput, ApplyOutcomeResult } from './outcomes';
import { applyOutcome } from './outcomes';
import type { LifeItemRepository } from './outcome-store';
import type { LifeItem } from './life-item';
import type { SupabaseRestConfig } from './supabase-repository';

export class SupabaseRpcLifeItemRepository implements LifeItemRepository {
  constructor(private readonly config:SupabaseRestConfig){}

  private headers(){return {apikey:this.config.publishableKey,Authorization:`Bearer ${this.config.accessToken||this.config.publishableKey}`,'Content-Type':'application/json'};}

  async get(itemId:string):Promise<LifeItem>{
    const u=new URL('/rest/v1/life_items',this.config.url);u.searchParams.set('id',`eq.${itemId}`);u.searchParams.set('select','*');
    const r=await fetch(u,{headers:this.headers()});if(!r.ok)throw new Error(`life item read failed: ${r.status}`);
    const a=await r.json() as any[];if(!a[0])throw new Error('Life item not found');
    const x=a[0];return {id:x.id,kind:x.kind,title:x.title,status:x.status,plannedStart:x.planned_start,plannedEnd:x.planned_end,actualStart:x.actual_start,actualEnd:x.actual_end,projectId:x.project_id,version:x.version,createdAt:x.created_at,updatedAt:x.updated_at};
  }

  async commit(result:ApplyOutcomeResult):Promise<void>{
    const o=result.outcome;
    const body={p_item_id:o.itemId,p_command:commandFor(result),p_planned_date:o.plannedDate,p_source:o.source,p_now:o.recordedAt,p_carry_forward:Boolean(result.successor),p_next_date:result.successor?.plannedStart?.slice(0,10)??null,p_successor_id:result.successor?.id??null};
    const r=await fetch(new URL('/rest/v1/rpc/life_set_outcome',this.config.url),{method:'POST',headers:this.headers(),body:JSON.stringify(body)});
    if(!r.ok)throw new Error(`life_set_outcome failed: ${r.status}`);
  }
}
function commandFor(r:ApplyOutcomeResult):ApplyOutcomeInput['command']{
 if(r.outcome.result==='completed')return 'complete';if(r.outcome.result==='partial')return 'partial';if(r.outcome.result==='moved')return 'move';return 'not_complete';
}
