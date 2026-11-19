import React,{useEffect,useRef,useState} from 'react';
import {personaWorkerUrl} from './personaWorkerUrl';
import {fetchQuickWorkerWithReconnect} from './personaQuickWorkerSession';
import './persona-quick-auto-render.css';

type QuickRenderJob={id:string;title:string;state:'waiting_for_footage'|'uploading'|'running'|'completed'|'failed'|'interrupted';stage:string;
 uploaded:number;expected:number;uploadedIndices?:number[];seedKey?:string|null;goal?:string|null;
 slides?:{text:string;photo?:string}[]|null;productionStatus?:string|null;error:string|null;strategyStatus:'PASS'|'WARNING'|'BLOCKED'|null;ready:boolean;notice:string|null;
 moments?:{sourceName:string;startSec:number;peakSec:number;role:string;emotion:string;reason:string}[];
 styleChoice?:'cinematic'|'dynamic'|'signature-gold'|'auto';colorPreset?:'SoftCinematic'|'DetailCinematic'|null;
 autoStyle?:boolean;styleDecision?:{mode:'ai'|'manual'|'fallback'|'test-injected';mood:string|null;reason:string;provider:string}|null;
 textAccents?:boolean;captionDecision?:{mode:string;reason:string;generatedText?:string|null;wordCount?:number}|null;
 fastDraft?:boolean;fullRenderStatus?:'RENDERING'|'COMPLETED'|'FAILED'|null;
 fullRenderError?:string|null;fullReady?:boolean;
 finalQuality?:{status:'REVIEW_REQUIRED'|'UNAVAILABLE';videoSha256:string;reason?:string;
  warnings?:{id:string;title:string;timecodes:string[]}[];notMeasuredCount?:number;
  reportSha256?:string;contactSheetSha256?:string|null}|null;
 contentType?:'video'|'photo-carousel'|'photo-slideshow';carouselAspect?:'4:5'|'1:1';
 carouselFiles?:{id:string;width:number;height:number;textOverlay:boolean}[];
 exportStatus?:'RENDERING'|'COMPLETED'|'FAILED'|null;exportError?:string|null;
 exportItems?:{id:string;filename:string;kind:string;width?:number;height?:number}[];};
const ext=(name:string)=>name.split('.').pop()?.toLowerCase()??'';
const video=new Set(['mp4','mov','mkv','webm','m4v']);
const audio=new Set(['mp3','wav','m4a','aac','flac']);
const photo=new Set(['jpg','jpeg','png']);
type ContentType='video'|'photo-carousel'|'photo-slideshow';
type QuickStyle='cinematic'|'dynamic'|'signature-gold';
type QuickColor='SoftCinematic'|'DetailCinematic';
const DEFAULT_PROMPT='Собери короткий ролик из моих видео; если Vision доступен, выбери выразительные моменты.';
const moodLabels:Record<string,string>={dramatic:'драматичное',calm:'спокойное',funny:'весёлое',dynamic:'динамичное',premium:'премиальное'};
export function checkQuickRenderFiles(files:File[],contentType:ContentType='video'){
 if(contentType!=='video'){
  if(files.length<1||files.length>13)throw Error('Выберите 1–12 фотографий и, если нужно, музыку для слайд-шоу.');
  const photos=files.filter(f=>photo.has(ext(f.name))),music=files.filter(f=>audio.has(ext(f.name)));
  if(photos.length<1||photos.length>12||(contentType==='photo-slideshow'&&photos.length<2)||
   music.length>(contentType==='photo-slideshow'?1:0)||photos.length+music.length!==files.length)
   throw Error('Нужны JPEG/PNG (1–12 для карусели, 2–12 для слайд-шоу); музыка — только для слайд-шоу.');
  if(files.some(f=>f.size<1024)||files.reduce((n,f)=>n+f.size,0)>500*1024*1024)
   throw Error('Файлы должны быть от 1 КБ, суммарно до 500 МБ.');
  return files.map(file=>({kind:photo.has(ext(file.name))?'photo' as const:'audio' as const,
   name:file.name,size:file.size}));
 }
 if(files.length<1||files.length>5)throw Error('Добавь от 1 до 4 видео и при желании один музыкальный файл.');
 const videos=files.filter(f=>video.has(ext(f.name))),music=files.filter(f=>audio.has(ext(f.name)));
 if(videos.length<1||videos.length>4||music.length>1||videos.length+music.length!==files.length)
  throw Error('Нужно 1–4 видео; музыка — не больше одного MP3, WAV, M4A, AAC или FLAC.');
 if(files.some(f=>f.size<1024)||files.reduce((sum,f)=>sum+f.size,0)>500*1024*1024)
  throw Error('Исходники должны быть не пустыми, общим объёмом до 500 МБ.');
 return files.map(file=>({kind:video.has(ext(file.name))?'video' as const:'audio' as const,name:file.name,size:file.size}));
}
const statusLabel=(job:QuickRenderJob)=>job.state==='waiting_for_footage'?'Проект ожидает фотографии':job.state==='completed'?'Готов к скачиванию':job.state==='running'?'Создаю ролик…':
 job.state==='uploading'?'Загружаю видео…':'Не удалось собрать ролик';
export default function PersonaQuickAutoRender({focusJobId=null,focusRequest=0}:{focusJobId?:string|null;focusRequest?:number}={}){
 const [files,setFiles]=useState<File[]>([]);
 const [contentType,setContentType]=useState<ContentType>('video');
 const [carouselAspect,setCarouselAspect]=useState<'4:5'|'1:1'>('4:5');
 const [coverTitle,setCoverTitle]=useState('');
 const [slideTexts,setSlideTexts]=useState<string[]>([]);
 const [attachingId,setAttachingId]=useState<string|null>(null);
 const [exportingId,setExportingId]=useState<string|null>(null);
 const [exportChoices,setExportChoices]=useState<Record<string,string>>({});
 const [prompt,setPrompt]=useState(DEFAULT_PROMPT);
 const [styleChoice,setStyleChoice]=useState<QuickStyle>('cinematic');
 const [colorPreset,setColorPreset]=useState<QuickColor>('SoftCinematic');
 const [autoStyle,setAutoStyle]=useState(true);
 const [fastDraft,setFastDraft]=useState(true);
 const [textAccents,setTextAccents]=useState(true);
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
 const lastFocusedRequest=useRef<string|null>(null);

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
 // A restarted Worker has a different token; reconnect automatically.
 async function workerFetch(path:string,init:RequestInit={}):Promise<Response>{
  return fetchQuickWorkerWithReconnect(
   personaWorkerUrl+path,init,token,async()=>{workerToken.current=null;return token()});
 }
 async function refresh(){
  try{
   const response=await workerFetch('/quick-render',{cache:'no-store'});
   if(!response.ok)throw Error('Не удалось прочитать список автомонтажей.');
   const result=await response.json();
   if(mounted.current)setJobs(Array.isArray(result.jobs)?result.jobs:[]);
   if(mounted.current)setServiceError('');
  }catch(e){
   // Do not display a stale token or offer broken downloads while disconnected.
   workerToken.current=null;
   if(mounted.current){setVisionAvailable(null);setServiceError((e as Error).message)}
  }
 }
 useEffect(()=>{
  mounted.current=true;void refresh();
  const interval=window.setInterval(()=>{if(!busy.current)void refresh()},2200);
  return()=>{mounted.current=false;window.clearInterval(interval)};
 },[]);
 function accept(selected:File[]){
  try{checkQuickRenderFiles(selected,contentType);setFiles(selected);
   setSlideTexts(selected.filter(x=>photo.has(ext(x.name))).map(()=>''));setError('')}
  catch(e){setError((e as Error).message)}
 }
 async function submit(event:React.FormEvent){
  event.preventDefault();if(busy.current)return;
  busy.current=true;setSubmitting(true);setError('');setServiceError('');
  try{
   const selected=checkQuickRenderFiles(files,contentType);
   const hasIndividualText=contentType==='photo-carousel'&&slideTexts.some(x=>x.trim());
   if(hasIndividualText&&(slideTexts.length!==selected.length||slideTexts.some(x=>!x.trim())))
    throw Error('Чтобы использовать индивидуальные титры, заполни текст каждого слайда.');
   const slides=hasIndividualText?slideTexts.map(text=>({text:text.trim()})):undefined;
   if(prompt.trim().length<3||prompt.length>600)throw Error('Напиши короткую задачу для монтажа (от 3 до 600 символов).');
   const response=await workerFetch('/quick-render',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({prompt:prompt.trim(),files:selected,consent:true,fastDraft,autoStyle,textAccents,
     contentType,carouselAspect,coverTitle,...(slides?{slides}:{}),
     ...(!autoStyle?{styleChoice,colorPreset}:{})})});
   const created=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(created.error||'Не удалось создать проект автомонтажа.');
   const id=created.id as string;setActiveId(id);
   for(const [index,file] of files.entries()){
    const sent=await workerFetch('/quick-render/'+id+'/upload/'+index,{
     method:'PUT',headers:{'X-Persona-Original-Name':encodeURIComponent(file.name)},
     body:file});
    if(!sent.ok)throw Error((await sent.json().catch(()=>({}))).error||'Ошибка загрузки файла: '+file.name);
   }
   const launched=await workerFetch('/quick-render/'+id+'/run',{method:'POST'});
   if(!launched.ok)throw Error((await launched.json().catch(()=>({}))).error||'Не удалось запустить монтаж.');
   setFiles([]);setSlideTexts([]);setPrompt(DEFAULT_PROMPT);if(fileRef.current)fileRef.current.value='';
   await refresh();
  }catch(e){setError((e as Error).message)}
  finally{busy.current=false;setSubmitting(false)}
 }
 async function renderFull(id:string){
  if(promotingId||busy.current)return;
  setPromotingId(id);setError('');
  try{
   const response=await workerFetch('/quick-render/'+id+'/render-full?withPackage=1',{method:'POST'});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||'Полный рендер не запустился');
   await refresh();
  }catch(error){setError((error as Error).message)}
  finally{setPromotingId(null)}
 }
 async function attachToSeed(job:QuickRenderJob,selected:File[]){
  if(busy.current||attachingId)return;
  busy.current=true;setAttachingId(job.id);setError('');
  try{
   const meta=checkQuickRenderFiles(selected,'photo-carousel');
   if(meta.length!==job.slides?.length)
    throw Error('Для '+job.seedKey+' нужно выбрать ровно '+job.slides?.length+' фото в порядке слайдов.');
   const attached=await workerFetch('/quick-render/'+job.id+'/attach-photos',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({files:meta})});
   const manifest=await attached.json().catch(()=>({}));
   if(!attached.ok)throw Error(manifest.error||'Не удалось прикрепить фотографии.');
   const existing=new Set<number>(manifest.uploadedIndices??[]);
   for(const [index,file] of selected.entries()){
    if(existing.has(index))continue;
    const sent=await workerFetch('/quick-render/'+job.id+'/upload/'+index,{
     method:'PUT',headers:{'X-Persona-Original-Name':encodeURIComponent(file.name)},body:file});
    if(!sent.ok)throw Error((await sent.json().catch(()=>({}))).error||'Ошибка фото '+(index+1));
   }
   const run=await workerFetch('/quick-render/'+job.id+'/run',{method:'POST'});
   if(!run.ok)throw Error((await run.json().catch(()=>({}))).error||'Сборка карусели не запустилась.');
   await refresh();
  }catch(error){setError((error as Error).message)}
  finally{busy.current=false;setAttachingId(null)}
 }
 async function preparePackage(id:string){
  if(exportingId||busy.current)return;
  setExportingId(id);setError('');
  try{
   const response=await workerFetch('/quick-render/'+id+'/export-package',{method:'POST'});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||'Не удалось подготовить платформенный пакет');
   await refresh();
  }catch(error){setError((error as Error).message)}
  finally{setExportingId(null)}
 }
 const visibleJobs=jobs.slice(0,10);
 if(focusJobId&&!visibleJobs.some(job=>job.id===focusJobId)){
  const requested=jobs.find(job=>job.id===focusJobId);
  if(requested)visibleJobs.unshift(requested); // Never hide selected project when many jobs exist
 }
 useEffect(()=>{
  if(!focusJobId)return;
  const requestKey=focusJobId+':'+focusRequest;
  if(lastFocusedRequest.current===requestKey)return;
  const card=document.getElementById('persona-quick-project-'+focusJobId);
  if(!card)return; // Retry when the Worker API populates the card
  lastFocusedRequest.current=requestKey;
  card.scrollIntoView({behavior:'smooth',block:'center'});
  card.focus({preventScroll:true});
 },[focusJobId,focusRequest,jobs]);
 return <section className="personaQuick" aria-label="Быстрый автомонтаж" data-testid="persona-quick-auto-render">
  <div className="personaQuickHeading">
   <div><small>PERSONA / ONE-CLICK STUDIO</small><h2>Быстрый автомонтаж</h2>
    <p>Загрузи видео или фотографии, выбери формат, и Persona подготовит контент для соцсетей.</p></div>
   <span className="personaQuickHeadingMark" aria-hidden="true">✦</span>
  </div>
  <form onSubmit={event=>void submit(event)} className="personaQuickForm">
   <fieldset className="personaQuickMode" aria-label="Тип проекта"><legend>Тип проекта</legend>
    {([['video','Видео'],['photo-carousel','Фото-карусель'],['photo-slideshow','Фото-слайдшоу']] as const)
     .map(([value,label])=><label key={value}><input type="radio" name="persona-content-mode"
      value={value} checked={contentType===value}
      onChange={()=>{setContentType(value);setFiles([]);setSlideTexts([]);setError('');if(fileRef.current)fileRef.current.value=''}}/>{label}</label>)}
   </fieldset>
   {contentType==='photo-carousel'&&<fieldset className="personaQuickMode" aria-label="Формат фотографий">
    <legend>Соотношение сторон</legend>
    {(['4:5','1:1'] as const).map(ratio=><label key={ratio}><input type="radio"
     name="persona-carousel-aspect" value={ratio} checked={carouselAspect===ratio}
     onChange={()=>setCarouselAspect(ratio)}/>{ratio}</label>)}
   </fieldset>}
   <div className={'personaQuickDrop'+(dragging?' personaQuickDrop--active':'')}
    role="group" aria-label="Зона загрузки видео, фото и музыки"
    onDragOver={event=>{event.preventDefault();setDragging(true)}}
    onDragLeave={event=>{event.preventDefault();setDragging(false)}}
    onDrop={event=>{event.preventDefault();setDragging(false);accept(Array.from(event.dataTransfer.files))}}>
    <span aria-hidden="true" className="personaQuickDropIcon">↥</span>
    <strong>{files.length?files.length+' файл(ов) для проекта':contentType==='video'?'Перетащи сюда видео':'Перетащи сюда фото'}</strong>
    <p>{files.length?files.map(file=>file.name).join(' · '):contentType==='video'?'1–4 видео и при необходимости музыка. До 500 МБ.':contentType==='photo-carousel'?'1–12 JPEG или PNG. Карусель 4:5 или 1:1.':'2–12 JPEG/PNG и при необходимости музыка. Слайд-шоу 9:16.'}</p>
    <label htmlFor="persona-quick-files">Выбрать файлы</label>
    <input ref={fileRef} id="persona-quick-files" type="file" multiple
     accept={contentType==='video'?".mp4,.mov,.mkv,.webm,.m4v,.mp3,.wav,.m4a,.aac,.flac":contentType==='photo-carousel'?".jpg,.jpeg,.png":".jpg,.jpeg,.png,.mp3,.wav,.m4a,.aac,.flac"}
     onChange={event=>accept(Array.from(event.target.files??[]))}/>
   </div>
   {contentType==='photo-carousel'&&files.length>0&&<fieldset className="personaQuickSlideTexts">
    <legend>Индивидуальные титры (по желанию)</legend>
    <p>Каждой фотографии можно назначить свой золотой титр. Заполни все поля или оставь все пустыми для прежнего режима.</p>
    {files.filter(x=>photo.has(ext(x.name))).map((file,index)=><label key={index} htmlFor={'persona-slide-'+index}>
     <span>{'Слайд '+(index+1)+' · '+file.name}</span>
     <input id={'persona-slide-'+index} value={slideTexts[index]??''}
      placeholder="Короткая фраза для этого кадра"
      onChange={event=>setSlideTexts(old=>old.map((x,i)=>i===index?event.target.value:x))}/>
    </label>)}
   </fieldset>}
   <label className="personaQuickPrompt" htmlFor="persona-quick-prompt">Пожелание к монтажу (можно не менять)
    <textarea id="persona-quick-prompt" value={prompt} maxLength={600} rows={3}
     onChange={event=>setPrompt(event.target.value)}
     placeholder="Сделай кинематографично: выбери выразительные моменты, добавь предметные перебивки из моих видео и мою музыку."/>
   </label>
   <label className="personaQuickPrompt" htmlFor="persona-quick-cover-title">Заголовок обложки или первой фотографии (необязательно)
    <input id="persona-quick-cover-title" value={coverTitle} maxLength={90}
     placeholder="Например: Тишина перед первым аккордом" onChange={event=>setCoverTitle(event.target.value)}/>
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
   <label className="personaQuickFastDraft" htmlFor="persona-quick-text-accents">
    <input id="persona-quick-text-accents" type="checkbox" checked={textAccents}
     onChange={event=>setTextAccents(event.target.checked)}/>
    <span><strong>Добавлять текстовые акценты (ИИ)</strong>
     <small>Включено по умолчанию · если Whisper распознает речь — титры из реальных слов; если подтверждена тишина или очень мало слов — оригинальная фраза ИИ по настроению. Распознавание и наложение титров могут увеличить время черновика.</small>
    </span>
   </label>
   {contentType==='video'&&<label className="personaQuickFastDraft" htmlFor="persona-quick-fast-draft">
    <input id="persona-quick-fast-draft" type="checkbox" checked={fastDraft}
     onChange={event=>setFastDraft(event.target.checked)}/>
    <span><strong>Быстрый черновик</strong>
     <small>Включён по умолчанию · до 5 раз меньше кадров Vision · лёгкий MP4 720p. Потом можно сделать 1080p без нового анализа.</small>
    </span>
   </label>}
   {contentType==='video'&&visionAvailable===false&&<p role="status" className="personaQuickPrivacy">Vision отключён: ключ OpenRouter не указан. «Сделать всё» создаст локальный MP4-черновик без автоматического анализа настроения и без генерации новых цитат. {textAccents?'Если работает локальный Whisper, распознанные слова могут быть наложены как титры.':''} Перед публикацией проверьте материал.</p>}
   {contentType==='video'&&visionAvailable===true&&<p className="personaQuickPrivacy" role="status">Vision включён: для монтажа кадры передаются в OpenRouter с интервалом {fastDraft?'2,5':'0,5'} секунды. {autoStyle?'Автовыбор стиля добавляет отдельный запрос с 3–5 кадрами.':'Стиль выбирается вручную без дополнительного запроса.'} {textAccents?'Для проверки речи используется локальный Whisper; если речи нет, генерация короткой цитаты добавляет ещё один текстовый запрос OpenRouter.':fastDraft?'Распознавание речи в Fast Draft отключено.':'При работающем Whisper распознанная речь может передаваться для анализа.'} Возможна платная тарификация запросов.</p>}
   <details className="personaQuickProcessing"><summary>Как обрабатываются файлы и когда включается Vision</summary>
    <p className="personaQuickPrivacy">Исходные файлы остаются в локальном Worker. {visionAvailable===false?'Без ключа OpenRouter кадры и текст речи не отправляются в облако: выполняется локальный офлайн-монтаж без Vision.':<>При доступном OpenRouter для поиска моментов используются кадры с шагом {fastDraft?'2,5':'0,5'} секунды. {textAccents?'При включённых текстовых акцентах запускается локальный Whisper. Если речи нет или её мало, короткая оригинальная фраза генерируется отдельным платным текстовым запросом. Если Whisper недоступен, отсутствие речи не предполагается.':fastDraft?'В быстром черновике распознавание речи пропущено.':'При наличии Whisper текст распознанной речи тоже может отправляться в OpenRouter.'} Полный MP4 и аудиофайл в облако не передаются. Анализ длинного видео может требовать платных запросов.</>} Посторонний B-roll не загружается.</p>
   </details>
   <button type="submit" className="personaQuickGo" disabled={submitting||files.length===0||prompt.trim().length<3}>
    {submitting?'Загружаю файлы…':'Сделать всё'} <span aria-hidden="true">✦</span>
   </button>
  </form>
  {(error||serviceError)&&<p role="alert" className="personaQuickError">{error||serviceError}</p>}
  {visibleJobs.length>0&&<div className="personaQuickResults" aria-label="Мои быстрые проекты">
   <h3>Мои быстрые проекты</h3>
   <div className="personaQuickCards">{visibleJobs.map(job=><article key={job.id} className={'personaQuickCard'+(job.ready?' personaQuickCard--done':'')+(focusJobId===job.id?' personaQuickCard--calendarFocused':'')} id={'persona-quick-project-'+job.id} tabIndex={-1} data-quick-status={job.state} data-focused-project={focusJobId===job.id?'true':'false'}>
    <div><small>{job.state==='waiting_for_footage'?'ОЖИДАЕТ ФОТО':job.ready?(job.contentType==='photo-carousel'?'ГОТОВАЯ КАРУСЕЛЬ':'ГОТОВЫЙ МЕДИАПРОЕКТ'):job.state==='failed'?'НУЖНО ВНИМАНИЕ':'МЕДИАПРОЕКТ'}</small><h4>{job.title}</h4>
     {job.seedKey&&<p className="personaQuickCardLooks">{job.seedKey} · {job.slides?.length??0} слайда · {job.goal}</p>}
     {job.ready&&<details className="personaQuickMoments">
      <summary>Резервная копия этого проекта (Windows)</summary>
      <p>UUID для локального архивирования: <code>{job.id}</code></p>
      <p>Браузерный ZIP не включает эти исходники и MP4. На компьютере с Media Worker останови рендер и сохрани проверяемую копию на другом диске по <a href="https://github.com/Kizdyan/life-os/blob/main/docs/persona-worker-job-backup.md" target="_blank" rel="noreferrer">инструкции</a>. Копирование пока ручное; повторный монтаж на другом компьютере не гарантирован.</p>
     </details>}
     <p>{statusLabel(job)} · {job.contentType==='photo-carousel'?'Фото-карусель '+(job.carouselAspect??'4:5'):
      job.contentType==='photo-slideshow'?'Фото-слайдшоу':'Видео'}</p>
     {job.ready&&job.colorPreset&&<p className="personaQuickCardLooks">Цвет: {job.colorPreset==='DetailCinematic'?'Detail Cinematic':'Soft Cinematic'} · Титры: {job.styleChoice==='dynamic'?'Dynamic Interview':job.styleChoice==='signature-gold'?'Signature Gold':'Cinematic'}</p>}
     {job.ready&&job.textAccents&&job.captionDecision?.mode==='ai-quote'&&<p className="personaQuickCardLooks">Текстовый акцент ИИ (не речь из видео): «{job.captionDecision.generatedText}»</p>}
     {job.ready&&job.captionDecision?.mode==='per-slide-author'&&<p className="personaQuickCardLooks">Каждый слайд содержит собственный авторский титр Signature Gold</p>}
     {job.ready&&job.textAccents&&job.captionDecision?.mode==='speech'&&<p className="personaQuickCardLooks">Титры по распознанной речи Whisper · проверь точность слов</p>}
     {job.ready&&job.textAccents&&['unverified','quote-unavailable','speech-not-in-cut'].includes(job.captionDecision?.mode??'')&&<p className="personaQuickCardLooks">Текстовые акценты не добавлены: {job.captionDecision?.reason}</p>}
     {job.ready&&job.autoStyle&&<p className="personaQuickCardLooks">{job.styleDecision?.mode==='ai'?'ИИ определил настроение: '+(moodLabels[job.styleDecision.mood??'']??'неопределённое')+'.':job.styleDecision?.mode==='fallback'?'Автовыбор недоступен — применён проверенный стиль по умолчанию.':'Стиль назначен тестовым Director Agent.'}</p>}
     {job.seedKey&&job.slides?.length&&<details className="personaQuickMoments">
      <summary>Тексты и фотографии · {job.slides.length} слайда</summary>
      <ol>{job.slides.map((slide,i)=><li key={i}>
       <strong>{'№'+(i+1)+' · «'+slide.text+'»'}</strong>
       {slide.photo&&<span>{' — '+slide.photo}</span>}
      </li>)}</ol>
     </details>}
     {job.error&&<p className="personaQuickCardError">{job.error}</p>}
     {job.ready&&Boolean(job.moments?.length)&&<details className="personaQuickMoments"><summary>Показать найденные моменты</summary><ol aria-label="Автоматически найденные моменты">
      {job.moments?.map((moment,index)=><li key={index}>
       <strong>{moment.role==='hook'?'Хук':moment.role==='turn'?'Поворот':moment.role==='finale'?'Финал':'Акцент'}</strong>
       {' · '+moment.sourceName+' · '+moment.peakSec.toFixed(1)+' с'}
       {moment.reason&&<span>{' — '+moment.reason}</span>}
      </li>)}
     </ol></details>}
     {job.notice&&<p>{job.notice}</p>}
     {job.ready&&(job.contentType??'video')==='video'&&job.fastDraft&&<p>Черновик 720×1280 готов. Скачай и просмотри его: после просмотра одна кнопка подготовит мастер 1080p и варианты для соцсетей. Проверь итоговые файлы; автоматического утверждения и публикации нет.</p>}
     {job.fullRenderStatus==='RENDERING'&&<p role="status">Создаю 1080×1920 из сохранённого EditPlan без новых запросов ИИ. Затем автоматически подготовлю платформенные версии. Это не утверждение и не публикация.</p>}
      {job.fullReady&&job.exportStatus==='RENDERING'&&<p role="status">1080p готов · собираю версии для соцсетей. Исходники и монтажный план не меняются.</p>}
      {job.fullReady&&job.finalQuality?.status==='UNAVAILABLE'&&<p role="alert" className="personaQuickCardError">
       Video Quality Lab не смог закончить проверку: {job.finalQuality.reason}. Технический отчёт недоступен; необходим самостоятельный просмотр финального MP4.
      </p>}
      {job.fullReady&&job.finalQuality?.status==='REVIEW_REQUIRED'&&<details className="personaQuickMoments" data-testid="persona-final-quality">
       <summary>Video Quality Lab · {job.finalQuality.warnings?.length??0} предупреждений · требуется просмотр</summary>
       <p>Проверены кадры, цветовые сигналы и звук финального файла 1080p. Это измерения, а не оценка актёрской игры, естественности кожи или разрешение на публикацию.</p>
       {(job.finalQuality.notMeasuredCount??0)>0&&<p>Не удалось измерить: {job.finalQuality.notMeasuredCount}. Проверь эти аспекты вручную.</p>}
       {Boolean(job.finalQuality.warnings?.length)&&<ul aria-label="QC-предупреждения">{job.finalQuality.warnings?.map(item=>
        <li key={item.id}>{item.title}{item.timecodes?.length?' · '+item.timecodes.slice(0,4).join(', '):''}</li>)}</ul>}
       {(job.finalQuality.warnings?.length??0)===0&&<p>Автоматических предупреждений нет; художественная приёмка всё равно необходима.</p>}
       {workerToken.current&&<>
        <a className="personaQuickDownload" href={personaWorkerUrl+'/quick-render/'+job.id+'/quality-report?token='+encodeURIComponent(workerToken.current)}>Скачать полный QC-отчёт JSON</a>
        {job.finalQuality.contactSheetSha256&&<a className="personaQuickDownload"
         href={personaWorkerUrl+'/quick-render/'+job.id+'/quality-contact-sheet?token='+encodeURIComponent(workerToken.current)}>
         Скачать контактный лист кадров JPG
        </a>}
       </>}
      </details>}
     {job.fullRenderStatus==='FAILED'&&<p role="alert" className="personaQuickCardError">1080p: {job.fullRenderError}. Черновик доступен.</p>}
     {job.ready&&<p>MP4 создан и прошёл базовую проверку файла. Качество игры, цвета, звука и субтитров требует твоего просмотра перед публикацией.</p>}
    </div>
    <div className="personaQuickCardActions">
     {job.seedKey&&job.state!=='completed'&&job.state!=='running'&&job.state!=='failed'&&
      <label className="personaQuickSeedUpload">
       {attachingId===job.id?'Загружаю фотографии…':'Выбрать фото по порядку (1–'+job.slides?.length+')'}
       <input type="file" multiple accept=".jpg,.jpeg,.png"
        disabled={Boolean(attachingId)||submitting}
        aria-label={'Загрузить фотографии для '+job.seedKey}
        onChange={event=>{const selected=Array.from(event.target.files??[]);
         event.target.value='';if(selected.length)void attachToSeed(job,selected)}}/>
      </label>}
     {job.ready&&job.contentType!=='photo-carousel'&&workerToken.current&&<a className="personaQuickDownload"
      href={personaWorkerUrl+'/quick-render/'+job.id+'/video?token='+encodeURIComponent(workerToken.current)}
      download={'persona-'+job.id+'-draft.mp4'}>{job.fastDraft?'Скачать черновик 720p':'Скачать готовый MP4'}</a>}
     {job.ready&&(job.contentType??'video')==='video'&&job.fastDraft&&!job.fullReady&&<button type="button" className="personaQuickFull"
      disabled={job.fullRenderStatus==='RENDERING'||promotingId===job.id}
      onClick={()=>void renderFull(job.id)}>
      {job.fullRenderStatus==='RENDERING'?'Готовлю 1080p + пакет…':job.fullRenderStatus==='FAILED'?'Повторить 1080p + пакет':'После просмотра черновика: 1080p + пакет для соцсетей'}
     </button>}
     {job.fullReady&&workerToken.current&&<a className="personaQuickDownload"
      href={personaWorkerUrl+'/quick-render/'+job.id+'/video-full?token='+encodeURIComponent(workerToken.current)}
      download={'persona-'+job.id+'-1080p.mp4'}>Скачать MP4 в полном качестве (1080p)</a>}
     {job.ready&&job.exportStatus!=='COMPLETED'&&job.contentType!=='photo-carousel'&&
      ((job.contentType==='photo-slideshow')||!job.fastDraft||job.fullReady)&&
      <button type="button" className="personaQuickFull" onClick={()=>void preparePackage(job.id)}
       disabled={job.exportStatus==='RENDERING'||exportingId===job.id}>
       {job.exportStatus==='RENDERING'?'Готовлю платформенные версии…':'Подготовить пакет для соцсетей'}
      </button>}
     {job.exportStatus==='FAILED'&&<p role="alert" className="personaQuickCardError">{job.exportError}</p>}
     {job.exportStatus==='COMPLETED'&&job.exportItems?.length&&workerToken.current&&<>
      <label>Платформа
       <select aria-label="Скачать для платформы" value={exportChoices[job.id]||
        (job.contentType==='photo-carousel'?'carousel':'instagram')}
        onChange={event=>setExportChoices(prev=>({...prev,[job.id]:event.target.value}))}>
        {job.exportItems.map(entry=><option key={entry.id} value={entry.id}>
         {entry.id==='carousel'?'Скачать фото-карусель ZIP':
          entry.id==='instagram'?'Скачать для Instagram':
          entry.id==='tiktok'?'Скачать для TikTok':
          entry.id==='youtube'?'Скачать для YouTube Shorts':
          entry.id==='vk'?'Скачать для VK Видео (9:16)':
          entry.id==='vk-4x5'?'Скачать для VK Видео (4:5)':
          entry.id==='cover'?'Скачать обложку':
          'Скачать '+entry.id}</option>)}
       </select>
      </label>
      <a className="personaQuickDownload"
       href={personaWorkerUrl+'/quick-render/'+job.id+'/export/'+
        encodeURIComponent(exportChoices[job.id]||(job.contentType==='photo-carousel'?'carousel':'instagram'))+
        '?token='+encodeURIComponent(workerToken.current)}>Скачать выбранное</a>
     </>}
    </div>
   </article>)}</div>
  </div>}
 </section>;
}
