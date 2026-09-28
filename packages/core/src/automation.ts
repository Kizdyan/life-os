import type { LifeItem } from './life-item';
import { applyOutcome, type ApplyOutcomeResult } from './outcomes';

export interface AutomationPolicy {
  carryForwardKinds: LifeItem['kind'][];
  maxCarryDays: number;
}

export interface DueItem extends LifeItem {
  plannedDate: string;
  carryCount?: number;
}

export interface AutomationBatch {
  results: ApplyOutcomeResult[];
  skipped: { itemId:string; reason:string }[];
}

export function closeDay(
  items: DueItem[],
  today: string,
  tomorrow: string,
  now: string,
  policy: AutomationPolicy,
): AutomationBatch {
  const results: ApplyOutcomeResult[]=[];
  const skipped: AutomationBatch['skipped']=[];
  for(const item of items){
    if(item.plannedDate!==today || item.status!=='planned') continue;
    const carry=policy.carryForwardKinds.includes(item.kind);
    const count=item.carryCount ?? 0;
    if(carry && count>=policy.maxCarryDays){
      skipped.push({itemId:item.id,reason:'carry_limit'});
      results.push(applyOutcome({item,command:'not_complete',plannedDate:today,source:'system',now,carryForward:false}));
      continue;
    }
    results.push(applyOutcome({
      item, command:'not_complete', plannedDate:today, source:'system', now,
      carryForward:carry, nextDate:carry?tomorrow:undefined,
      successorId:carry?`${item.id}:${tomorrow}`:undefined,
    }));
  }
  return {results,skipped};
}
