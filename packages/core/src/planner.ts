import type { LifeItem } from './life-item';

export interface PlannerSettings {
  theatreExitBufferMin:number;
  mealMin:number;
  travelDefaultMin:number;
  reserveMin:number;
}

export interface PlannedBlock {
  id:string; title:string; start:string; end:string; fixed:boolean; sourceId:string|null;
}

export function reserveTheatreExit(event:LifeItem, settings:PlannerSettings):PlannedBlock|null {
  if(!event.plannedStart || event.kind!=='event' || !/театр|спектак|репетиц/i.test(event.title)) return null;
  const start=new Date(event.plannedStart);
  const exit=new Date(start.getTime()-settings.theatreExitBufferMin*60000);
  return {id:`travel:${event.id}`,title:'Выйти в театр',start:exit.toISOString(),end:start.toISOString(),fixed:true,sourceId:event.id};
}

export function findFreeSlot(blocks:PlannedBlock[],date:string,durationMin:number,dayStart='09:00',dayEnd='23:00'):string|null{
  const start=new Date(`${date}T${dayStart}:00`);
  const end=new Date(`${date}T${dayEnd}:00`);
  const sorted=blocks.map(b=>({s:new Date(b.start),e:new Date(b.end)})).sort((a,b)=>+a.s-+b.s);
  let cursor=start;
  for(const b of sorted){
    if(b.e<=cursor) continue;
    if((+b.s-+cursor)/60000>=durationMin) return cursor.toISOString();
    if(b.e>cursor) cursor=b.e;
  }
  return (+end-+cursor)/60000>=durationMin?cursor.toISOString():null;
}
