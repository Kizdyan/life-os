import React, {useMemo,useState} from 'react';
import {startPersonaProductionPipeline,advancePersonaProductionPipeline} from '../../../packages/core/src/persona-production-pipeline';
import {buildPersonaEditorialCalendar} from '../../../packages/core/src/persona-editorial-calendar.mjs';

type Slot={slotId:string;date:string;format:string;purpose:string;status:string;contentId:string|null;approved:boolean;platforms:string[];notes?:string};
const KEY='lifeos:persona:editorial-calendar:v1';
function load():Slot[]{try{const raw=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(raw)?raw.filter(x=>typeof x?.slotId==='string'):[]}catch{return []}}
function todayUTC(){const now=new Date();return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-')}
const names:Record<string,string>={photo:'Фотопост + история',reel:'Reels',carousel:'Карусель'};
export default function PersonaEditorialCalendar({onSelectSlot}:{onSelectSlot?:(slot:Slot)=>void}){
 const [previous,setPrevious]=useState<Slot[]>(load);
 const [startDate,setStartDate]=useState(todayUTC);
 const [expanded,setExpanded]=useState(false);
 const plan=useMemo(()=>buildPersonaEditorialCalendar({startDate,days:90,existing:previous}),[startDate,previous]);
 const upcoming=(plan.slots as Slot[]).slice(0,expanded?plan.slots.length:15);
 const ready=previous.filter(s=>s.status==='ready'&&s.approved);
 const [editing,setEditing]=useState<string|null>(null);
 const [idea,setIdea]=useState('');
 const [briefSlot,setBriefSlot]=useState<Slot|null>(null);
 const brief=useMemo(()=>{if(!briefSlot)return null;let pipeline=startPersonaProductionPipeline({idea:{id:briefSlot.slotId,title:briefSlot.notes||briefSlot.purpose,angle:briefSlot.notes||briefSlot.purpose,format:briefSlot.format as 'reel'|'photo'|'carousel'}});for(let step=0;step<4;step++)pipeline=advancePersonaProductionPipeline(pipeline);return pipeline.materials.productionBrief;},[briefSlot]);
 function persist(slot:Slot){const next=[...previous.filter(s=>s.slotId!==slot.slotId),slot];setPrevious(next);try{localStorage.setItem(KEY,JSON.stringify(next))}catch{}}
 function update(slot:Slot,status:string){
  persist({...slot,status,approved:false});
 }
 return <section className="captureCard" aria-label="Редакционный календарь Persona">
  <h3>Контент-план на 90 дней</h3>
  <p>3 Reels + 1 фотопост с историей + 1 карусель в неделю. Stories — дополнительно. Резерв: 6 Reels, 2 фотопоста и 2 карусели.</p>
  <label>Начало периода <input type="date" value={startDate} onChange={e=>{if(e.target.value)setStartDate(e.target.value)}}/></label>
  <p><b>Период:</b> {plan.horizon.startDate} — {plan.horizon.endDate} · <b>Слотов:</b> {plan.slots.length} · <b>Отмечено в работе или на проверке:</b> {previous.filter(s=>s.status==='in_production'||s.status==='needs_review').length}</p>
  <p>Это локальная редакционная проекция, а не синхронизация с календарём Life OS. Отметка «готово» не загружает файлы и не публикует материалы.</p>
  <div style={{display:'grid',gap:8}}>
   {upcoming.map(slot=><div key={slot.slotId} style={{borderBottom:'1px solid #8885',padding:'8px 0',display:'flex',gap:12,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'}}>
    <div><b>{slot.date} · {names[slot.format]||slot.format}</b><div style={{fontSize:12,opacity:.75}}>{slot.purpose} · {slot.platforms.join(', ')}</div></div>
    <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><button type="button" className="ghost" onClick={()=>{setEditing(slot.slotId);setIdea(slot.notes||'')}}>Тема</button><button type="button" className="ghost" onClick={()=>{setBriefSlot(slot);onSelectSlot?.(slot)}}>Съёмочный план</button><label>Статус <select aria-label={'Статус '+slot.date+' '+slot.format} value={slot.status} onChange={e=>update(slot,e.target.value)}>
     <option value="planned">Запланировано</option><option value="in_production">В работе</option><option value="needs_review">На проверке</option><option value="ready">Готово (ручная отметка)</option>
    </select></label></div>{slot.notes&&<p style={{width:'100%',fontSize:13}}>Тема: {slot.notes}</p>}{editing===slot.slotId&&<div style={{width:'100%'}}><label>Идея или съёмочное задание <textarea value={idea} onChange={e=>setIdea(e.target.value)} maxLength={3000}/></label><button type="button" onClick={()=>{persist({...slot,notes:idea.trim(),status:slot.status==='planned'?'in_production':slot.status,approved:false});setEditing(null)}}>Сохранить тему</button><button type="button" className="ghost" onClick={()=>setEditing(null)}>Отмена</button></div>}
   </div>)}
  </div>
  {briefSlot&&<div className="captureCard" aria-label="Съёмочный план для календаря"><h3>План: {briefSlot.date}</h3><p>{briefSlot.notes||briefSlot.purpose}</p>{brief?<><h4>Сценарий</h4>{brief.script.map(beat=><p key={beat.order}>{beat.durationSec} сек. · {beat.line} — {beat.action}</p>)}<h4>Кадры</h4>{brief.shots.map(shot=><p key={shot.order}>{shot.framing}: {shot.angle} · {shot.lighting}</p>)}<p>Монтаж: {brief.postProduction.transitions}</p></>:<p>Съёмочный план недоступен.</p>}<p>Это сценарный бриф, а не готовое видео. Для работы с исходниками открой редактор Persona.</p><button type="button" className="ghost" onClick={()=>setBriefSlot(null)}>Закрыть план</button></div>}
  <button type="button" className="ghost" onClick={()=>setExpanded(v=>!v)}>{expanded?'Свернуть':'Показать все 90 дней'}</button>
  <p>Ручная отметка «Готово» не означает одобрение: требуется QA, подтверждённый файл и решение автора.</p>
  <p>Публикация требует отдельного утверждения, фактического файла и подтверждения каждой платформы. Здесь нет автоматической отправки.</p>
 </section>;
}
