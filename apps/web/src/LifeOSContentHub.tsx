import React,{useState} from 'react';
import {loadPersonaProjects} from './personaProjectStore';
import {loadEditorialStore} from './personaEditorialModel';
import PersonaWeeklyContentCalendar from './PersonaWeeklyContentCalendar';
import PersonaEditorialCalendar from './PersonaEditorialCalendar';
import {loadPublicationAnalytics,importPublicationAnalytics,bindPublication,publicationLearning,type MetricSnapshot} from './personaPublicationAnalytics';
import {editorialReserve,moscowCalendarDate} from './personaEditorialReserve';
import {PERSONA_ARCHITECT_IMPORT_HASH} from './personaArchitectSeeds';

export default function LifeOSContentHub(){
 const [notice,setNotice]=useState(''),[raw,setRaw]=useState(''),[records,setRecords]=useState<MetricSnapshot[]>(()=>{
  try{return loadPublicationAnalytics(localStorage)}catch{return []}
 });
 const [binding,setBinding]=useState<Record<string,string>>({});
 const projects=loadPersonaProjects(localStorage,()=>crypto.randomUUID()).projects,posts=loadEditorialStore(localStorage).posts;
 const reserve=editorialReserve(posts,moscowCalendarDate(new Date()));
 const choices=[...posts.map(p=>({id:p.id,title:p.title})),...projects.map(p=>({id:p.id,title:p.title}))];
 function openEditorial(id:string){location.hash='#persona/editorial/'+id}
 function record(){
  try{setRecords(importPublicationAnalytics(localStorage,JSON.parse(raw)));setRaw('');setNotice('Наблюдения сохранены. Прежние данные не заменены.')}
  catch(e){setNotice(e instanceof Error?e.message:String(e))}
 }
 return <section aria-label="Управление контентом Life OS" data-testid="lifeos-content-hub">
  <h2>Контент · Life OS</h2>
  <p>Здесь расписание, идеи Stories и аналитика. Persona отвечает за производство. Планы и метрики не являются разрешением на публикацию.</p>
  <PersonaWeeklyContentCalendar videos={projects} editorialPosts={posts} onStartVideo={id=>{location.hash='#persona/from-calendar/video/'+id}} onStartCarousel={openEditorial} onStartPhoto={openEditorial} onImportReels={()=>{location.hash=PERSONA_ARCHITECT_IMPORT_HASH}}/>
  <section aria-label="Недельный производственный резерв" data-testid="persona-editorial-reserve">
   <h3>Резерв · следующие 7 дней</h3>
   <p>{reserve.startDate} — {reserve.endDate} · МСК. Дней с назначенным редакционным материалом: {reserve.assignedDays}/7. Дней с пройденными редакционными условиями: {reserve.editorialCandidateDays}/7.</p>
   <p>Количество проверенных файлов: неизвестно. Музыка и доставка не подтверждаются по редакционным флагам.</p>
   {reserve.rows.map(row=><div key={row.date} className="captureCard">
    <b>{row.date}</b>{row.materials.length===0?<p>Свободный редакционный слот; внешнее расписание не сверено.</p>:row.materials.map(item=><div key={item.id}><button type="button" onClick={()=>openEditorial(item.id)}>{item.title}</button><p>{item.blockers.length?item.blockers.join(' · '):'Редакционные условия выполнены; нужны реальные файлы и музыкальное сопровождение'}</p></div>)}
    {row.status==='MULTIPLE_COMMITMENTS'&&<p>Несколько назначенных материалов: не переносить автоматически.</p>}
   </div>)}
  </section>
  <details><summary>План на 90 дней</summary><PersonaEditorialCalendar occupiedDates={posts.flatMap(p=>p.scheduledDate?[p.scheduledDate]:[])}/></details>
  <section aria-label="Аналитика публикаций">
   <h3>Результаты публикаций · Metricool</h3>
   <p>История наблюдений. Прямое обновление из Metricool пока не подключено к приложению; импортируй полученный JSON. Недоступные метрики остаются неизвестными.</p>
   {publicationLearning(records).map(item=><div key={item.latest.url} className="captureCard">
    <a href={item.latest.url} target="_blank" rel="noreferrer">{choices.find(c=>c.id===item.contentId)?.title??(item.latest.platform==='tiktok'?'Публикация TikTok':'Публикация Instagram')}</a>
    <p>Наблюдение: {new Date(item.latest.observedAt).toLocaleString('ru-RU')} · {item.history.length} снимков статистики</p>
    <p>Просмотры: {item.latest.views??'—'} · охват: {item.latest.reach??'—'} · лайки: {item.latest.likes??'—'} · комментарии: {item.latest.comments??'—'}</p>
    <p>Сохранения: {item.latest.saves??'—'} · репосты: {item.latest.shares??'—'} · подписки: {item.latest.follows??'—'}</p>
    <p>Вовлечённость от охвата: {item.engagement===null?'—':item.engagement.toFixed(2)+'%'} · просмотров на охваченный аккаунт: {item.viewsPerReach===null?'—':item.viewsPerReach.toFixed(2)}</p>
    {item.unchanged&&<p>Значения не изменились с прошлого наблюдения; возможна задержка обновления.</p>}
    {!item.contentId&&<div><label>Привязать точный материал <select value={binding[item.latest.url]??''} onChange={e=>setBinding(v=>({...v,[item.latest.url]:e.target.value}))}><option value="">Выберите материал</option>{choices.map(c=><option key={c.id} value={c.id}>{c.title} · {c.id}</option>)}</select></label><button type="button" disabled={!binding[item.latest.url]} onClick={()=>{try{setRecords(bindPublication(localStorage,item.latest.url,binding[item.latest.url]));setNotice('Связь сохранена')}catch(e){setNotice(String(e))}}}>Связать</button></div>}
    {item.hypotheses.map(h=><p key={h}>Гипотеза: {h}</p>)}
    <small>{item.limitations}</small>
   </div>)}
   <label>Импорт JSON наблюдений <textarea value={raw} onChange={e=>setRaw(e.target.value)}/></label>
   <button type="button" disabled={!raw.trim()} onClick={record}>Сохранить статистику</button>
   <label>Или выбрать JSON-файл <input type="file" accept=".json,application/json" onChange={async e=>{const input=e.currentTarget,file=input.files?.[0];if(!file)return;try{if(file.size>2000000)throw Error('Файл слишком большой');setRecords(importPublicationAnalytics(localStorage,JSON.parse(await file.text())));setNotice('Наблюдения сохранены')}catch(error){setNotice(String(error))}input.value=''}}/></label>
   {notice&&<p role="status">{notice}</p>}
  </section>
 </section>;
}
