import type {PersonaProject} from './personaProjectStore';
import {PERSONA_ARCHITECT_IDS} from './personaArchitectSeeds';

/** Stable production timetable: three assignments per week, Monday/Wednesday/Friday.
 * One calendar item is always one existing project; the calendar never manufactures
 * new project records or claims photo/video uploads exist.
 */
export const PERSONA_WEEKLY_CALENDAR_KEY='lifeos:persona:unified-weekly-calendar:v1';
export const PERSONA_WEEKLY_DAYS=['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'] as const;
export const PERSONA_PHOTO_SEED_IDS=Object.freeze(Array.from({length:10},(_,i)=>'PHOTO-'+String(i+1).padStart(3,'0')));
export const PERSONA_WEEKLY_WORKDAYS=[0,2,4] as const;
export type CalendarPhotoJob={
 id:string;seedKey:string|null;title:string;
 state:string;ready?:boolean;exportStatus?:string|null;productionStatus?:string|null;
};
export type PersonaWeeklyItem={
 id:string;projectId:string;sourceId:string;title:string;
 kind:'video'|'photo';status:string;scheduledDate:string;
 weekIndex:number;dayIndex:number;
};
export type PersonaWeekDay={date:string;label:string;dayIndex:number;items:PersonaWeeklyItem[]};
export type PersonaWeek={start:string;end:string;days:PersonaWeekDay[];weekIndex:number;
 items:PersonaWeeklyItem[];scheduledTotal:number;missingVideos:number;missingPhotos:number};

const ISO=/^\d{4}-\d{2}-\d{2}$/;
export function localCalendarDate(now:Date):string{
 if(!Number.isFinite(now.getTime()))throw Error('Calendar date invalid');
 const pad=(n:number)=>String(n).padStart(2,'0');
 return [now.getFullYear(),pad(now.getMonth()+1),pad(now.getDate())].join('-');
}
function parseDate(date:string):Date{
 if(!ISO.test(date))throw Error('Calendar date must be YYYY-MM-DD');
 const [year,month,day]=date.split('-').map(Number);
 const value=new Date(year,month-1,day,12,0,0,0);
 if(localCalendarDate(value)!==date)throw Error('Calendar date is invalid');
 return value;
}
export function addCalendarDays(date:string,days:number):string{
 if(!Number.isSafeInteger(days)||Math.abs(days)>3650)throw Error('Calendar date shift invalid');
 const value=parseDate(date);value.setDate(value.getDate()+days);
 return localCalendarDate(value);
}
export function calendarMonday(date:string):string{
 const day=parseDate(date).getDay();
 return addCalendarDays(date,-((day+6)%7));
}
export function calendarWeekOffset(anchorMonday:string,weekMonday:string):number{
 if(calendarMonday(anchorMonday)!==anchorMonday||calendarMonday(weekMonday)!==weekMonday)
  throw Error('Calendar anchor must start Monday');
 const first=parseDate(anchorMonday),second=parseDate(weekMonday);
 // Use local noon and ordinal date from UTC to avoid DST clock shifts.
 const ordinal=(d:Date)=>Date.UTC(d.getFullYear(),d.getMonth(),d.getDate());
 return Math.round((ordinal(second)-ordinal(first))/604800000);
}
export function videoCalendarStatus(project:PersonaProject):string{
 if(project.stage==='needs_assets')return 'Ждёт видео';
 if(project.stage==='marketing_qa'||project.stage==='media_qa'||project.stage==='final_qa')return 'На проверке';
 if(project.stage==='approval')return 'Готово к съёмке';
 if(project.stage==='production')return 'В работе';
 return 'Подготовка сценария';
}
export function photoCalendarStatus(job:CalendarPhotoJob):string{
 if(job.state==='waiting_for_footage')return 'Ждёт фото';
 if(job.state==='uploading')return 'Загрузка фото';
 if(job.state==='running')return 'В работе';
 if(job.state==='completed')return 'На проверке';
 if(job.state==='failed')return 'Требует внимания';
 return 'Статус уточняется';
}
/** Missing sources keep their reserved schedule positions rather than shifting real work. */
export function buildPersonaWeeklyCalendar({
 videos,photos,anchorMonday,weekMonday
}:{
 videos:PersonaProject[];photos:CalendarPhotoJob[];anchorMonday:string;weekMonday:string
}):PersonaWeek{
 const weekIndex=calendarWeekOffset(anchorMonday,weekMonday);
 const videoById=new Map(videos.filter(x=>x.contentType==='reel'&&PERSONA_ARCHITECT_IDS.includes(x.id))
  .map(x=>[x.id,x]));
 const photoById=new Map(photos.filter(x=>x.seedKey&&PERSONA_PHOTO_SEED_IDS.includes(x.seedKey))
  .map(x=>[x.seedKey!,x]));
 const scheduled:PersonaWeeklyItem[]=[];
 let missingVideos=0,missingPhotos=0;
 for(let i=0;i<10;i++){
  const vi=PERSONA_ARCHITECT_IDS[i],pi=PERSONA_PHOTO_SEED_IDS[i];
  for(const [kind,key] of [['video',vi],['photo',pi]] as const){
   const index=i*2+(kind==='photo'?1:0),w=Math.floor(index/3);
   if(w!==weekIndex)continue;
   const day=PERSONA_WEEKLY_WORKDAYS[index%3];
   const date=addCalendarDays(weekMonday,day);
   if(kind==='video'){
    const record=videoById.get(key);
    if(!record){missingVideos++;continue}
    scheduled.push({id:kind+':'+key,projectId:record.id,sourceId:key,title:record.title,
     kind,status:videoCalendarStatus(record),scheduledDate:date,weekIndex:w,dayIndex:day});
   }else{
    const record=photoById.get(key);
    if(!record){missingPhotos++;continue}
    scheduled.push({id:kind+':'+key,projectId:record.id,sourceId:key,title:record.title,
     kind,status:photoCalendarStatus(record),scheduledDate:date,weekIndex:w,dayIndex:day});
   }
  }
 }
 const days=PERSONA_WEEKLY_DAYS.map((label,dayIndex)=>({
  date:addCalendarDays(weekMonday,dayIndex),label,dayIndex,
  items:scheduled.filter(item=>item.dayIndex===dayIndex)
 }));
 return {start:weekMonday,end:addCalendarDays(weekMonday,6),days,weekIndex,
  items:scheduled,scheduledTotal:Math.max(0,Math.min(3,20-weekIndex*3)),
  missingVideos,missingPhotos};
}
export function loadPersonaCalendarAnchor(storage:Pick<Storage,'getItem'|'setItem'>,today:string):string{
 const current=calendarMonday(today);
 try{
  const existing=storage.getItem(PERSONA_WEEKLY_CALENDAR_KEY);
  if(existing&&calendarMonday(existing)===existing&&calendarWeekOffset(existing,current)>=-1)
   return existing;
  storage.setItem(PERSONA_WEEKLY_CALENDAR_KEY,current);
 }catch{return current}
 return current;
}
