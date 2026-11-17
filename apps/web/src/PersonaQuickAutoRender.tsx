import React,{useEffect,useRef,useState} from 'react';
import {personaWorkerUrl} from './personaWorkerUrl';
import './persona-quick-auto-render.css';

type QuickRenderJob={id:string;title:string;state:'uploading'|'running'|'completed'|'failed'|'interrupted';stage:string;
 uploaded:number;expected:number;error:string|null;strategyStatus:'PASS'|'WARNING'|'BLOCKED'|null;ready:boolean;notice:string|null;
 moments?:{sourceName:string;startSec:number;peakSec:number;role:string;emotion:string;reason:string}[];
 styleChoice?:'cinematic'|'dynamic'|'signature-gold'|'auto';colorPreset?:'SoftCinematic'|'DetailCinematic'|null;
 autoStyle?:boolean;styleDecision?:{mode:'ai'|'manual'|'fallback'|'test-injected';mood:string|null;reason:string;provider:string}|null;
 fastDraft?:boolean;fullRenderStatus?:'RENDERING'|'COMPLETED'|'FAILED'|null;
 fullRenderError?:string|null;fullReady?:boolean;};
const ext=(name:string)=>name.split('.').pop()?.toLowerCase()??'';
const video=new Set(['mp4','mov','mkv','webm','m4v']);
const audio=new Set(['mp3','wav','m4a','aac','flac']);
type QuickStyle='cinematic'|'dynamic'|'signature-gold';
type QuickColor='SoftCinematic'|'DetailCinematic';
const DEFAULT_PROMPT='Собери короткий ролик из моих видео; если Vision доступен, выбери выразительные моменты.';
export function checkQuickRenderFiles(files:File[]){
 if(files.length<1||files.length>5)throw Error('Добавь от 1 до 4 видео и при желании один музыкальный файл.');
 const videos=files.filter(f=>video.has(ext(f.name))),music=files.filter(f=>audio.has(ext(f.name)));
 if(videos.length<1||videos.length>4||music.length>1||videos.length+music.length!==files.length)
  throw Error('Нужно 1–4 видео; музыка — не больше одного MP3, WAV, M4A, AAC или FLAC.');
 if(files.some(f=>f.size<1024)||files.reduce((sum,f)=>sum+f.size,0)>500*1024*1024)
  throw Error('Исходники должны быть не пустыми, общим объёмом до 500 МБ.');
 return files.map(file=>({kind:video.has(ext(file.name))?'video' as const:'audio' as const,name:file.name,size:file.size}));
}
const statusLabel=(job:QuickRenderJob)=>job.state==='completed'?'Готов к скачиванию':job.state==='running'?'Создаю ролик…':
 job.state==='uploading'?'Загружаю видео…':'Не удалось собрать ролик';
export default function PersonaQuickAutoRender(){
 const [files,setFiles]=useState<File[]>([]);
 const [prompt,setPrompt]=useState(DEFAULT_PROMPT);
 const [styleChoice,setStyleChoice]=useState<QuickStyle>('cinematic');
 const [colorPreset,setColorPreset]=useState<QuickColor>('SoftCinematic');
 const [autoStyle,setAutoStyle]=useState(true);
 const [fastDraft,setFastDraft]=useState(true);
 const [promotingId,setPromotingId]=useState<string|null>(null);
 const [dragging,setDragging]=useState(false);
 const [submitting,setSubmitting]=useState(false);
 const [serviceError,setServiceError]=useState('');
 const [visionAvailable,setVisionAvailable]=useState<boolean|null>(null);
 const [error,setError]=useState('');
 const [jobs,setJobs]=useState<QuickRenderJob[]>([]);
 const [activeId,setActiveId]=useState<string|null>(null);
 const workerToken=useRef<string|null>(null);
 const busy=useRef(false);
 const mounted=useRef(true);
 const fileRef=useRef<HTMLInputElement>(null);

 async function token(){
  if(workerToken.current)return workerToken.current;
  let reply:Response;
  try{reply=await fetch(personaWorkerUrl+'/health',{signal:AbortSignal.timeout(4500),cache:'no-store'})}
  catch{throw Error('Локальный Media Worker не запущен. Дважды нажми START_AUTO_RENDER.bat на рабочем столе.')}
  const status=await reply.json().catch(()=>({}));
  if(!reply.ok||status.service!=='persona-media-worker'||!status.quickRender||typeof status.token!=='string')
   throw Error('Нужна обновлённая Persona. Закрой окно и снова запусти START_AUTO_RENDER.bat: он проверит обновления.');
  if(mounted.current)setVisionAvailable(Boolean(status.quickRenderConfigured));
  workerToken.current=status.token;
  return status.token as string;
 }
 async function refresh(showFailure=false){
  try{
   const key=await token();
   const response=await fetch(personaWorkerUrl+'/quick-render',{headers:{'X-Persona-Worker-Token':key},cache:'no-store'});
   if(!response.ok)throw Error('Не удалось прочитать список автомонтажей.');
   const result=await response.json();
   if(mounted.current)setJobs(Array.isArray(result.jobs)?result.jobs:[]);
   if(mounted.current)setServiceError('');
  }catch(e){if(showFailure&&mounted.current)setServiceError((e as Error).message)}
 }
 useEffect(()=>{
  mounted.current=true;void refresh(true);
  const interval=window.setInterval(()=>{if(!busy.current)void refresh(false)},2200);
  return()=>{mounted.current=false;window.clearInterval(interval)};
 },[]);
 function accept(selected:File[]){
  try{checkQuickRenderFiles(selected);setFiles(selected);setError('')}
  catch(e){setError((e as Error).message)}
 }
 async function submit(event:React.FormEvent){
  event.preventDefault();if(busy.current)return;
  busy.current=true;setSubmitting(true);setError('');setServiceError('');
  try{
   const selected=checkQuickRenderFiles(files);
   if(prompt.trim().length<3||prompt.length>600)throw Error('Напиши короткую задачу для монтажа (от 3 до 600 символов).');
   const key=await token();
   const headers={'Content-Type':'application/json','X-Persona-Worker-Token':key};
   const response=await fetch(personaWorkerUrl+'/quick-render',{method:'POST',headers,
    body:JSON.stringify({prompt:prompt.trim(),files:selected,consent:true,fastDraft,autoStyle,
     ...(!autoStyle?{styleChoice,colorPreset}:{})})});
   const created=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(created.error||'Не удалось создать проект автомонтажа.');
   const id=created.id as string;setActiveId(id);
   for(const [index,file] of files.entries()){
    const sent=await fetch(personaWorkerUrl+'/quick-render/'+id+'/upload/'+index,{
     method:'PUT',headers:{'X-Persona-Worker-Token':key,'X-Persona-Original-Name':encodeURIComponent(file.name)},
     body:file});
    if(!sent.ok)throw Error((await sent.json().catch(()=>({}))).error||'Ошибка загрузки файла: '+file.name);
   }
   const launched=await fetch(personaWorkerUrl+'/quick-render/'+id+'/run',{method:'POST',
    headers:{'X-Persona-Worker-Token':key}});
   if(!launched.ok)throw Error((await launched.json().catch(()=>({}))).error||'Не удалось запустить монтаж.');
   setFiles([]);setPrompt(DEFAULT_PROMPT);if(fileRef.current)fileRef.current.value='';
   await refresh();
  }catch(e){setError((e as Error).message)}
  finally{busy.current=false;setSubmitting(false)}
 }
 async function renderFull(id:string){
  if(promotingId||busy.current)return;
  setPromotingId(id);setError('');
  try{
   const key=await token();
   const response=await fetch(personaWorkerUrl+'/quick-render/'+id+'/render-full',{
    method:'POST',headers:{'X-Persona-Worker-Token':key}});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||'Полный рендер не запустился');
   await refresh();
  }catch(error){setError((error as Error).message)}
  finally{setPromotingId(null)}
 }
 const visibleJobs=jobs.slice(0,8);
 return <section className="personaQuick" aria-label="Быстрый автомонтаж" data-testid="persona-quick-auto-render">
  <div className="personaQuickHeading">
   <div><small>PERSONA / ONE-CLICK STUDIO</small><h2>Быстрый автомонтаж</h2>
    <p>Загрузи видео, скажи, что хочешь получить, и нажми одну кнопку.</p></div>
   <span className="personaQuickHeadingMark" aria-hidden="true">✦</span>
  </div>
  <form onSubmit={event=>void submit(event)} className="personaQuickForm">
   <div className={'personaQuickDrop'+(dragging?' personaQuickDrop--active':'')}
    role="group" aria-label="Зона загрузки видео и музыки"
    onDragOver={event=>{event.preventDefault();setDragging(true)}}
    onDragLeave={event=>{event.preventDefault();setDragging(false)}}
    onDrop={event=>{event.preventDefault();setDragging(false);accept(Array.from(event.dataTransfer.files))}}>
    <span aria-hidden="true" className="personaQuickDropIcon">↥</span>
    <strong>{files.length?files.length+' файл(ов) для ролика':'Перетащи сюда видео'}</strong>
    <p>{files.length?files.map(file=>file.name).join(' · '):'1–4 видео и, если нужно, один музыкальный файл. До 500 МБ суммарно.'}</p>
    <label htmlFor="persona-quick-files">Выбрать файлы</label>
    <input ref={fileRef} id="persona-quick-files" type="file" multiple
     accept=".mp4,.mov,.mkv,.webm,.m4v,.mp3,.wav,.m4a,.aac,.flac"
     onChange={event=>accept(Array.from(event.target.files??[]))}/>
   </div>
   <label className="personaQuickPrompt" htmlFor="persona-quick-prompt">Пожелание к монтажу (можно не менять)
    <textarea id="persona-quick-prompt" value={prompt} maxLength={600} rows={3}
     onChange={event=>setPrompt(event.target.value)}
     placeholder="Сделай кинематографично: выбери выразительные моменты, добавь предметные перебивки из моих видео и мою музыку."/>
   </label>
   <label className="personaQuickFastDraft" htmlFor="persona-quick-auto-style">
    <input id="persona-quick-auto-style" type="checkbox" checked={autoStyle}
     onChange={event=>setAutoStyle(event.target.checked)}/>
    <span><strong>Автовыбор стиля ИИ</strong>
     <small>Включён по умолчанию · Director Agent изучит 3–5 кадров и подберёт цвет и оформление титров. Без OpenRouter — Soft Cinematic + Cinematic.</small>
    </span>
   </label>
   {!autoStyle&&<div className="personaQuickLooks" role="group" aria-label="Стиль и цвет">
    <label htmlFor="persona-quick-style">Стиль монтажа и титров
     <select id="persona-quick-style" value={styleChoice}
      onChange={event=>setStyleChoice(event.target.value as QuickStyle)}>
      <option value="cinematic">Cinematic</option>
      <option value="dynamic">Dynamic</option>
      <option value="signature-gold">Signature Gold · титры</option>
     </select>
    </label>
    <label htmlFor="persona-quick-color">Цвет видео
     <select id="persona-quick-color" value={colorPreset}
      onChange={event=>setColorPreset(event.target.value as QuickColor)}>
      <option value="SoftCinematic">Soft Cinematic</option>
      <option value="DetailCinematic">Detail Cinematic</option>
     </select>
    </label>
    {styleChoice==='signature-gold'&&<p className="personaQuickLooksHint">Signature Gold оформляет только готовые титры. В офлайн-черновике без Vision титры не создаются.</p>}
   </div>}
   <label className="personaQuickFastDraft" htmlFor="persona-quick-fast-draft">
    <input id="persona-quick-fast-draft" type="checkbox" checked={fastDraft}
     onChange={event=>setFastDraft(event.target.checked)}/>
    <span><strong>Быстрый черновик</strong>
     <small>Включён по умолчанию · до 5 раз меньше кадров Vision · лёгкий MP4 720p. Потом можно сделать 1080p без нового анализа.</small>
    </span>
   </label>
   {visionAvailable===false&&<p role="status" className="personaQuickPrivacy">Vision отключён: ключ OpenRouter не указан. «Сделать всё» создаст локальный MP4-черновик из проверенных фрагментов без автоматического анализа эмоций. Перед публикацией проверьте материал.</p>}
   {visionAvailable===true&&<p className="personaQuickPrivacy" role="status">Vision включён: для монтажа кадры передаются в OpenRouter с интервалом {fastDraft?'2,5':'0,5'} секунды. {autoStyle?'Автовыбор стиля добавляет отдельный запрос с 3–5 кадрами.':'Стиль выбирается вручную без дополнительного запроса.'} {fastDraft?'Распознавание речи в Fast Draft отключено.':'При работающем Whisper распознанная речь может передаваться для анализа.'} Возможна платная тарификация запросов.</p>}
   <details className="personaQuickProcessing"><summary>Как обрабатываются файлы и когда включается Vision</summary>
    <p className="personaQuickPrivacy">Исходные файлы остаются в локальном Worker. {visionAvailable===false?'Без ключа OpenRouter кадры и текст речи не отправляются в облако: выполняется локальный офлайн-монтаж без Vision.':<>При доступном OpenRouter для поиска моментов используются кадры с шагом {fastDraft?'2,5':'0,5'} секунды. {fastDraft?'В быстром черновике распознавание речи пропущено.':'При наличии Whisper текст распознанной речи тоже может отправляться в OpenRouter.'} Полный MP4 и аудиофайл в облако не передаются. Анализ длинного видео может требовать платных запросов.</>} Посторонний B-roll не загружается.</p>
   </details>
   <button type="submit" className="personaQuickGo" disabled={submitting||files.length===0||prompt.trim().length<3}>
    {submitting?'Загружаю файлы…':'Сделать всё'} <span aria-hidden="true">✦</span>
   </button>
  </form>
  {(error||serviceError)&&<p role="alert" className="personaQuickError">{error||serviceError}</p>}
  {visibleJobs.length>0&&<div className="personaQuickResults" aria-label="Мои быстрые проекты">
   <h3>Мои быстрые проекты</h3>
   <div className="personaQuickCards">{visibleJobs.map(job=><article key={job.id} className={'personaQuickCard'+(job.ready?' personaQuickCard--done':'')} data-quick-status={job.state}>
    <div><small>{job.ready?'ГОТОВЫЙ MP4':job.state==='failed'?'НУЖНО ВНИМАНИЕ':'ВИДЕОПРОЕКТ'}</small><h4>{job.title}</h4>
     <p>{statusLabel(job)}</p>
     {job.ready&&job.colorPreset&&<p className="personaQuickCardLooks">Цвет: {job.colorPreset==='DetailCinematic'?'Detail Cinematic':'Soft Cinematic'} · Титры: {job.styleChoice==='dynamic'?'Dynamic Interview':job.styleChoice==='signature-gold'?'Signature Gold':'Cinematic'}</p>}
     {job.ready&&job.autoStyle&&<p className="personaQuickCardLooks">{job.styleDecision?.mode==='ai'?'ИИ определил настроение: '+({dramatic:'драматичное',calm:'спокойное',funny:'весёлое',dynamic:'динамичное',premium:'премиальное'}[job.styleDecision.mood??'']??'неопределённое')+'.':job.styleDecision?.mode==='fallback'?'Автовыбор недоступен — применён проверенный стиль по умолчанию.':'Стиль назначен тестовым Director Agent.'}</p>}
     {job.error&&<p className="personaQuickCardError">{job.error}</p>}
     {job.ready&&Boolean(job.moments?.length)&&<details className="personaQuickMoments"><summary>Показать найденные моменты</summary><ol aria-label="Автоматически найденные моменты">
      {job.moments?.map((moment,index)=><li key={index}>
       <strong>{moment.role==='hook'?'Хук':moment.role==='turn'?'Поворот':moment.role==='finale'?'Финал':'Акцент'}</strong>
       {' · '+moment.sourceName+' · '+moment.peakSec.toFixed(1)+' с'}
       {moment.reason&&<span>{' — '+moment.reason}</span>}
      </li>)}
     </ol></details>}
     {job.notice&&<p>{job.notice}</p>}
     {job.ready&&job.fastDraft&&<p>Черновик 720×1280 готов. Для публикации рекомендуем проверить полноразмерную версию.</p>}
     {job.fullRenderStatus==='RENDERING'&&<p role="status">Создаю 1080×1920 из сохранённого EditPlan; Vision повторно не запускается…</p>}
     {job.fullRenderStatus==='FAILED'&&<p role="alert" className="personaQuickCardError">1080p: {job.fullRenderError}. Черновик доступен.</p>}
     {job.ready&&<p>Техническая проверка пройдена. Проверь актёрскую игру, звук и титры перед публикацией.</p>}
    </div>
    <div className="personaQuickCardActions">
     {job.ready&&workerToken.current&&<a className="personaQuickDownload"
      href={personaWorkerUrl+'/quick-render/'+job.id+'/video?token='+encodeURIComponent(workerToken.current)}
      download={'persona-'+job.id+'-draft.mp4'}>{job.fastDraft?'Скачать черновик 720p':'Скачать готовый MP4'}</a>}
     {job.ready&&job.fastDraft&&!job.fullReady&&<button type="button" className="personaQuickFull"
      disabled={job.fullRenderStatus==='RENDERING'||promotingId===job.id}
      onClick={()=>void renderFull(job.id)}>
      {job.fullRenderStatus==='RENDERING'?'Рендер 1080p…':'Сделать в полном качестве (1080p)'}
     </button>}
     {job.fullReady&&workerToken.current&&<a className="personaQuickDownload"
      href={personaWorkerUrl+'/quick-render/'+job.id+'/video-full?token='+encodeURIComponent(workerToken.current)}
      download={'persona-'+job.id+'-1080p.mp4'}>Скачать MP4 в полном качестве (1080p)</a>}
    </div>
   </article>)}</div>
  </div>}
 </section>;
}
