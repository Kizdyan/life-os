export interface CalendarEvent{id:string;title:string;date:string;startTime:string;endTime:string;location?:string|null;notes?:string|null;cancelled?:boolean;}
export interface LifeCalendarRow extends CalendarEvent{source?:string|null;travelBeforeMin?:number;bufferBeforeMin?:number;bufferAfterMin?:number;}
export type CalendarDecision={type:'map';googleId:string}|{type:'update_life';event:CalendarEvent}|{type:'create_google'}|{type:'conflict';reason:string}|{type:'noop'};

export function decideCalendarSync(life:LifeCalendarRow,google:CalendarEvent|null):CalendarDecision{
 if(!google){
   if(life.source?.startsWith('gcal:'))return {type:'conflict',reason:'mapped_google_event_missing'};
   return {type:'create_google'};
 }
 if(!life.source){
   const same=life.title===google.title&&life.date===google.date&&life.startTime===google.startTime;
   return same?{type:'map',googleId:google.id}:{type:'conflict',reason:'possible_duplicate'};
 }
 if(life.source===`gcal:${google.id}`){
   const changed=['title','date','startTime','endTime','location','notes','cancelled'].some(k=>(life as any)[k]!=(google as any)[k]);
   return changed?{type:'update_life',event:google}:{type:'noop'};
 }
 return {type:'conflict',reason:'mapping_mismatch'};
}
