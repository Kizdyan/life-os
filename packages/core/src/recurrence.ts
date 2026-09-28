export type RecurrenceFrequency='daily'|'weekly'|'monthly';
export interface RecurrenceRule{frequency:RecurrenceFrequency;interval:number;weekdays?:number[];until?:string;}
export function nextOccurrence(date:string,rule:RecurrenceRule):string|null{
 const d=new Date(date+'T12:00:00Z'); const until=rule.until?new Date(rule.until+'T23:59:59Z'):null;
 if(rule.frequency==='daily')d.setUTCDate(d.getUTCDate()+rule.interval);
 else if(rule.frequency==='monthly')d.setUTCMonth(d.getUTCMonth()+rule.interval);
 else {
   const allowed=(rule.weekdays?.length?rule.weekdays:[d.getUTCDay()]).slice().sort();
   let n=new Date(d); for(let i=1;i<=14*rule.interval;i++){n=new Date(d);n.setUTCDate(d.getUTCDate()+i);if(allowed.includes(n.getUTCDay())){d.setTime(n.getTime());break;}}
 }
 return until&&d>until?null:d.toISOString().slice(0,10);
}
