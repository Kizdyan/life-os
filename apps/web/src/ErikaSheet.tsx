import React from 'react';
import{useEffect,useRef,useState}from'react';import{executeErika}from'./erika';import{applyPlan,today}from'./api';import{planCompound,parseExactTimeRange,planLocalDate,planLocalDateTime}from'./planner';import{autoVoice}from'./voiceController';import type{Item}from'./types';const fp=(d:string,p:{title:string;start?:string;end?:string}[])=>[d,...p.map(x=>`${x.title.toLowerCase()}:${x.start}:${x.end}`)].join('|');export default function ErikaSheet({items,onClose,onApplied}:{items:Item[];onClose:()=>void;onApplied:(changedDate?:string)=>void}){const[text,setText]=useState(''),[message,setMessage]=useState('Слушаю…'),[busy,setBusy]=useState(false),latest=useRef('');useEffect(()=>autoVoice(t=>{latest.current=t;setText(t)},()=>void run(latest.current)),[]);async function run(value=text){if(!value.trim()||busy)return;setBusy(true);setMessage('Обрабатываю…');try{
  const exact = parseExactTimeRange(value);
  if (exact) {
    const d = planLocalDate(new Date(), exact.dayOffset);
    const plan = [exact];
    const payload=[{
      title:exact.title,kind:'task',
      planned_start:planLocalDateTime(d,exact.start),
      planned_end:planLocalDateTime(d,exact.end),
    }];
    const result=await applyPlan(fp(d,plan),payload);
    const fresh=await today(d);
    if (result.ids.some(id=>!fresh.some(x=>x.id===id))) {
      throw new Error('Не удалось подтвердить сохранение задачи.');
    }
    setMessage(`${result.replayed?'Задача уже была сохранена':'Задача добавлена'}: ${exact.title}, ${exact.dayOffset?'завтра':'сегодня'} ${exact.start}–${exact.end}.`);
    onApplied(d);
    return;
  }
  const plan=planCompound(value,items),d=planLocalDate(new Date());
  if(plan.length>1||plan.some(x=>x.start)){if(plan.some(x=>!x.start||!x.end)){setMessage('Не могу безопасно разместить все пункты. Уточните время или границу дня.');return}const payload=plan.map(x=>({title:x.title,kind:'task',planned_start:planLocalDateTime(d,x.start!),planned_end:planLocalDateTime(d,x.end!)}));const result=await applyPlan(fp(d,plan),payload);const fresh=await today(d),created=result.ids.filter(id=>fresh.some(x=>x.id===id));if(created.length!==result.ids.length)throw Error('План записан не полностью — требуется повторная проверка');setMessage(`Готово. В расписание добавлено: ${created.length}.${result.replayed?' Повторная команда не создала дублей.':''}`);onApplied(d);return}const r=await executeErika(value,items);setMessage(r.message);if(r.understood)onApplied()}catch(e){setMessage('Не применяю изменения: '+String(e))}finally{setBusy(false)}}return <div className="sheetBackdrop" onClick={onClose}><div className="sheet" onClick={e=>e.stopPropagation()}><div className="sheetHead"><b>Эрика</b><button onClick={onClose}>×</button></div><textarea value={text} onChange={e=>{latest.current=e.target.value;setText(e.target.value)}} placeholder="Говорите свободно…"/><button className="send" disabled={busy} onClick={()=>void run()}>{busy?'Обрабатываю…':'Выполнить'}</button>{message&&<p style={{whiteSpace:'pre-line'}}>{message}</p>}</div></div>}