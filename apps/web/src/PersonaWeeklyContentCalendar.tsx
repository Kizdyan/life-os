import React,{useEffect,useMemo,useState} from 'react';
import type {PersonaProject} from './personaProjectStore';
import {PERSONA_ARCHITECT_IDS} from './personaArchitectSeeds';
import {personaWorkerUrl} from './personaWorkerUrl';
import {
 addCalendarDays,buildPersonaWeeklyCalendar,calendarMonday,calendarWeekOffset,
 loadPersonaCalendarAnchor,localCalendarDate,PERSONA_PHOTO_SEED_IDS,
 type CalendarPhotoJob,type PersonaWeeklyItem
} from './personaWeeklyContentCalendar';
import './persona-weekly-content-calendar.css';

type Props={
 videos:PersonaProject[];
 onStartVideo:(projectId:string)=>void;
 onStartPhoto:(jobId:string)=>void;
 onImportReels?:()=>void;
};
const dateLabel=(iso:string)=>new Date(Number(iso.slice(0,4)),Number(iso.slice(5,7))-1,Number(iso.slice(8)),12)
 .toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
const fullDate=(iso:string)=>new Date(Number(iso.slice(0,4)),Number(iso.slice(5,7))-1,Number(iso.slice(8)),12)
 .toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
export default function PersonaWeeklyContentCalendar({videos,onStartVideo,onStartPhoto,onImportReels}:Props){
 const [today,setToday]=useState(()=>localCalendarDate(new Date()));
 const [anchorMonday]=useState(()=>loadPersonaCalendarAnchor(localStorage,localCalendarDate(new Date())));
 const [weekMonday,setWeekMonday]=useState(()=>calendarMonday(localCalendarDate(new Date())));
 const [photos,setPhotos]=useState<CalendarPhotoJob[]>([]);
 const [workerState,setWorkerState]=useState<'checking'|'connected'|'unavailable'>('checking');
 const [workerError,setWorkerError]=useState('');
 useEffect(()=>{
  let alive=true;
  const refresh=async()=>{
   try{
    const health=await fetch(personaWorkerUrl+'/health',{cache:'no-store',
     signal:AbortSignal.timeout(4000)});
    if(!health.ok)throw Error('Локальный Media Worker недоступен');
    const data=await health.json();
    if(data.service!=='persona-media-worker'||data.quickRender!==true||typeof data.token!=='string')
     throw Error('Нужен обновлённый локальный Media Worker');
    const response=await fetch(personaWorkerUrl+'/quick-render',{
     headers:{'X-Persona-Worker-Token':data.token},cache:'no-store',
     signal:AbortSignal.timeout(6500)});
    if(!response.ok)throw Error('Не удалось загрузить статусы фотокаруселей');
    const result=await response.json();
    if(!Array.isArray(result.jobs))throw Error('Некорректный список проектов Worker');
    if(!alive)return;
    setPhotos(result.jobs.filter((x:CalendarPhotoJob)=>x&&
     typeof x.id==='string'&&typeof x.title==='string'&&
     typeof x.seedKey==='string'&&PERSONA_PHOTO_SEED_IDS.includes(x.seedKey)));
    setWorkerState('connected');setWorkerError('');
   }catch(e){
    if(alive){setWorkerState('unavailable');setWorkerError((e as Error).message)}
    // Keep last verified project snapshots when the Worker temporarily disconnects.
   }
  };
  void refresh();
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh()},12000);
  const clock=window.setInterval(()=>setToday(localCalendarDate(new Date())),60000);
  return()=>{alive=false;window.clearInterval(timer);window.clearInterval(clock)};
 },[]);
 const plan=useMemo(()=>buildPersonaWeeklyCalendar({
  videos,photos,anchorMonday,weekMonday
 }),[videos,photos,anchorMonday,weekMonday]);
 const thisMonday=calendarMonday(today),isCurrentWeek=weekMonday===thisMonday;
 const days=plan.days;
 const todayItems=days.find(d=>d.date===today)?.items??[];
 const future=days.flatMap(d=>d.items).find(item=>item.scheduledDate>=today);
 const videoCount=videos.filter(v=>PERSONA_ARCHITECT_IDS.includes(v.id)&&v.contentType==='reel').length;
 const photoCount=photos.length;
 const start=(item:PersonaWeeklyItem)=>{
  if(item.kind==='video')onStartVideo(item.projectId);
  else onStartPhoto(item.projectId);
 };
 return <section className="personaWeekCalendar" data-testid="persona-weekly-calendar"
  aria-label="Календарь на неделю">
  <header className="personaWeekCalendarHead">
   <div>
    <small>PERSONA / CONTENT PRODUCTION</small>
    <h2>Календарь на неделю</h2>
    <p>План по существующим проектам · 3 задания в неделю · Пн / Ср / Пт</p>
   </div>
   <div className="personaWeekCalendarControls" aria-label="Переключение недель">
    <button type="button" onClick={()=>setWeekMonday(day=>addCalendarDays(day,-7))}
     disabled={plan.weekIndex<=0} aria-label="Предыдущая неделя">←</button>
    <button type="button" onClick={()=>setWeekMonday(thisMonday)}>Сегодня</button>
    <button type="button" onClick={()=>setWeekMonday(day=>addCalendarDays(day,7))}
     disabled={plan.weekIndex>=6} aria-label="Следующая неделя">→</button>
   </div>
  </header>
  <div className="personaWeekCalendarSummary">
   <strong>{fullDate(weekMonday)} — {fullDate(plan.end)}</strong>
   <span>{plan.items.length} {plan.items.length===1?'проект':'проекта'} на этой неделе
    {plan.scheduledTotal>plan.items.length?' · часть источников ещё не подключена':''}</span>
  </div>
  {isCurrentWeek&&<div className="personaWeekCalendarToday" role="status">
   <span className="personaWeekCalendarPulse" aria-hidden="true"/>
   <strong>Сегодня, {fullDate(today)}:</strong>
   <span>{todayItems.length?todayItems.map(x=>x.title).join(' · '):
    future?'Сегодня свободно. Следующая задача — '+fullDate(future.scheduledDate)+': '+future.title:
    'На сегодня задач нет. Проверь следующую неделю или состояние проектов.'}</span>
  </div>}
  <div className="personaWeekCalendarDays">
   {days.map(day=><article key={day.date} className={'personaWeekCalendarDay'+
    (day.date===today?' personaWeekCalendarDay--today':'')}
    data-calendar-day={day.date} aria-current={day.date===today?'date':undefined}>
    <div className="personaWeekCalendarDayHeader">
     <span className="personaWeekCalendarDayName">{day.label}</span>
     <time dateTime={day.date}>{dateLabel(day.date)}</time>
    </div>
    {day.items.length?day.items.map(item=><div className="personaWeekCalendarItem"
     data-calendar-item-id={item.sourceId} key={item.id}>
     <span className="personaWeekCalendarKind">{item.kind==='video'?'◉ Видео':'▧ Фото'}</span>
     <h3>{item.title}</h3>
     <span className="personaWeekCalendarState">{item.status}</span>
     <button type="button" className="personaWeekCalendarStart"
      aria-label={'Начать работу: '+item.title} onClick={()=>start(item)}>
      Начать работу <span aria-hidden="true">↗</span>
     </button>
    </div>):<p className="personaWeekCalendarEmpty">Без назначенных задач</p>}
   </article>)}
  </div>
  {(videoCount<10||photoCount<10||workerState==='unavailable')&&<div className="personaWeekCalendarSources">
   {videoCount<10&&<p>Видеосценарии: {videoCount}/10.
    {onImportReels&&<button type="button" onClick={onImportReels}>Загрузить сценарии Архитектора</button>}</p>}
   {workerState==='unavailable'?<p>Фотокарусели: связь с локальным Worker отсутствует.
    {workerError?' '+workerError:''} Запусти Media Worker для актуальных статусов и перехода к фотографиям.</p>:
    photoCount<10?<p>Фотокарусели: {photoCount}/10. Проверь импорт PHOTO-001–010 в Media Worker.</p>:null}
  </div>}
 </section>;
}
