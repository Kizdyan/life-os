export interface Reminder{itemId:string;at:string;kind:'start'|'leave'|'deadline';message:string;}
export function buildReminders(item:{id:string;title:string;plannedStart:string|null},beforeMin=15):Reminder[]{
 if(!item.plannedStart)return[];const t=new Date(item.plannedStart);
 return [{itemId:item.id,at:new Date(t.getTime()-beforeMin*60000).toISOString(),kind:'start',message:`Через ${beforeMin} мин: ${item.title}`}];
}
