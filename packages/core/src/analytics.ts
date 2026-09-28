import type { OutcomeRecord } from './outcomes';

export interface AdherenceStats{
  planned:number;
  completed:number;
  partial:number;
  missedOnTime:number;
  notCompleted:number;
  moved:number;
  adherence:number;
}

export function outcomeStats(outcomes:OutcomeRecord[]):AdherenceStats{
  const stats:AdherenceStats={planned:outcomes.length,completed:0,partial:0,missedOnTime:0,notCompleted:0,moved:0,adherence:0};
  for(const o of outcomes){
    if(o.result==='completed') stats.completed++;
    else if(o.result==='partial') stats.partial++;
    else if(o.result==='missed_time') stats.missedOnTime++;
    else if(o.result==='not_completed') stats.notCompleted++;
    else if(o.result==='moved') stats.moved++;
  }
  stats.adherence=stats.planned?Math.round((stats.completed+stats.partial*0.5)/stats.planned*100):0;
  return stats;
}
