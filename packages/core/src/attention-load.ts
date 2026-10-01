import type { LifeItem } from "./life-item";

export type AttentionReason = "due_soon" | "overdue" | "missed_time" | "not_completed" | "moved";
export interface AttentionEntry { itemId:string; title:string; kind:LifeItem["kind"]; reason:AttentionReason; plannedStart:string|null; priority:number; }
export interface AttentionLoadPolicy { mediumAt:number; highAt:number; dueSoonHours:number; }
export interface AttentionDigest { visible:AttentionEntry[]; hiddenCount:number; load:"low"|"medium"|"high"; needsConsolidation:boolean; isClinicalAssessment:false; }
export const DEFAULT_ATTENTION_LOAD_POLICY:AttentionLoadPolicy={mediumAt:3,highAt:6,dueSoonHours:24};

export function buildAttentionDigest(input:{items:LifeItem[];now:string;maxVisible?:number;policy?:AttentionLoadPolicy}):AttentionDigest{
  const policy=input.policy??DEFAULT_ATTENTION_LOAD_POLICY;
  if(policy.mediumAt<1||policy.highAt<policy.mediumAt||policy.dueSoonHours<0) throw new Error("Invalid attention load policy");
  const now=Date.parse(input.now); if(!Number.isFinite(now)) throw new Error("Invalid current time");
  const entries=input.items.map(item=>toEntry(item,now,policy)).filter((x):x is AttentionEntry=>x!==null).sort((a,b)=>b.priority-a.priority||(a.plannedStart??"~").localeCompare(b.plannedStart??"~")||a.itemId.localeCompare(b.itemId));
  const max=Math.max(0,Math.floor(input.maxVisible??5));
  const visible=entries.slice(0,max); const hiddenCount=entries.length-visible.length;
  return {visible,hiddenCount,load:entries.length>=policy.highAt?"high":entries.length>=policy.mediumAt?"medium":"low",needsConsolidation:hiddenCount>0,isClinicalAssessment:false};
}

function toEntry(item:LifeItem,now:number,policy:AttentionLoadPolicy):AttentionEntry|null{
  if(item.status==="completed"||item.status==="partial") return null;
  if(item.status==="missed_time") return entry(item,"missed_time",70);
  if(item.status==="not_completed") return entry(item,"not_completed",65);
  if(item.status==="moved") return entry(item,"moved",60);
  if(item.status!=="planned"||!item.plannedStart) return null;
  const start=Date.parse(item.plannedStart); if(!Number.isFinite(start)) return null;
  const fixed=item.kind==="event"||item.kind==="travel";
  if(start<now) return entry(item,"overdue",fixed?110:90);
  if(start-now<=policy.dueSoonHours*3600000) return entry(item,"due_soon",fixed?120:80);
  return null;
}
function entry(item:LifeItem,reason:AttentionReason,priority:number):AttentionEntry{return{itemId:item.id,title:item.title,kind:item.kind,reason,plannedStart:item.plannedStart,priority};}
