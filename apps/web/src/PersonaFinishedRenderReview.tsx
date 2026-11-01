import React,{useEffect,useRef,useState} from 'react';
import type {PersonaLocalRenderRecord} from './personaLocalRenderImport';
import {inspectPersonaFinishedRenderImport,makePersonaFinalAuthorReview,
 PERSONA_FINAL_REVIEW_KEYS,type PersonaFinalReviewChecks,type PersonaFinalAuthorReview} from './personaFinishedRenderImport';

const criteriaLabels:Record<keyof PersonaFinalReviewChecks,string>={
 performance:'Актёрская игра, мимика и естественные паузы',
 framing:'Кадрирование: лицо, очки, руки, клавиши',
 color:'Свет, баланс сцен и естественный цвет кожи',
 audio:'Разборчивость речи, громкость и музыка',
 captions:'Точный текст, таймкоды и безопасная зона субтитров',
 rhythm:'Комедийный ритм, переходы и финальная реакция'
};
const readJson=async(file:File)=>{
 if(!file.size||file.size>1000000)throw Error('JSON должен быть меньше 1 МБ.');
 return JSON.parse(await file.text()) as unknown;
};
async function sha256(file:File):Promise<string>{
 if(!globalThis.crypto?.subtle)throw Error('SHA-256 требует HTTPS или localhost.');
 const bytes=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
 return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
}
async function durationOf(file:File):Promise<number>{
 const url=URL.createObjectURL(file),video=document.createElement('video');
 video.preload='metadata';
 try{
  return await new Promise<number>((ok,bad)=>{
   const timer=window.setTimeout(()=>bad(Error('Нет метаданных MP4 за 12 секунд.')),12000);
   video.onloadedmetadata=()=>{window.clearTimeout(timer);
    Number.isFinite(video.duration)&&video.duration>0?ok(video.duration):bad(Error('Невозможно определить длительность.'))};
   video.onerror=()=>{window.clearTimeout(timer);bad(Error('Браузер не может прочитать финальный MP4.'))};
   video.src=url;
  });
 }finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url)}
}
const initialChecks=():PersonaFinalReviewChecks=>({
 performance:false,framing:false,color:false,audio:false,captions:false,rhythm:false
});
export default function PersonaFinishedRenderReview({draft,onSave,canImport}:{
 draft:PersonaLocalRenderRecord;onSave:(value:PersonaLocalRenderRecord)=>boolean;canImport:boolean;
}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [videoUrl,setVideoUrl]=useState<string|null>(null);
 const [reviewer,setReviewer]=useState(''),[notes,setNotes]=useState('');
 const [watched,setWatched]=useState(false),[checks,setChecks]=useState<PersonaFinalReviewChecks>(initialChecks);
 const urlRef=useRef<string|null>(null),fileHash=useRef<string|null>(null),generation=useRef(0);
 useEffect(()=>()=>{generation.current++;if(urlRef.current)URL.revokeObjectURL(urlRef.current)},[]);
 const finished=draft.finished;
 const sameFile=Boolean(videoUrl&&finished&&fileHash.current===finished.finishedSha256);
 async function importFinished(files:FileList|null){
  if(!files||busy)return;
  const run=++generation.current;setBusy(true);setMessage('');
  try{
   if(!canImport)throw Error('Исходный съёмочный бриф больше не подтверждён.');
   const selected=Array.from(files),map=new Map(selected.map(f=>[f.name,f]));
   if(![3,4].includes(selected.length)||map.size!==selected.length)throw Error('Нужны FINISH-RESULT.json, finish-qa.json, finished-candidate.mp4 и, если он создан, video-quality.json.');
   const resultFile=map.get('FINISH-RESULT.json'),qaFile=map.get('finish-qa.json'),
    qualityFile=map.get('video-quality.json'),videoFile=map.get('finished-candidate.mp4');
   if(!resultFile||!qaFile||!videoFile)throw Error('Имена файлов из одной папки финализации должны совпадать.');
   if(videoFile.size<1024||videoFile.size>160*1024*1024)
    throw Error('Видео для локального импорта должно быть от 1 КБ до 160 МБ.');
   const [report,qa,quality,fileSha,duration]=await Promise.all([
    readJson(resultFile),readJson(qaFile),qualityFile?readJson(qualityFile):Promise.resolve(undefined),sha256(videoFile),durationOf(videoFile)]);
   if(run!==generation.current)return;
   const result=inspectPersonaFinishedRenderImport({draft,report,qa,quality,
    video:{name:videoFile.name,size:videoFile.size,sha256:fileSha,durationSec:duration},
    importedAt:new Date().toISOString()});
   const merged=result.finishedSha256===finished?.finishedSha256?
    {...result,authorReview:finished?.authorReview}:result;
   if(!onSave({...draft,finished:merged}))
    throw Error('Не удалось сохранить: проект или исходный черновик изменился.');
   if(urlRef.current)URL.revokeObjectURL(urlRef.current);
   const url=URL.createObjectURL(videoFile);urlRef.current=url;fileHash.current=fileSha;setVideoUrl(url);
   setWatched(false);setChecks(initialChecks());setReviewer('');setNotes('');
   setMessage(result.quality?'Финишный MP4 и отчёт качества проверены по SHA-256. Художественное решение остаётся за автором.':'Финишный MP4 проверен по SHA-256 и двум локальным отчётам. Для этого старого результата отдельный отчёт качества ещё не создан.');
  }catch(error){if(run===generation.current)setMessage('Импорт отклонён: '+String((error as Error).message||error))}
  finally{if(run===generation.current)setBusy(false)}
 }
 function decide(decision:PersonaFinalAuthorReview['decision']){
  if(!finished||!sameFile){setMessage('Сначала откройте проверенный финальный MP4.');return}
  try{
   const authorReview=makePersonaFinalAuthorReview({
    finished,decision,reviewer,notes,criteria:checks,watchedEntireVideo:watched,
    videoSha256:fileHash.current??'',reviewedAt:new Date().toISOString()
   });
   if(!onSave({...draft,finished:{...finished,authorReview}}))
    throw Error('Сохранение отменено: проект изменился. Повторите проверку актуальной версии.');
   setMessage(decision==='approved-final-cut'?
    'Финальный монтаж принят автором в проекте. Публикация по-прежнему запрещена.':
    'Решение о доработке сохранено. Исходный и финальный файлы не изменены.');
  }catch(error){setMessage('Решение не сохранено: '+String((error as Error).message||error))}
 }
 return <section className="personaFinishedReview" aria-label="Финишный MP4 и художественная приёмка">
  <h4>Финишный Reels · художественная приёмка</h4>
  <p>После команды <code>media:finish:reel</code> выбери MP4, два отчёта и <code>video-quality.json</code>, если он создан. Они останутся на этом устройстве.</p>
  <label>Загрузить итоговый MP4 и локальные отчёты
   <input type="file" accept=".json,.mp4,application/json,video/mp4" multiple
    aria-label="Выбрать FINISH-RESULT.json, finish-qa.json, video-quality.json и finished-candidate.mp4"
    disabled={busy||!canImport} onChange={event=>{void importFinished(event.currentTarget.files);event.currentTarget.value=''}}/>
  </label>
  {busy&&<p role="status">Проверка SHA-256 и локальных QA-отчётов…</p>}
  {message&&<p role="status">{message}</p>}
  {finished&&<div className="personaRenderReturnDetails">
   <b>{finished.authorReview?.decision==='approved-final-cut'?'Финальный монтаж принят (не опубликован)':
    finished.authorReview?.decision==='needs-revision'?'Нужна доработка':'Готов для личного просмотра'}</b>
   <p>{finished.durationSec.toFixed(2)} сек. · 1080×1920 / 30 fps · субтитров: {finished.captionCount} · музыка: {finished.musicAdded?'добавлена':'без нового трека'}</p>
   <p>Проверен SHA-256 загруженного MP4 и соответствие отчётов FFmpeg. Качество изображения и звука оценивается только после личного просмотра.</p>
   <div className="personaRenderReturnDetails" aria-label="Анализ качества видео">
    <h4>Анализ качества видео</h4>
    {finished.quality?<>
     <p>Привязан к SHA-256 MP4 · предупреждений: {finished.quality.warningCount} · пунктов для просмотра: {finished.quality.humanReviewCount}.</p>
     <ul>{finished.quality.findings.map((finding,index)=><li key={finding.id+'-'+index}>
      <b>{finding.status==='warning'?'Предупреждение':finding.status==='measured'?'Измерено':'Проверить вручную'}: {finding.title}</b><br/>
      {finding.detail}{finding.timecodes.length?' · '+finding.timecodes.join(', '):''}
     </li>)}</ul>
    </>:<p>Для этого ранее собранного результата нет <code>video-quality.json</code>. Запусти новую локальную финализацию для измеримого отчёта; это не означает дефект или одобрение.</p>}
   </div>
   {finished.authorReview&&<p>Последнее решение: {finished.authorReview.reviewer} · {finished.authorReview.notes||'без замечаний'}</p>}
   {!sameFile&&<p>После обновления страницы выбери те же файлы повторно, чтобы посмотреть видео. MP4 не сохраняется внутри браузерного проекта.</p>}
  </div>}
  {sameFile&&finished&&<>
   <video className="personaRenderReturnVideo" controls playsInline preload="metadata" src={videoUrl??undefined}/>
   <div className="personaFinalReviewChecklist">
    <h4>Решение автора — отдельно от публикации</h4>
    <label><input type="checkbox" checked={watched} onChange={e=>setWatched(e.target.checked)}/>
     Я лично посмотрел итоговый MP4 целиком со звуком</label>
    {PERSONA_FINAL_REVIEW_KEYS.map(key=><label key={key}>
     <input type="checkbox" checked={checks[key]} onChange={e=>setChecks(p=>({...p,[key]:e.target.checked}))}/>
     {criteriaLabels[key]}</label>)}
    <label>Кто принимает монтаж<input type="text" maxLength={100} value={reviewer}
     onChange={e=>setReviewer(e.target.value)} placeholder="Имя автора"/></label>
    <label>Замечания или причины доработки<textarea maxLength={3000} value={notes}
     onChange={e=>setNotes(e.target.value)} placeholder="Что изменить перед публикационной подготовкой?"/></label>
    <div className="actions">
     <button type="button" disabled={!watched||reviewer.trim().length<2||notes.trim().length<5}
      onClick={()=>decide('needs-revision')}>Вернуть на доработку</button>
     <button type="button" className="primary"
      disabled={!watched||reviewer.trim().length<2||!PERSONA_FINAL_REVIEW_KEYS.every(k=>checks[k])}
      onClick={()=>decide('approved-final-cut')}>Утвердить финальный монтаж (без публикации)</button>
    </div>
    <p>Даже подтверждённая художественная приёмка не даёт разрешения на публикацию. Отдельный сетевой этап не подключён.</p>
   </div>
  </>}
 </section>;
}
