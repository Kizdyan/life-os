import React,{useEffect,useRef,useState} from 'react';
import {
 COLOR_VARIANT_PRESETS,choosePersonaColorVariant,inspectPersonaColorComparisonManifest,
 readPersonaColorComparisonRecord,samePersonaColorComparisonEvidence,
 type ComparisonFileEvidence,type PersonaColorComparisonRecord,type PersonaColorVariantId,
} from './personaColorComparison';
import './persona-color-comparison.css';

async function sha256(file:File):Promise<string>{
 if(!globalThis.crypto?.subtle)throw Error('Для SHA-256 откройте Persona по HTTPS или localhost.');
 const bytes=await globalThis.crypto.subtle.digest('SHA-256',await file.arrayBuffer());
 return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}
function readableError(error:unknown):string{
 return error instanceof Error?error.message:String(error);
}
type VideoUrls={source:string;variants:Record<PersonaColorVariantId,string>};
export function PersonaColorComparisonStudio({projectId,record,onSave}:{
 projectId:string;record:PersonaColorComparisonRecord|null;
 onSave:(record:PersonaColorComparisonRecord)=>boolean;
}){
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [urls,setUrls]=useState<VideoUrls|null>(null);
 const [active,setActive]=useState<PersonaColorVariantId>(record?.selectedVariantId??'natural-clean');
 const [comment,setComment]=useState(record?.comment??'');
 const sourcePlayer=useRef<HTMLVideoElement|null>(null);
 const variantPlayer=useRef<HTMLVideoElement|null>(null);
 const generation=useRef(0);
 const ownedUrls=useRef<string[]>([]);
 useEffect(()=>()=>{generation.current++;ownedUrls.current.forEach(url=>URL.revokeObjectURL(url));ownedUrls.current=[]},[]);
 useEffect(()=>{setComment(record?.comment??'')},[record?.sourceSha256,record?.selectedVariantId,record?.comment]);
 useEffect(()=>{setActive(record?.selectedVariantId??'natural-clean')},[record?.sourceSha256,record?.selectedVariantId]);
 useEffect(()=>{if(variantPlayer.current&&sourcePlayer.current){
  variantPlayer.current.currentTime=Math.min(sourcePlayer.current.currentTime,variantPlayer.current.duration||Infinity);
 }},[active,urls]);
 async function importFiles(fileList:FileList|null){
  if(!fileList||busy)return;
  const task=++generation.current;
  setBusy(true);setMessage('Проверяю пять файлов и их SHA-256…');
  try{
   const files=Array.from(fileList);
   if(files.length!==5)throw Error('Выберите ровно пять файлов: COMPARISON.json, оригинал и три MP4 обработки.');
   const json=files.filter(file=>file.name==='COMPARISON.json');
   const mp4=files.filter(file=>file.name.toLowerCase().endsWith('.mp4'));
   if(json.length!==1||mp4.length!==4||json[0].size<2||json[0].size>500000)
    throw Error('Нужен один COMPARISON.json до 500 КБ и четыре MP4.');
   if(mp4.some(file=>file.size<1024||file.size>160*1024*1024))
    throw Error('Каждый MP4 должен иметь размер от 1 КБ до 160 МБ.');
   const manifest:unknown=JSON.parse(await json[0].text());
   const evidence:ComparisonFileEvidence[]=[];
   // Hash sequentially to avoid holding four large ArrayBuffers in memory.
   for(const file of mp4){
    evidence.push({name:file.name,size:file.size,sha256:await sha256(file)});
    if(generation.current!==task)return;
   }
   const imported=inspectPersonaColorComparisonManifest(manifest,evidence,new Date().toISOString());
   if(generation.current!==task)return;
   const keepDecision=record&&samePersonaColorComparisonEvidence(record,imported);
   const next=keepDecision?record:imported;
   if(!keepDecision&&!onSave(next))throw Error('Результат не сохранился; проверьте текущий проект и повторите импорт.');
   if(generation.current!==task)return;
   const nextOwned:string[]=[];
   let nextUrls:VideoUrls;
   try{
    const byName=new Map(mp4.map(file=>[file.name,file]));
    const source=URL.createObjectURL(byName.get(imported.sourceFileName)!);
    nextOwned.push(source);
    const variants={} as Record<PersonaColorVariantId,string>;
    for(const preset of COLOR_VARIANT_PRESETS){
     const url=URL.createObjectURL(byName.get(preset.fileName)!);
     nextOwned.push(url);
     variants[preset.id]=url;
    }
    nextUrls={source,variants};
   }catch(error){nextOwned.forEach(url=>URL.revokeObjectURL(url));throw error;}
   ownedUrls.current.forEach(url=>URL.revokeObjectURL(url));
   ownedUrls.current=nextOwned;
   setUrls(nextUrls);
   setActive(next.selectedVariantId??'natural-clean');
   setComment(next.comment??'');
   setMessage(keepDecision
    ?'Те же файлы подтверждены повторно; сохранённый выбор не изменён.'
    :'SHA-256 оригинала и трёх вариантов подтверждены. Теперь выберите обработку.');
  }catch(error){
   if(generation.current===task)setMessage('Импорт отклонён: '+readableError(error));
  }finally{if(generation.current===task)setBusy(false)}
 }
 function saveChoice(){
  if(!record||!urls){setMessage('Сначала повторно подтвердите оригинал и три MP4 через импорт файлов. Сохранённое решение можно просмотреть без файлов, но нельзя изменить без проверки.');return;}
  try{
   const next=choosePersonaColorVariant(record,active,comment,new Date().toISOString());
   if(!onSave(next))throw Error('Не удалось сохранить решение в проекте.');
   setMessage('Авторский выбор сохранён в проекте. Это не разрешение публикации.');
  }catch(error){setMessage('Решение не сохранено: '+readableError(error))}
 }
 function syncPlayers(){
  const src=sourcePlayer.current,variant=variantPlayer.current;
  if(!src||!variant)return;
  variant.currentTime=Math.min(src.currentTime,Number.isFinite(variant.duration)?variant.duration:src.currentTime);
 }
 const current=readPersonaColorComparisonRecord(record);
 return <section className="personaColorComparison" data-project-id={projectId} aria-label="Persona Comparison Studio">
  <h3>Comparison Studio · цветовые варианты</h3>
  <p>Обработка выполняется локально через FFmpeg. В браузере сравниваются реальные MP4, а не визуальные CSS-фильтры. Оригинал не перезаписывается.</p>
  <details>
   <summary>Как создать три варианта на компьютере</summary>
   <p>В корне Life OS запустите команду, указав полный путь к исходному MP4 и путь к новой папке результатов:</p>
   <code>node tools/persona-color-variants.mjs "C:\\Video\\original.mp4" "C:\\Video\\persona-variants-01"</code>
   <p>Затем выберите вместе пять файлов: оригинал, COMPARISON.json и три созданных MP4. Нельзя повторно использовать существующую папку назначения.</p>
   <p>HDR/PQ/HLG без корректного tone mapping не обрабатываются. Исходники остаются локальными.</p>
  </details>
  <label className="personaComparisonPicker">Импорт результатов сравнения
   <input type="file" accept=".mp4,.json,video/mp4,application/json" multiple disabled={busy}
    aria-label="Выбрать оригинал, три MP4 и COMPARISON.json"
    onChange={event=>{void importFiles(event.currentTarget.files);event.currentTarget.value=''}}/>
  </label>
  {busy&&<p role="status">Проверка локальных файлов…</p>}
  {message&&<p role="status">{message}</p>}
  {current&&<div className="personaComparisonDetails">
   <p><b>Оригинал:</b> {current.sourceFileName} · SHA-256 {current.sourceSha256.slice(0,16)}…</p>
   <p><b>Статус:</b> {current.selectedVariantId?
    'Автор выбрал '+COLOR_VARIANT_PRESETS.find(p=>p.id===current.selectedVariantId)?.label:
    'Ожидает решения автора'} · публикация не разрешена.</p>
   {current.selectedVariantId&&<p>Комментарий: {current.comment||'не указан'} · {current.decidedAt}</p>}
   {!urls&&<p>После перезагрузки решение сохраняется, но браузер не хранит MP4. Чтобы снова сравнить видео, повторно выберите пять исходных файлов.</p>}
   {urls&&<div className="personaComparisonOptions" role="group" aria-label="Цветовой вариант для просмотра">
    {COLOR_VARIANT_PRESETS.map(preset=><button type="button" key={preset.id}
     aria-pressed={active===preset.id}
     className={active===preset.id?'active':''}
     onClick={()=>setActive(preset.id)}>{preset.label}</button>)}
   </div>}
   {urls&&<div className="personaComparisonVideos">
    <div><b>Оригинал</b><video ref={sourcePlayer} controls preload="metadata" src={urls.source} aria-label="Оригинальное видео"/></div>
    <div><b>{COLOR_VARIANT_PRESETS.find(p=>p.id===active)?.label}</b><video key={active} ref={variantPlayer} controls preload="metadata" src={urls.variants[active]} aria-label="Обработанное видео"/></div>
   </div>}
   {urls&&<button type="button" className="ghost" onClick={syncPlayers}>Синхронизировать по таймкоду оригинала</button>}
   <p className="personaComparisonWarning">Сравните кожу, очки, лицо, свет и детали вручную. SHA-256 подтверждает идентичность файлов, но не художественное качество.</p>
   <label>Комментарий к выбору
    <textarea value={comment} maxLength={1000} onChange={event=>setComment(event.target.value)}
     placeholder="Какой цвет понравился и что стоит исправить?"/>
   </label>
   <button type="button" className="primary" disabled={!urls||busy} onClick={saveChoice}>Сохранить выбор: {COLOR_VARIANT_PRESETS.find(p=>p.id===active)?.label}</button>
  </div>}
 </section>;
}
