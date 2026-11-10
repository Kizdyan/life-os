import React,{useEffect,useRef,useState} from 'react';
import type {PersonaProductionBrief} from '../../../packages/core/src/persona-production-brief';
const worker='http://127.0.0.1:47832';
export function PersonaManualScript({projectId,snapshot,onApply}:{projectId:string;snapshot:string;onApply:(brief:PersonaProductionBrief,snapshot:string)=>void}){
 const key='persona.manual-script-draft.'+projectId;
 const [open,setOpen]=useState(false),[text,setText]=useState(()=>{try{return localStorage.getItem(key)??''}catch{return ''}}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[parsed,setParsed]=useState<{brief:PersonaProductionBrief;warnings:string[]}|null>(null);
 const parsedBase=useRef(snapshot);const current=useRef(snapshot),alive=useRef(true),running=useRef(false);current.current=snapshot;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 async function parse(){
  if(running.current)return;const base=snapshot,source=text;running.current=true;setBusy(true);setError('');setParsed(null);
  try{
   const health=await(await fetch(worker+'/health')).json();
   const response=await fetch(worker+'/manual-script',{method:'POST',headers:{'Content-Type':'application/json','X-Persona-Worker-Token':health.token},body:JSON.stringify({text:source,projectId})});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Ошибка парсинга');
   if(!alive.current)return;if(current.current!==base)throw Error('Проект изменился. Повторите разбор текущей редакции.');
   parsedBase.current=base;setParsed(data);
  }catch(e){if(alive.current)setError(String((e as Error).message))}finally{running.current=false;if(alive.current)setBusy(false)}
 }
 return <section className="captureCard personaAiMediaWorker" aria-label="Авторский сценарий из ChatGPT">
  <h3>Ваш сценарий → съёмочный пакет</h3>
  <p>Вставьте готовый сценарий из ChatGPT. Qwen только разбирает структуру; не оценивает идею и не переписывает реплики.</p>
  <button type="button" onClick={()=>setOpen(!open)}>Вставить свой сценарий</button>
  {open&&<><label>Утверждённый авторский текст<textarea aria-label="Текст своего сценария" value={text} maxLength={20000} rows={18} style={{width:'100%',boxSizing:'border-box'}} placeholder={'Название: Бюджет на одного\n0–2 сек: Читаешь сообщение. (Текст: БЮДЖЕТ НА ОДНОГО)\n2–4 сек: За камерой. Реплика: Нужен сильный кадр\nМузыка: pizzicato → фортепиано → струнные.'} disabled={busy} onChange={e=>{setText(e.target.value);setParsed(null);try{localStorage.setItem(key,e.target.value)}catch{setError('Не удалось сохранить черновик в браузере.')}}}/></label>
   <p>Каждый кадр: «0–2 сек: действие». Произносимую речь отметьте «Реплика:» или «Голос:». «(Текст: …)» — экранный титр, его не нужно произносить. Тайминг остаётся планом до загрузки дублей.</p>
   <button type="button" disabled={busy||text.trim().length<20} onClick={()=>void parse()}>{busy?'Qwen разбирает ваш текст…':'Разобрать сценарий без творческой критики'}</button>
   {parsed&&<div aria-label="Предпросмотр авторского пакета"><h4>{parsed.brief.sourceTitle}</h4>
    <p>Парсер: {parsed.brief.manualSource?.model}. Исходный текст сохранён без изменений.</p>
    {parsed.brief.script.map((beat,i)=><article key={beat.order}><h5>Кадр {beat.order} · {beat.durationSec} с · {parsed.brief.manualSource?.scenes[i].kind==='spoken'?'Речь':'Визуальное действие'}</h5><p>{beat.action}</p>{parsed.brief.manualSource?.scenes[i].musicAccent&&<p>Музыкальный акцент: {parsed.brief.manualSource.scenes[i].musicAccent}</p>}</article>)}
    <p><b>Свет:</b> {parsed.brief.productionPackage?.visualStyle.lighting}<br/><b>Цвет:</b> {parsed.brief.productionPackage?.visualStyle.colors}<br/><b>Музыка:</b> {parsed.brief.productionPackage?.musicalLeitmotif.instruments}<br/><b>Монтаж:</b> {parsed.brief.productionPackage?.editingRhythm.cuts}</p>
    {parsed.warnings.map(w=><p key={w}>{w}</p>)}
    <button type="button" className="primary" onClick={()=>{if(current.current!==parsedBase.current){setParsed(null);setError('Проект изменился; повторите разбор.');return}onApply(parsed.brief,parsedBase.current)}}>Подтвердить мой сценарий и перейти к съёмке</button>
   </div>}
  </>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
