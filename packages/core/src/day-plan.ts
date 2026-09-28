export interface FlexibleTask{id:string;title:string;durationMin:number;priority:'mandatory'|'important'|'optional';}
export interface BusyBlock{start:string;end:string;}
export interface DayPlacement{taskId:string;start:string;end:string;}
export function autoPlanDay(date:string,tasks:FlexibleTask[],busy:BusyBlock[],dayStart='09:00',dayEnd='23:00'):DayPlacement[]{
 const sorted=[...tasks].sort((a,b)=>rank(a.priority)-rank(b.priority));
 const occupied=[...busy].sort((a,b)=>+new Date(a.start)-+new Date(b.start));const out:DayPlacement[]=[];
 let cursor=new Date(`${date}T${dayStart}:00`);const end=new Date(`${date}T${dayEnd}:00`);
 for(const task of sorted){let placed=false;while(!placed&&cursor<end){const conflict=occupied.find(b=>new Date(b.start)<new Date(+cursor+task.durationMin*60000)&&new Date(b.end)>cursor);if(conflict){cursor=new Date(conflict.end);continue;}const e=new Date(+cursor+task.durationMin*60000);if(e>end)break;out.push({taskId:task.id,start:cursor.toISOString(),end:e.toISOString()});occupied.push({start:cursor.toISOString(),end:e.toISOString()});cursor=e;placed=true;}}
 return out;
}
function rank(p:FlexibleTask['priority']){return p==='mandatory'?0:p==='important'?1:2;}
