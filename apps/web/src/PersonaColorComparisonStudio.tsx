import React,{useEffect,useRef,useState} from 'react';
import {
 COLOR_VARIANT_PRESETS,addPersonaColorReviewNote,choosePersonaColorVariant,createPersonaColorReviewBrief,rejectPersonaColorVariants,inspectPersonaColorComparisonManifest,
 readPersonaColorComparisonRecord,readPersonaComparisonQcSummary,samePersonaColorComparisonEvidence,
 type ComparisonFileEvidence,type PersonaColorComparisonRecord,type PersonaColorVariantId,type PersonaComparisonQcSummary,
 type PersonaColorReviewCategory,type PersonaColorReviewAssessment,
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
 const [noteText,setNoteText]=useState('');
 const [noteCategory,setNoteCategory]=useState<PersonaColorReviewCategory>('skin');
 const [noteAssessment,setNoteAssessment]=useState<PersonaColorReviewAssessment>('issue');
 const [quality,setQuality]=useState<PersonaComparisonQcSummary|null>(null);
 const sourcePlayer=useRef<HTMLVideoElement|null>(null);
 const variantPlayer=useRef<HTMLVideoElement|null>(null);
 const generation=useRef(0);
 const qcGeneration=useRef(0);
 const ownedUrls=useRef<string[]>([]);
 useEffect(()=>()=>{generation.current++;qcGeneration.current++;ownedUrls.current.forEach(url=>URL.revokeObjectURL(url));ownedUrls.current=[]},[]);
 useEffect(()=>{setComment(record?.comment??'')},[record?.sourceSha256,record?.selectedVariantId,record?.comment]);
 useEffect(()=>{setActive(record?.selectedVariantId??'natural-clean')},[record?.sourceSha256,record?.selectedVariantId]);
 useEffect(()=>{qcGeneration.current++;setQuality(null);setNoteText('')},[projectId,record?.sourceSha256]);
 useEffect(()=>{if(variantPlayer.current&&sourcePlayer.current){
  variantPlayer.current.currentTime=Math.min(sourcePlayer.current.currentTime,variantPlayer.current.duration||Infinity);
 }},[active,urls]);
 async function importFiles(fileList:FileList|null){
  if(!fileList||busy)return;
  const task=++generation.current;
  qcGeneration.current++;
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
   setQuality(null);
   setNoteText('');
   setActive(next.selectedVariantId??'natural-clean');
   setComment(next.comment??'');
   setMessage(keepDecision
    ?'Те же файлы подтверждены повторно; сохранённый выбор не изменён.'
    :'SHA-256 оригинала и трёх вариантов подтверждены. Теперь выберите обработку.');
  }catch(error){
   if(generation.current===task)setMessage('Импорт отклонён: '+readableError(error));
  }finally{if(generation.current===task)setBusy(false)}
 }
 async function importQc(file:File|undefined){
  if(!file||!record||!urls){setMessage('Сначала импортируйте исходный пакет из пяти файлов.');return;}
  const task=++qcGeneration.current;
  const mediaTask=generation.current;
  if(file.size>5000000){setQuality(null);setMessage('QC-отчёт слишком велик (максимум 5 МБ).');return;}
  try{
   const data:unknown=JSON.parse(await file.text());
   if(qcGeneration.current!==task||generation.current!==mediaTask)return;
   const summary=readPersonaComparisonQcSummary(data,record);
   if(!summary)throw Error('QC не соответствует SHA-256 текущего оригинала и трёх обработок либо имеет неправильную структуру.');
   setQuality(summary);
   setMessage('Технический QC загружен. Это не художественное одобрение.');
  }catch(error){
   if(qcGeneration.current===task&&generation.current===mediaTask){
    setQuality(null);
    setMessage('QC отклонён: '+readableError(error));
   }
  }
 }
 function saveChoice(){
  if(!record||!urls){setMessage('Сначала повторно подтвердите оригинал и три MP4 через импорт файлов. Сохранённое решение можно просмотреть без файлов, но нельзя изменить без проверки.');return;}
  try{
   const next=choosePersonaColorVariant(record,active,comment,new Date().toISOString());
   if(!onSave(next))throw Error('Не удалось сохранить решение в проекте.');
   setMessage('Авторский выбор сохранён в проекте. Это не разрешение публикации.');
  }catch(error){setMessage('Решение не сохранено: '+readableError(error))}
 }
 function downloadReviewBrief(){
  if(!record){setMessage('Нет сохранённого материала для экспорта.');return;}
  try{
   const brief=createPersonaColorReviewBrief(record,new Date().toISOString());
   const blob=new Blob([JSON.stringify(brief,null,2)+'\n'],{type:'application/json'});
   const url=URL.createObjectURL(blob);
   const link=document.createElement('a');
   link.href=url;
   link.download='PERSONA-REVIEW-'+record.sourceSha256.slice(0,12)+'.json';
   link.style.display='none';
   document.body.appendChild(link);
   try{link.click()}finally{link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),3000)}
   setMessage('Review Brief подготовлен для локального сохранения. Видео не экспортируется.');
  }catch(error){setMessage('Не удалось экспортировать замечания: '+readableError(error))}
 }
 function rejectAll(){
  if(!record||!urls){setMessage('Сначала подтвердите все пять файлов сравнительного пакета.');return;}
  try{
   const next=rejectPersonaColorVariants(record,comment,new Date().toISOString());
   if(!onSave(next))throw Error('Не удалось сохранить отказ в текущем проекте.');
   setMessage('Все три варианта отклонены автором. Причина сохранена. Публикация не разрешена.');
  }catch(error){setMessage('Отклонение не сохранено: '+readableError(error))}
 }
 function saveObservation(){
  const video=sourcePlayer.current;
  if(!record||!urls||!video){setMessage('Для наблюдений сначала импортируйте пять файлов.');return;}
  try{
   const next=addPersonaColorReviewNote(record,active,video.currentTime,noteCategory,
    noteAssessment,noteText,new Date().toISOString());
   if(!onSave(next))throw Error('Не удалось сохранить наблюдение в проекте.');
   setNoteText('');
   setMessage('Замечание по кадру сохранено для '+COLOR_VARIANT_PRESETS.find(p=>p.id===active)?.label+'.');
  }catch(error){setMessage('Наблюдение не сохранено: '+readableError(error))}
 }
 function jumpToQcMoment(atSec:number,variantId:PersonaColorVariantId){
  const original=sourcePlayer.current,graded=variantPlayer.current;
  if(!urls||!original)return;
  const target=Math.max(0,Math.min(atSec,Number.isFinite(original.duration)?original.duration:atSec));
  original.pause();
  original.currentTime=target;
  if(graded){
   graded.pause();
   if(active===variantId)graded.currentTime=Math.min(target,Number.isFinite(graded.duration)?graded.duration:target);
  }
  setActive(variantId); // variant mount effect syncs the other player after switch.
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
   <code>node tools/persona-color-variants.mjs "C:\Video\original.mp4" "C:\Video\persona-variants-01" [ffmpeg-dir]</code>
   <p>Если FFmpeg не находится в PATH, третьим параметром укажите папку с ffmpeg.exe и ffprobe.exe. Рендерер создаст одну папку с пятью файлами: точной копией оригинала, COMPARISON.json и тремя вариантами MP4. Выберите все пять файлов из этой папки за один раз. Исходник по первоначальному пути не изменяется. Для нового рендера укажите новую папку назначения.</p>
   <p>HDR/PQ/HLG без корректного tone mapping не обрабатываются. Исходники остаются локальными.</p>
  </details>
  <details>
   <summary>Создать локальный отчёт Video Quality Lab</summary>
   <p>После рендера пяти файлов запустите в отдельном тестовом worktree PR #138:</p>
   <code>npm run media:comparison:review -- "C:\Video\persona-variants-01" [ffmpeg-dir]</code>
   <p>Команда создаст новую соседнюю папку. Откройте REVIEW.html для сравнения кадров, затем импортируйте QUALITY.json в Comparison Studio. Старые папки и видео не изменяются. Художественную оценку выполняет автор.</p>
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
   <p><b>Статус:</b> {current.rejectedAll?
    'Автор отклонил все три обработки':current.selectedVariantId?
    'Автор выбрал '+COLOR_VARIANT_PRESETS.find(p=>p.id===current.selectedVariantId)?.label:
    'Ожидает решения автора'} · публикация не разрешена.</p>
   {(current.selectedVariantId||current.rejectedAll)&&<p>Комментарий: {current.comment||'не указан'} · {current.decidedAt}</p>}
   {Boolean(current.decisionHistory?.length)&&<details>
    <summary>История художественных решений ({current.decisionHistory?.length})</summary>
    <ol>{current.decisionHistory?.slice(-5).reverse().map((entry,index)=><li key={entry.decidedAt+'-'+index}>
     {entry.decidedAt} · {entry.rejectedAll?'Отклонены все варианты':COLOR_VARIANT_PRESETS.find(p=>p.id===entry.selectedVariantId)?.label} · {entry.comment||'без комментария'}
    </li>)}</ol>
   </details>}
   {(Boolean(current.reviewNotes?.length)||current.rejectedAll||Boolean(current.selectedVariantId))&&
    <button type="button" className="ghost" onClick={downloadReviewBrief}>
     Скачать художественные замечания для Codex (JSON)
    </button>}
   {Boolean(current.reviewNotes?.length)&&<details>
    <summary>Замечания по кадрам ({current.reviewNotes?.length})</summary>
    <ol>{current.reviewNotes?.slice(-10).reverse().map((note,index)=><li key={note.createdAt+'-'+index}>
     {COLOR_VARIANT_PRESETS.find(p=>p.id===note.variantId)?.label} · {note.atSec.toFixed(2)} с ·
     {note.assessment==='issue'?' проблема':' хорошо'} · {note.category} · {note.note}
     {urls&&<button type="button" className="ghost" onClick={()=>jumpToQcMoment(note.atSec,note.variantId)}>Показать кадр</button>}
    </li>)}</ol>
   </details>}
   {!urls&&<p>После перезагрузки решение сохраняется, но браузер не хранит MP4. Чтобы снова сравнить видео, повторно выберите пять исходных файлов.</p>}
   {urls&&<label className="personaComparisonPicker">Импорт отчёта Video Quality Lab (необязательно)
    <input type="file" accept=".json,application/json" aria-label="Выбрать технический QC-отчёт"
     onChange={event=>{void importQc(event.currentTarget.files?.[0]);event.currentTarget.value=''}}/>
   </label>}
   {quality&&<div className="personaComparisonDetails" aria-label="Технический QC">
    <p><b>Технический QC:</b> {quality.technicalStatus==='pass'?'PASS':'FAIL'}. Художественная приёмка не проведена.</p>
    <ul>{quality.variants.map(item=><li key={item.id}>
     {COLOR_VARIANT_PRESETS.find(p=>p.id===item.id)?.label}: {item.technicalStatus.toUpperCase()}
     {item.problems.length>0?' · '+item.problems.join(', '):''}
     {item.jumpTimesSec.length>0?' · возможные скачки (4 кадр/с): '+item.jumpTimesSec.map(sec=>sec.toFixed(2)+' с').join(', '):''}
     {item.temporalStatus&&' · анализ мерцания (12 кадр/с): '+(item.temporalStatus==='measured'?'выполнен':'нет данных')}
     {item.temporalJumpTimesSec.length>0&&<div className="personaComparisonReviewTimes" aria-label={'Подозрительные моменты '+item.id}>
      {item.temporalJumpTimesSec.map((sec,index)=><button type="button" key={index}
       onClick={()=>jumpToQcMoment(sec,item.id)}>
       Проверить {sec.toFixed(2)} с
      </button>)}
     </div>}
    </li>)}</ul>
    <p>Склейки и движение могут вызвать ложные предупреждения. Проверка 12 кадр/с не исключает быстрое мерцание. Нажмите на таймкод и сравните оригинал с обработкой. Отчёт не разрешает публикацию.</p>
   </div>}
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
   {urls&&<details>
    <summary>Зафиксировать замечание по текущему кадру</summary>
    <p>Таймкод берётся из оригинала. Заметка относится только к этому исходнику и выбранной обработке.</p>
    <div className="personaComparisonNoteControls">
     <label>Аспект оценки
      <select aria-label="Аспект художественной оценки" value={noteCategory}
       onChange={event=>setNoteCategory(event.target.value as PersonaColorReviewCategory)}>
       <option value="skin">Кожа и лицо</option><option value="glasses">Очки</option>
       <option value="lighting">Свет и цвет</option><option value="detail">Детали и шум</option>
       <option value="motion">Движение</option><option value="audio">Звук</option>
       <option value="other">Другое</option>
      </select>
     </label>
     <label>Характер наблюдения
      <select aria-label="Характер наблюдения" value={noteAssessment}
       onChange={event=>setNoteAssessment(event.target.value as PersonaColorReviewAssessment)}>
       <option value="issue">Нужно исправить</option><option value="good">Нравится</option>
      </select>
     </label>
    </div>
    <label>Комментарий к кадру
     <textarea aria-label="Комментарий к кадру" value={noteText} maxLength={300}
      onChange={event=>setNoteText(event.target.value)}
      placeholder="Что заметно в этом кадре?"/>
    </label>
    <button type="button" className="ghost" disabled={busy||!noteText.trim()} onClick={saveObservation}>Сохранить наблюдение на текущем таймкоде</button>
   </details>}
   <label>Комментарий к выбору или отклонению
    <textarea aria-label="Комментарий к выбору" value={comment} maxLength={1000} disabled={!urls||busy} onChange={event=>setComment(event.target.value)}
     placeholder="Что нравится или почему ни один вариант не подходит?"/>
   </label>
   <div className="personaComparisonDecisionActions">
    <button type="button" className="primary" disabled={!urls||busy} onClick={saveChoice}>Сохранить выбор: {COLOR_VARIANT_PRESETS.find(p=>p.id===active)?.label}</button>
    <button type="button" className="ghost" disabled={!urls||busy||!comment.trim()} onClick={rejectAll}>Отклонить все три обработки</button>
   </div>
  </div>}
 </section>;
}
