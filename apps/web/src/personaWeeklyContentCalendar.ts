import type {PersonaProject} from './personaProjectStore';
import {PERSONA_ARCHITECT_IDS} from './personaArchitectSeeds';
import {SEED_CAROUSELS,editorialStageLabel,type EditorialPost} from './personaEditorialModel';
import {personaPublicationSlot,personaPublicationMondayIndex} from './config/publication-schedule';

/** Editorial production cadence: Tue Reel, Thu Carousel, Sat Photo.
 * These are proposed publication slots, never a claim of actual platform posting.
 * Pre-existing PHOTO jobs and Reels retain their canonical IDs; photo slots are
 * explicitly unselected until the author chooses a topic.
 */
export const PERSONA_WEEKLY_CALENDAR_KEY='lifeos:persona:unified-weekly-calendar:v1';
export const PERSONA_WEEKLY_DAYS=['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'] as const;
export const PERSONA_PHOTO_SEED_IDS=Object.freeze(Array.from({length:10},(_,i)=>'PHOTO-'+String(i+1).padStart(3,'0')));
export const PERSONA_WEEKLY_WORKDAYS=[
 personaPublicationMondayIndex(personaPublicationSlot('reels').dayOfWeek),
 personaPublicationMondayIndex(personaPublicationSlot('carousel').dayOfWeek),
 personaPublicationMondayIndex(personaPublicationSlot('photo').dayOfWeek),
] as const;
export type CalendarPhotoJob={
 id:string;seedKey:string|null;title:string;state:string;
 ready?:boolean;exportStatus?:string|null;productionStatus?:string|null;
};
export type PersonaWeeklyItem={
 id:string;projectId:string;sourceId:string;title:string;
 kind:'video'|'carousel'|'photo';status:string;scheduledDate:string;
 weekIndex:number;dayIndex:number;scheduledTime?:string;placeholder?:boolean;
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
 const value=parseDate(date);value.setDate(value.getDate()+days);return localCalendarDate(value);
}
export function calendarMonday(date:string):string{
 return addCalendarDays(date,-((parseDate(date).getDay()+6)%7));
}
export function calendarWeekOffset(anchorMonday:string,weekMonday:string):number{
 if(calendarMonday(anchorMonday)!==anchorMonday||calendarMonday(weekMonday)!==weekMonday)
  throw Error('Calendar anchor must start Monday');
 const ord=(d:Date)=>Date.UTC(d.getFullYear(),d.getMonth(),d.getDate());
 return Math.round((ord(parseDate(weekMonday))-ord(parseDate(anchorMonday)))/604800000);
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
export function buildPersonaWeeklyCalendar({
 videos,photos,editorialPosts=[],anchorMonday,weekMonday
}:{
 videos:PersonaProject[];photos:CalendarPhotoJob[];editorialPosts?:EditorialPost[];
 anchorMonday:string;weekMonday:string
}):PersonaWeek{
 const weekIndex=calendarWeekOffset(anchorMonday,weekMonday);
 const videoById=new Map(videos.filter(x=>x.contentType==='reel'&&PERSONA_ARCHITECT_IDS.includes(x.id))
  .map(x=>[x.id,x]));
 const photoById=new Map(photos.filter(x=>x.seedKey&&PERSONA_PHOTO_SEED_IDS.includes(x.seedKey))
  .map(x=>[x.seedKey!,x]));
 const editorialById=new Map(editorialPosts.map(x=>[x.id,x]));
 const scheduled:PersonaWeeklyItem[]=[];
 let missingVideos=0,missingPhotos=0;
 if(weekIndex>=0&&weekIndex<10){
  const reelId=PERSONA_ARCHITECT_IDS[weekIndex],carouselId=PERSONA_PHOTO_SEED_IDS[weekIndex];
  const video=videoById.get(reelId);
  if(video)scheduled.push({id:'video:'+reelId,projectId:video.id,sourceId:reelId,title:video.title,
   kind:'video',status:videoCalendarStatus(video),scheduledDate:addCalendarDays(weekMonday,PERSONA_WEEKLY_WORKDAYS[0]),weekIndex,dayIndex:PERSONA_WEEKLY_WORKDAYS[0],scheduledTime:personaPublicationSlot('reels').time});
  else missingVideos++;
  const job=photoById.get(carouselId),plan=editorialById.get(carouselId),seed=SEED_CAROUSELS[weekIndex];
  if(!job)missingPhotos++;
  scheduled.push({id:'carousel:'+carouselId,projectId:job?.id??carouselId,sourceId:carouselId,
   title:plan?.title??job?.title??seed.title,kind:'carousel',
   status:plan?editorialStageLabel(plan):job?photoCalendarStatus(job):'Редакция доступна · Worker не подключён',
   scheduledDate:addCalendarDays(weekMonday,PERSONA_WEEKLY_WORKDAYS[1]),weekIndex,dayIndex:PERSONA_WEEKLY_WORKDAYS[1],scheduledTime:personaPublicationSlot('carousel').time,
   placeholder:!job&&!plan});
  const photoId='photo-week-'+String(weekIndex+1).padStart(2,'0'),photo=editorialById.get(photoId);
  scheduled.push({id:'photo:'+photoId,projectId:photoId,sourceId:photoId,
   title:photo?.title??'Выбрать тему фото-поста',kind:'photo',
   status:photo?editorialStageLabel(photo):'Тема не выбрана',
   scheduledDate:addCalendarDays(weekMonday,PERSONA_WEEKLY_WORKDAYS[2]),weekIndex,dayIndex:PERSONA_WEEKLY_WORKDAYS[2],scheduledTime:personaPublicationSlot('photo').time,
   placeholder:!photo});
 }
 // Author-scheduled additional editorial posts are shown alongside existing slots,
 // not forcibly substituted for or silently moved over approved work.
 for(const post of editorialPosts){
  if(!post.scheduledDate||post.id.startsWith('photo-week-')||post.id.startsWith('PHOTO-'))continue;
  if(calendarMonday(post.scheduledDate)!==weekMonday)continue;
  const dayIndex=(parseDate(post.scheduledDate).getDay()+6)%7;
  scheduled.push({id:'editorial:'+post.id,projectId:post.id,sourceId:post.id,
   title:post.title,kind:post.kind,status:editorialStageLabel(post),
   scheduledDate:post.scheduledDate,weekIndex,dayIndex});
 }
 scheduled.sort((a,b)=>a.dayIndex-b.dayIndex||a.id.localeCompare(b.id));
 const days=PERSONA_WEEKLY_DAYS.map((label,dayIndex)=>({
  date:addCalendarDays(weekMonday,dayIndex),label,dayIndex,
  items:scheduled.filter(x=>x.dayIndex===dayIndex)
 }));
 return {start:weekMonday,end:addCalendarDays(weekMonday,6),days,weekIndex,
  items:scheduled,scheduledTotal:weekIndex>=0&&weekIndex<10?3:scheduled.length,missingVideos,missingPhotos};
}
export function loadPersonaCalendarAnchor(storage:Pick<Storage,'getItem'|'setItem'>,today:string):string{
 const current=calendarMonday(today);
 try{
  const existing=storage.getItem(PERSONA_WEEKLY_CALENDAR_KEY);
  if(existing&&calendarMonday(existing)===existing)return existing;
  storage.setItem(PERSONA_WEEKLY_CALENDAR_KEY,current);
 }catch{return current}
 return current;
}
