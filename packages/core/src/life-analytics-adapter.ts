import type{DailyCheckin}from'./daily-checkin';
import type{LifeItem}from'./life-item';
import type{LifeObservation}from'./life-analytics';

export interface LifeAnalyticsInputs{items:LifeItem[];checkins:DailyCheckin[]}

export function lifeObservationsFromInputs(input:LifeAnalyticsInputs):LifeObservation[]{
 const observations:LifeObservation[]=[];
 for(const item of input.items){
  const date=localDate(item.plannedStart)||localDate(item.actualStart)||localDate(item.updatedAt);
  if(!date)continue;
  const occurredAt=item.actualEnd||item.actualStart||item.plannedStart||item.updatedAt;
  const base={occurredAt,localDate:date,source:'life_os' as const,projectId:item.projectId||undefined,confidence:1};
  if(item.plannedStart)observations.push({id:`${item.id}:planned`,...base,metric:'task_planned',value:1});
  if(item.status==='completed'||item.status==='partial')observations.push({id:`${item.id}:completed`,...base,metric:'task_completed',value:item.status==='partial'?0.5:1});
  if(item.status==='moved')observations.push({id:`${item.id}:moved`,...base,metric:'task_moved',value:1});
  if(item.status==='completed'&&isOnTime(item))observations.push({id:`${item.id}:on-time`,...base,metric:'task_on_time',value:1});
 }
 for(const checkin of input.checkins){
  const occurredAt=`${checkin.date}T12:00:00`;
  const base={occurredAt,localDate:checkin.date,source:'user' as const,confidence:1};
  if(checkin.sleepHours!==null)observations.push({id:`checkin:${checkin.date}:sleep`,...base,metric:'sleep_minutes',value:Math.round(checkin.sleepHours*60)});
  if(checkin.energy!==null)observations.push({id:`checkin:${checkin.date}:energy`,...base,metric:'energy',value:checkin.energy});
  if(checkin.mood!==null)observations.push({id:`checkin:${checkin.date}:mood`,...base,metric:'mood',value:checkin.mood});
 }
 return observations;
}

function isOnTime(item:LifeItem):boolean{
 if(!item.actualEnd||!item.plannedEnd)return false;
 const actual=Date.parse(item.actualEnd),planned=Date.parse(item.plannedEnd);
 return Number.isFinite(actual)&&Number.isFinite(planned)&&actual<=planned;
}

function localDate(value:string|null):string|null{
 if(!value)return null;
 const match=/^(\d{4}-\d{2}-\d{2})/.exec(value);
 return match?.[1]??null;
}
