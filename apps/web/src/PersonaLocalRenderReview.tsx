import React,{useEffect,useRef,useState} from 'react';
import PersonaFinishedRenderReview from './PersonaFinishedRenderReview';
import type {PersonaProductionPipeline} from '../../../packages/core/src/persona-production-pipeline';
import {assessPersonaLocalHandoff} from './PersonaLocalProductionHandoff';
import {inspectPersonaLocalRenderImport,mergePersonaDraftReimport,buildPersonaFinishOptionsTemplate,isPersonaDraftCurrentForApproval,validatePersonaMediaImportFileNames,type PersonaLocalRenderRecord} from './personaLocalRenderImport';
import {productionInputDraftExists} from './personaProductionInputJournal';
import {resolvePersonaScenarioDraftStorage} from './personaScenarioDraftJournal';
import './persona-local-render-review.css';

const readJson=async(file:File):Promise<unknown>=>{
 if(!file.size||file.size>1_000_000)throw Error(file.name+': JSON должен быть меньше 1 МБ');
 return JSON.parse(await file.text()) as unknown;
};
async function fileHash(file:File):Promise<string>{
 if(!globalThis.crypto?.subtle)throw Error('Для проверки SHA-256 нужен HTTPS или localhost.');
 const sum=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
 return [...new Uint8Array(sum)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
async function briefHash(brief:unknown):Promise<string>{
 if(!globalThis.crypto?.subtle)throw Error('Проверка сценария через SHA-256 недоступна.');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(brief)));
 return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
async function videoMetadata(file:File):Promise<{durationSec:number;width:number;height:number}>{
 const url=URL.createObjectURL(file),video=document.createElement('video');
 video.preload='metadata';
 try{
  return await new Promise<{durationSec:number;width:number;height:number}>((ok,bad)=>{
   const timeout=window.setTimeout(()=>bad(Error('Браузер не прочитал метаданные видео за 12 секунд.')),12000);
   video.onloadedmetadata=()=>{window.clearTimeout(timeout);const duration=video.duration;
    Number.isFinite(duration)&&duration>0&&video.videoWidth>0&&video.videoHeight>0?
     ok({durationSec:duration,width:video.videoWidth,height:video.videoHeight}):bad(Error('MP4 не содержит корректную длительность или размер кадра.'))};
   video.onerror=()=>{window.clearTimeout(timeout);bad(Error('Браузер не смог открыть MP4 для просмотра.'))};
   video.src=url;
  });
 }finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url)}
}

export function PersonaLocalRenderReview({projectId,pipeline,record,onSave}:{
 projectId:string;pipeline:PersonaProductionPipeline|null;record:PersonaLocalRenderRecord|null;
 onSave:(value:PersonaLocalRenderRecord)=>boolean;
}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [preview,setPreview]=useState<string|null>(null);
 const lastUrl=useRef<string|null>(null),generation=useRef(0);
 useEffect(()=>()=>{generation.current++;if(lastUrl.current)URL.revokeObjectURL(lastUrl.current)},[]);
 const brief=pipeline?.materials.productionBrief;
 const handoff=pipeline?assessPersonaLocalHandoff(pipeline,productionInputDraftExists(resolvePersonaScenarioDraftStorage(),projectId)):null;
 // Exact brief JSON alone does not confer shoot approval. A previously accepted
 // MP4 is historical once its associated handoff is no longer authorized.
 const matchesBrief=Boolean(record&&brief&&record.projectId===projectId&&record.briefSnapshot===JSON.stringify(brief));
 const approvalDecidedAt=pipeline?.materials.editorialDecision?.decision==='approved'
  ?pipeline.materials.editorialDecision.decidedAt:null;
 const current=record&&isPersonaDraftCurrentForApproval({
  record,projectId,briefSnapshot:brief?JSON.stringify(brief):null,
  handoffAllowed:Boolean(handoff?.allowed),approvalDecidedAt,
 })?record:null;
 const isStale=Boolean(record&&!current);
 const oldApprovalEpoch=Boolean(isStale&&matchesBrief&&handoff?.allowed);
 function downloadFinishTemplate(){
  if(!current){setMessage('Сначала импортируйте и проверьте MP4.');return}
  try{
   const data=buildPersonaFinishOptionsTemplate(current);
   const blob=new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'});
   const url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download='finish-options.json';document.body.appendChild(link);link.click();link.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),60000);
   setMessage('Шаблон скачан. Проверьте SRT, укажите полный путь и подтвердите captionsReviewed=true.');
  }catch(error){setMessage('Настройки не подготовлены: '+String((error as Error).message||error))}
 }
 async function importLocalFiles(files:FileList|null){
  if(!files||busy)return;
  const task=++generation.current;
  setBusy(true);setMessage('');
  try{
   if(!handoff?.allowed||!brief)throw Error(handoff?.reason??'Сначала импортируйте и одобрите съёмочный бриф.');
   const selected=Array.from(files);
   validatePersonaMediaImportFileNames(selected.map(file=>file.name),'draft');
   const byName=new Map(selected.map(f=>[f.name,f]));
   const resultFile=byName.get('RESULT.json'),qaFile=byName.get('qa.json'),videoFile=byName.get('draft-reel.mp4'),qualityFile=byName.get('video-quality.json');
   if(!resultFile||!qaFile||!videoFile)throw Error('Имена файлов должны быть RESULT.json, qa.json и draft-reel.mp4.');
   if(videoFile.size<1024||videoFile.size>160*1024*1024)throw Error('MP4 должен быть от 1 КБ до 160 МБ для безопасной проверки в браузере.');
   // Perform all checks client-side: neither reports nor media leave this device.
   const [result,qa,quality,fingerprint,metadata,sha256]=await Promise.all([
    readJson(resultFile),readJson(qaFile),qualityFile?readJson(qualityFile):Promise.resolve(undefined),
    briefHash(brief),videoMetadata(videoFile),fileHash(videoFile)]);
   if(task!==generation.current)return;
   const imported=inspectPersonaLocalRenderImport({
    projectId,brief,briefFingerprintSha256:fingerprint,result,qa,quality,
    video:{name:videoFile.name,size:videoFile.size,sha256,...metadata},importedAt:new Date().toISOString(),
   });
   const merged=mergePersonaDraftReimport(current,imported);
   if(!onSave(merged))throw Error('Проект изменился в другой вкладке или хранилище недоступно. Результат не сохранён.');
   if(lastUrl.current)URL.revokeObjectURL(lastUrl.current);
   const url=URL.createObjectURL(videoFile);lastUrl.current=url;setPreview(url);
   setMessage(merged.finished?'Тот же черновой MP4 повторно проверен: финальная художественная приёмка сохранена; файлы видео остаются локальными.':'MP4 совпадает по SHA-256 с локальным QA. Отчёт и статус проверки сохранены в проекте; видео хранится только в выбранном файле.');
  }catch(error){if(task===generation.current)setMessage('Импорт отклонён: '+String((error as Error).message||error))}
  finally{if(task===generation.current)setBusy(false)}
 }
 return <section className="personaRenderReturn" aria-label="Возврат локального монтажа в Persona">
  <h3>Черновой монтаж · авторский просмотр</h3>
  <p>После запуска локального runner выбери RESULT.json, qa.json, draft-reel.mp4 и, если создан, video-quality.json. Persona проверит SHA-256 реального файла, соответствие отчётов и точную версию сценария.</p>
  <label className="personaRenderReturnPicker">Импорт результата с компьютера
   <input type="file" multiple accept=".json,.mp4,application/json,video/mp4" disabled={busy||!handoff?.allowed}
    aria-label="Загрузить RESULT.json, qa.json, draft-reel.mp4 и необязательный video-quality.json"
    onChange={event=>{void importLocalFiles(event.currentTarget.files);event.currentTarget.value=''}}/>
  </label>
  {!handoff?.allowed&&<p role="status">{handoff?.reason??'Нет съёмочного брифа для Reels.'}</p>}
  {busy&&<p role="status">Проверяю совпадение файлов и контрольные суммы локально…</p>}
  {message&&<p role="status">{message}</p>}
  {isStale&&<p role="alert">{oldApprovalEpoch
    ?'Production Brief повторно утверждён после прежнего импорта MP4. Старое видео осталось в истории, но его художественное решение больше не считается действующим. Повторно предъявите файлы для проверки нового цикла.'
    :matchesBrief
     ?'Утверждение Production Brief больше не действует. Сохранённый MP4 остался в истории, но не считается текущим и не может быть повторно утверждён до новой проверки брифа и импорта.'
     :'В проекте сохранён результат от другой версии сценария или брифа. Он не считается текущим; повторно запусти монтаж и импортируй новый результат.'}</p>}
  {current&&<div className="personaRenderReturnDetails">
   <b>Файл принят для авторского просмотра — публикация заблокирована</b>
   <p>Видео {current.durationSec.toFixed(2)} сек. · {current.width}×{current.height} · {current.fps} fps · {(current.mp4Bytes/1048576).toFixed(1)} МБ</p>
   <p>Сопоставлены SHA-256 и данные импортированного QA. Это не повторное независимое выполнение FFprobe или проверка художественного качества.</p>
   <p>Хронометраж: {current.timingStatus==='needs-human-timing-review'?'отличается от сценария — обязательно проверить паузы и музыку':current.timingStatus==='within-brief-tolerance'?'близок к сценарию, но ритм нужно просмотреть':current.timingStatus}</p>
   <details className="personaDraftQuality" open={Boolean(current.quality?.warningCount)}>
    <summary>Анализ качества черновика {current.quality?`· ${current.quality.warningCount} предупреждений`:'· отчёт пока отсутствует'}</summary>
    {current.quality?<>
     <p>Локальный отчёт связан с SHA-256 выбранного MP4. Это не художественная оценка.</p>
     <ul>{current.quality.findings.map((finding,index)=><li key={finding.id+'-'+index}>
      <b>{finding.status==='warning'?'Предупреждение':finding.status==='measured'?'Измерено':finding.status==='not_measured'?'Не измерено':'Проверить вручную'}: {finding.title}</b>
      <span> {finding.detail}{finding.timecodes.length?' · '+finding.timecodes.join(', '):''}</span>
     </li>)}</ul>
    </>:<p>Старый черновик: video-quality.json не импортирован. После локального анализа повторно выбери четыре файла; отсутствие отчёта не означает, что недостатков нет.</p>}
   </details>
   {!preview&&<p>Чтобы снова посмотреть видео после перезагрузки, выбери файлы исходного MP4 и двух отчётов, а при наличии — video-quality.json. Браузер сохраняет сведения о проверке, но не копию MP4.</p>}
  </div>}
  {current&&<details className="personaRenderFinishHandoff">
   <summary>Финишная обработка: титры, музыка, цвет</summary>
   <p>Скачайте настройки для этого MP4: SHA-256 будет подставлен автоматически, а проверка субтитров останется не подтверждённой.</p>
   <button type="button" onClick={downloadFinishTemplate}>Скачать настройки финализации</button>
   <p>Лично проверьте текст и таймкоды, сохраните captions.reviewed.srt, укажите абсолютный путь в JSON. Затем вручную установите captionsReviewed: true. Музыка добавляется только отдельно и с подтверждёнными правами.</p>
   <p>На Windows укажи четвёртым аргументом каталог <code>bin</code>, содержащий <code>ffmpeg.exe</code> и <code>ffprobe.exe</code>. Тогда финализация работает даже если FFmpeg не находится в PATH.</p>
   <pre>{'npm run media:finish:reel -- "<ПАПКА_ЧЕРНОВИКА>" "<finish-options.json>" "<НОВАЯ_ПАПКА>" "<ПАПКА_FFMPEG_BIN>"'}</pre>
   <p>Результат: finished-candidate.mp4, finish-qa.json и FINISH-RESULT.json. Это не утверждение или публикация.</p>
  </details>}
  {current&&<PersonaFinishedRenderReview key={projectId+':'+current.mp4Sha256} draft={current} onSave={onSave} canImport={Boolean(handoff?.allowed)}/>}
  {preview&&current&&<video className="personaRenderReturnVideo" controls playsInline preload="metadata" src={preview}/>}
  <p className="personaRenderReturnWarning">Перед финализацией лично оцени актёрскую игру, свет, цвет кожи, сохранность внешности, баланс голоса и музыки, ритм и точность субтитров. Импорт не включает автопубликацию и не означает финального утверждения.</p>
 </section>;
}
