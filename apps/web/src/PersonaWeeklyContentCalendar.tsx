import React,{useEffect,useMemo,useState} from 'react';
import type {PersonaProject} from './personaProjectStore';
import {PERSONA_ARCHITECT_IDS} from './personaArchitectSeeds';
import {personaWorkerUrl} from './personaWorkerUrl';
import {loadStoryNotes,saveStoryNotes,type EditorialPost,type StoryNote} from './personaEditorialModel';
import {
 addCalendarDays,buildPersonaWeeklyCalendar,calendarMonday,
 loadPersonaCalendarAnchor,localCalendarDate,PERSONA_PHOTO_SEED_IDS,
 type CalendarPhotoJob,type PersonaWeeklyItem
} from './personaWeeklyContentCalendar';
import './persona-weekly-content-calendar.css';

type Props={
 videos:PersonaProject[];
 editorialPosts?:EditorialPost[];
 onStartVideo:(projectId:string)=>void;
 onStartCarousel:(seedId:string)=>void;
 onStartPhoto:(slotId:string)=>void;
 onImportReels?:()=>void;
};
const dateLabel=(iso:string)=>new Date(Number(iso.slice(0,4)),Number(iso.slice(5,7))-1,Number(iso.slice(8)),12)
 .toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
const fullDate=(iso:string)=>new Date(Number(iso.slice(0,4)),Number(iso.slice(5,7))-1,Number(iso.slice(8)),12)
 .toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
export default function PersonaWeeklyContentCalendar({
 videos,editorialPosts=[],onStartVideo,onStartCarousel,onStartPhoto,onImportReels
}:Props){
 const [today,setToday]=useState(()=>localCalendarDate(new Date()));
 const [anchorMonday]=useState(()=>loadPersonaCalendarAnchor(localStorage,localCalendarDate(new Date())));
 const [weekMonday,setWeekMonday]=useState(()=>calendarMonday(localCalendarDate(new Date())));
 const [photos,setPhotos]=useState<CalendarPhotoJob[]>([]);
 const [workerState,setWorkerState]=useState<'checking'|'connected'|'unavailable'>('checking');
 const [workerError,setWorkerError]=useState('');
 const [stories,setStories]=useState<StoryNote[]>(()=>loadStoryNotes(localStorage));
 const [storyText,setStoryText]=useState('');
 const [storyDate,setStoryDate]=useState(today);
 const [storyError,setStoryError]=useState('');
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
   }
  };
  void refresh();
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh()},12000);
  const clock=window.setInterval(()=>setToday(localCalendarDate(new Date())),60000);
  return()=>{alive=false;window.clearInterval(timer);window.clearInterval(clock)};
 },[]);
 const plan=useMemo(()=>buildPersonaWeeklyCalendar({
  videos,photos,editorialPosts,anchorMonday,weekMonday
 }),[videos,photos,editorialPosts,anchorMonday,weekMonday]);
 const thisMonday=calendarMonday(today),isCurrentWeek=weekMonday===thisMonday;
 const todayItems=plan.days.find(d=>d.date===today)?.items??[];
 const future=plan.items.find(item=>item.scheduledDate>=today);
 const videoCount=videos.filter(v=>PERSONA_ARCHITECT_IDS.includes(v.id)&&v.contentType==='reel').length;
 const photoCount=photos.length;
 function start(item:PersonaWeeklyItem){
  if(item.kind==='video')onStartVideo(item.projectId);
  else if(item.kind==='carousel')onStartCarousel(item.sourceId);
  else onStartPhoto(item.sourceId);
 }
 function rememberStories(next:StoryNote[]){
  try{saveStoryNotes(localStorage,next);setStories(next);setStoryError('')}
  catch(e){setStoryError((e as Error).message)}
 }
 function addStory(){
  const value=storyText.trim();
  if(value.length<4||value.length>350){setStoryError('Напиши идею истории от 4 до 350 символов');return}
  if(storyDate<plan.start||storyDate>plan.end){setStoryError('Выбери дату в пределах недели');return}
  const record:StoryNote={id:'story-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),
   date:storyDate,text:value,state:'idea',createdAt:new Date().toISOString()};
  rememberStories([...stories,record]);setStoryText('');
 }
 useEffect(()=>{setStoryDate(today>=plan.start&&today<=plan.end?today:weekMonday)},[weekMonday,today,plan.start,plan.end]);
 const weekStories=stories.filter(s=>s.date>=plan.start&&s.date<=plan.end)
  .slice().sort((a,b)=>a.date.localeCompare(b.date));
 return <section className="personaWeekCalendar" data-testid="persona-weekly-calendar"
  aria-label="Календарь на неделю">
  <header className="personaWeekCalendarHead">
   <div>
    <small>PERSONA / EDITORIAL CALENDAR</small>
    <h2>Календарь на неделю</h2>
    <p>План выпусков: понедельник — Reels, среда — карусель, пятница — фото. Stories — дополнительно.</p>
   </div>
   <div className="personaWeekCalendarControls" aria-label="Переключение недель">
    <button type="button" onClick={()=>setWeekMonday(day=>addCalendarDays(day,-7))}
     disabled={plan.weekIndex<=0} aria-label="Предыдущая неделя">←</button>
    <button type="button" onClick={()=>setWeekMonday(thisMonday)}>Сегодня</button>
    <button type="button" onClick={()=>setWeekMonday(day=>addCalendarDays(day,7))}
     disabled={plan.weekIndex>=12} aria-label="Следующая неделя">→</button>
   </div>
  </header>
  <div className="personaWeekCalendarSummary">
   <strong>{fullDate(weekMonday)} — {fullDate(plan.end)}</strong>
   <span>{plan.items.length} запланировано · публикация только после авторского утверждения</span>
  </div>
  {isCurrentWeek&&<div className="personaWeekCalendarToday" role="status">
   <span className="personaWeekCalendarPulse" aria-hidden="true"/>
   <strong>Сегодня, {fullDate(today)}:</strong>
   <span>{todayItems.length?todayItems.map(x=>x.title).join(' · '):
    future?'Сегодня свободно. Следующая задача — '+fullDate(future.scheduledDate)+': '+future.title:
    'На сегодня задач нет. Проверь следующую неделю.'}</span>
  </div>}
  <div className="personaWeekCalendarDays">
   {plan.days.map(day=><article key={day.date} className={'personaWeekCalendarDay'+
    (day.date===today?' personaWeekCalendarDay--today':'')}
    data-calendar-day={day.date} aria-current={day.date===today?'date':undefined}>
    <div className="personaWeekCalendarDayHeader">
     <span className="personaWeekCalendarDayName">{day.label}</span>
     <time dateTime={day.date}>{dateLabel(day.date)}</time>
    </div>
    {day.items.length?day.items.map(item=><div className="personaWeekCalendarItem"
     data-calendar-item-id={item.sourceId} key={item.id}>
     <span className="personaWeekCalendarKind">{item.kind==='video'?'◉ Видео':
      item.kind==='carousel'?'▤ Карусель':'▧ Фото-пост'}</span>
     <h3>{item.title}</h3>
     <span className="personaWeekCalendarState">{item.status}</span>
     <button type="button" className="personaWeekCalendarStart"
      aria-label={'Начать работу: '+item.title} onClick={()=>start(item)}>
      {item.placeholder&&item.kind==='photo'?'Выбрать тему':'Начать работу'} <span aria-hidden="true">↗</span>
     </button>
    </div>):<p className="personaWeekCalendarEmpty">Без назначенных задач</p>}
   </article>)}
  </div>
  {(videoCount<10||photoCount<10||workerState==='unavailable')&&<div className="personaWeekCalendarSources">
   {videoCount<10&&<p>Видеосценарии: {videoCount}/10.
    {onImportReels&&<button type="button" onClick={onImportReels}>Загрузить сценарии Архитектора</button>}</p>}
   {workerState==='unavailable'?<p>Локальный Media Worker не подключён.
    {workerError?' '+workerError:''} Редакция тем и текстов работает независимо, но файлы Worker потребуют его запуска.</p>:
    photoCount<10?<p>Карусели в Media Worker: {photoCount}/10. Редакционный план доступен отдельно.</p>:null}
  </div>}
  <section className="personaWeekStories" aria-label="Истории на неделю">
   <div><h3>Stories · по ходу недели</h3>
    <p>Лёгкий список идей: не требуются ежедневные публикации. Статусы отмечаешь сам — никакого автопостинга.</p></div>
   <div className="personaWeekStoryInput">
    <label>Дата истории<input aria-label="Дата истории" type="date" min={plan.start} max={plan.end}
     value={storyDate} onChange={e=>setStoryDate(e.target.value)}/></label>
    <label>Идея Stories<input aria-label="Идея Stories" value={storyText} maxLength={350}
     placeholder="Одна короткая мысль или кадр…" onChange={e=>setStoryText(e.target.value)}/></label>
    <button type="button" onClick={addStory}>Добавить</button>
   </div>
   {storyError&&<p role="alert" className="personaWeekStoryError">{storyError}</p>}
   {weekStories.length>0&&<ul className="personaWeekStoryList">
    {weekStories.map(s=><li key={s.id}><strong>{dateLabel(s.date)}</strong><span>{s.text}</span>
     <select aria-label={'Статус истории '+s.text} value={s.state} onChange={e=>{
      const state=e.target.value as StoryNote['state'];
      rememberStories(stories.map(x=>x.id===s.id?{...x,state}:x));
     }}><option value="idea">Идея</option><option value="captured">Отснято</option><option value="published">Опубликовано вручную</option></select>
     <button type="button" aria-label={'Удалить историю '+s.text} onClick={()=>rememberStories(stories.filter(x=>x.id!==s.id))}>×</button>
    </li>)}
   </ul>}
  </section>
 </section>;
}
