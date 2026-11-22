import React,{useEffect,useRef,useState} from 'react';
import {applyPlan,backendMode,today} from './api';
import {planLocalDate} from './planner';
import type {EditorialPost} from './personaEditorialModel';
import type {Status} from './types';
import {readPersonaErikaStatus,schedulePersonaAuthorReview,formatPersonaReviewInterval,
 type PersonaErikaStatus,type PersonaLifeOSPort} from './personaLifeOSBridge';

const port:PersonaLifeOSPort={provenance:backendMode==='local'?'LOCAL_RUNTIME':'SUPABASE_RUNTIME',
 applyPlan,readDay:today};
const approval=(value:PersonaErikaStatus['contentApproval'])=>
 value==='AUTHOR_APPROVAL_RECORDED'?'авторское решение сохранено':'ожидает авторского просмотра';
const taskStatus:Record<Status,string>={planned:'в плане',completed:'выполнено',partial:'частично выполнено',
 moved:'перенесено',missed_time:'пропущено и перенесено',not_completed:'не выполнено'};

/** Schedules review, never approves artwork, completes a task or publishes. */
export default function PersonaLifeOSBridge({post,onScheduleApplied}:{post:EditorialPost;onScheduleApplied?:(date:string)=>void}){
 const [date,setDate]=useState(post.scheduledDate??planLocalDate(new Date()));
 const [time,setTime]=useState('18:00'),[busy,setBusy]=useState(false);
 const [message,setMessage]=useState(''),[status,setStatus]=useState<PersonaErikaStatus|null>(null);
 const generation=useRef(0);
 useEffect(()=>{generation.current++;setStatus(null);setMessage('');setBusy(false)},[post.id,post.revision]);
 useEffect(()=>{setDate(post.scheduledDate??planLocalDate(new Date()))},[post.id]);
 async function run(schedule:boolean){
  if(busy)return;
  const token=++generation.current,selectedDate=date;
  setBusy(true);setMessage('');setStatus(null);
  try{
   if(schedule){
    const result=await schedulePersonaAuthorReview(post,{date:selectedDate,time},port);
    if(token!==generation.current)return;
    setMessage(result.message+(result.status==='UNAVAILABLE'&&result.writeMayHaveSucceeded?
     ' Запись могла сохраниться: сначала проверь расписание, затем повторяй.':''));
    if(result.status!=='VERIFIED')return;
    onScheduleApplied?.(selectedDate);
   }
   const checked=await readPersonaErikaStatus(post.id,[post],selectedDate,port);
   if(token!==generation.current)return;
   setStatus(checked);
   if(!schedule||checked.status!=='VERIFIED')setMessage(checked.message);
  }finally{if(token===generation.current)setBusy(false)}
 }
 return <section aria-label="Life OS и Эрика · авторский просмотр" data-testid="persona-lifeos-bridge">
  <h4>Авторский просмотр в Life OS</h4>
  <p>Материал: <code>{post.id}</code>. {port.provenance==='LOCAL_RUNTIME'?
   'Локальное расписание на этом устройстве.':'Облачное расписание: связь проверяется при обращении.'}</p>
  <p>Дата ниже — задача просмотра на 20 минут. План выпуска и авторские решения меняются отдельно.</p>
  <label>Дата просмотра <input type="date" value={date} disabled={busy}
   onChange={e=>{setDate(e.target.value);setStatus(null);setMessage('')}}/></label>{' '}
  <label>Время <input type="time" value={time} disabled={busy}
   onChange={e=>setTime(e.target.value)}/></label>
  <div style={{display:'grid',gap:8}}>
   <button className="personaEditorialExport" type="button" disabled={busy||!date||!time} onClick={()=>void run(true)}>
    {busy?'Проверяется…':'Добавить просмотр в Life OS'}</button>
   <button className="personaEditorialCopy" style={{minHeight:44}} type="button" disabled={busy||!date} onClick={()=>void run(false)}>Эрика: проверить статус материала</button>
  </div>
  <div role="status" aria-live="polite">
   {message&&<p>{message}</p>}
   {status?.status==='VERIFIED'&&<>
    <p>Эрика прочитала материал {status.contentId}, редакция {status.revision}, и расписание на {date}.</p>
    <p>Текст: {approval(status.contentApproval)}. Оформление: {approval(status.visualApproval)}.</p>
    <p>Источники: {status.sourceReview==='MANUAL_REVIEW_RECORDED'?'сохранена ручная проверка':
     status.sourceReview==='NO_RESEARCH_EVIDENCE'?'исследовательские подтверждения отсутствуют':'проверка не подтверждена'}.</p>
    {status.tasks?.map(task=><p key={task.id} data-testid="persona-lifeos-review-task">
     Просмотр: {formatPersonaReviewInterval(task)}, {taskStatus[task.status]??'статус неизвестен'}.</p>)}
    {!status.tasks?.length&&<p>На выбранную дату задач просмотра этого материала нет.</p>}
    <p>Технический экспорт и публикация здесь не проверялись. DiveM не подключён.</p>
   </>}
  </div>
 </section>;
}
