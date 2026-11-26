import React,{useEffect,useState} from 'react';
import {personaWorkerUrl} from './personaWorkerUrl';
type CountStatus={status:string;total?:number|null;scored?:number|null;selected?:number|null;indexed?:number|null;legacyReportedCount?:number|null;legacyResult?:string|null};
type Runtime={version:1;cache:string;personal:CountStatus;references:CountStatus;photos:CountStatus;frameIndex:CountStatus;videoIndex:CountStatus;backgroundEnabled:boolean;background:string;components:{components:{ffmpeg:boolean;whisper:boolean;ollama:boolean}}};
const labels:Record<string,string>={CONFIGURED:'Настроена',NOT_CONFIGURED:'Не настроена',INDEXED:'Индекс сохранён',PRESENT:'Отчёт есть',MISSING:'Нет данных',INVALID:'Некорректный отчёт',UNKNOWN:'Не проверено',SCORES_AVAILABLE:'Оценки доступны',UNSUPPORTED_CHECKPOINT:'Нужна совместимость формата',NO_SCORES:'Нет оценок',RECENT_HEARTBEAT:'Недавний сигнал активности',STALE_HEARTBEAT:'Нет свежего сигнала активности',REPORT_AVAILABLE:'Отчёт сохранён',DISABLED:'Отключён',IDLE:'Ожидание',RUNNING:'Выполняется',WAITING_FOR_PHOTOS:'Ожидание фотоанализа',ERROR:'Ошибка'};
const label=(s:string)=>labels[s]??'Неизвестное состояние';
export default function PersonaRuntimeStatus(){
 const [data,setData]=useState<Runtime|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
 useEffect(()=>{
  const controller=new AbortController(),signal=AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]);
  setBusy(true);setMessage('');setData(null);
  void(async()=>{
   try{
    const health=await fetch(personaWorkerUrl+'/health',{cache:'no-store',signal});
    if(!health.ok)throw Error('Локальный Worker недоступен');
    const h=await health.json();
    if(h.service!=='persona-media-worker'||h.runtimeProtocol!==1||typeof h.token!=='string')throw Error('Запущена несовместимая версия Worker');
    const r=await fetch(personaWorkerUrl+'/runtime-status',{cache:'no-store',headers:{'X-Persona-Worker-Token':h.token},signal});
    if(!r.ok)throw Error('Диагностика недоступна');
    const d=await r.json() as Runtime;
    if(d.version!==1||!d.personal||!d.references||!d.photos||!d.frameIndex||!d.videoIndex||!d.components?.components)throw Error('Некорректный диагностический отчёт');
    if(!controller.signal.aborted)setData(d);
   }catch(e){if(!controller.signal.aborted)setMessage(e instanceof Error?e.message:'Диагностика недоступна')}
   finally{if(!controller.signal.aborted)setBusy(false)}
  })();
  return()=>controller.abort();
 },[refresh]);
 return <section aria-label="Готовность локальной Persona" data-testid="persona-runtime-status">
  <h3>Готовность системы</h3>
  <button type="button" disabled={busy} onClick={()=>setRefresh(n=>n+1)}>Обновить диагностику</button>
  {busy&&<p role="status">Проверяю локальные компоненты…</p>}
  {message&&<p role="alert">{message}</p>}
  {data&&<div>
   <p>Библиотека: {label(data.cache)}</p>
   <p>Личные материалы: {label(data.personal.status)} · {data.personal.total??'—'}</p>
   <p>Референсы: {label(data.references.status)} · {data.references.total??'—'}</p>
   <p>Фото: {label(data.photos.status)} · проверенные записи: {data.photos.scored??'—'} · прежний отчёт: {data.photos.legacyReportedCount??'—'} · отобрано ранее: {data.photos.selected??'—'}</p>
   <p>Кадры референсов: {label(data.frameIndex.status)} · {data.frameIndex.indexed??'—'}</p>
   <p>Видео: {label(data.videoIndex.status)} · {data.videoIndex.indexed??'—'}</p>
   <p>Фоновый анализ: {data.backgroundEnabled?label(data.background):'Отключён'}</p>
   <p>FFmpeg: {data.components.components.ffmpeg?'доступен':'не подтверждён'} · Whisper: {data.components.components.whisper?'доступен':'не подтверждён'} · текстовая модель: {data.components.components.ollama?'доступна':'не подтверждена'}</p>
   <small>Диагностика читает локальные отчёты. Она не подтверждает художественное качество, работоспособность визуальной модели или разрешение на публикацию.</small>
  </div>}
 </section>;
}
