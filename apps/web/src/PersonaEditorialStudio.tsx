import React,{useEffect,useState} from 'react';
import {
 approveEditorialStep,createEditorialFromTopic,editorialStage,editorialStageLabel,
 proposeTopics,reviseEditorialPost,SEED_CAROUSELS,
 type EditorialPost,type TopicChoice,type EditorialPreset,type EditorialSlide,type PostKind
} from './personaEditorialModel';
import {buildEditorialExport,readEditorialImage,saveEditorialImage,triggerEditorialDownload} from './personaEditorialMedia';
import './persona-editorial-studio.css';

type Props={posts:EditorialPost[];targetId:string|null;onCreate:(post:EditorialPost)=>void;
 onChange:(post:EditorialPost)=>void;onSelect:(id:string)=>void;onClose:()=>void};
const visualLabels:{id:EditorialPreset;name:string}[]=[
 {id:'ink',name:'Ночной графит + золото'},
 {id:'cream',name:'Слоновая кость'},
 {id:'chocolate',name:'Тёмный шоколад'},
 {id:'filmic',name:'Плёночный серый'}
];
const status=(post:EditorialPost)=>editorialStageLabel(post);
const copy=(text:string)=>{void navigator.clipboard?.writeText(text)};
export default function PersonaEditorialStudio({posts,targetId,onCreate,onChange,onSelect,onClose}:Props){
 const post=posts.find(x=>x.id===targetId)??null;
 const [kind,setKind]=useState<PostKind>('carousel');
 const [selectedSlide,setSelectedSlide]=useState(0);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [asset,setAsset]=useState<{name:string;url:string}|null>(null);
 const allTopics=proposeTopics(kind,posts.map(p=>p.title));
 const seedCount=SEED_CAROUSELS.filter(x=>!posts.some(p=>p.id===x.id)).length;
 useEffect(()=>{setSelectedSlide(0);setError('');if(targetId?.startsWith('photo-week-'))setKind('photo')},[targetId]);
 const slide=post?.slides[Math.min(selectedSlide,post.slides.length-1)]??null;
 useEffect(()=>{
  let alive=true,url:string|null=null;
  setAsset(null);
  if(!post||!slide||slide.visual!=='archive-photo')return;
  readEditorialImage(post.id,slide.id).then(record=>{
   if(!alive||!record)return;
   url=URL.createObjectURL(record.blob);setAsset({name:record.name,url});
  }).catch(e=>{if(alive)setError((e as Error).message)});
  return()=>{alive=false;if(url)URL.revokeObjectURL(url)};
 },[post?.id,slide?.id,slide?.visual,post?.revision]);
 function persist(changes:Partial<Pick<EditorialPost,'topic'|'title'|'goal'|'caption'|'preset'|'slides'|'scheduledDate'>>){
  if(!post)return;
  try{onChange(reviseEditorialPost(post,changes));setError('')}
  catch(e){setError((e as Error).message)}
 }
 function modifySlide(changes:Partial<EditorialSlide>){
  if(!post||!slide)return;
  persist({slides:post.slides.map(x=>x.id===slide.id?{...x,...changes}:x)});
 }
 function approve(step:'topic'|'content'|'design'){
  if(!post)return;
  try{onChange(approveEditorialStep(post,step));setError('')}
  catch(e){setError((e as Error).message)}
 }
 function choose(choice:TopicChoice){
  try{
   const id=targetId?.startsWith('photo-week-')&&choice.kind==='photo'
    ?targetId:'editorial-'+choice.kind+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
   const created=createEditorialFromTopic(id,choice);
   if(id.startsWith('photo-week-'))created.scheduledDate=undefined; // reserved calendar slot
   onCreate(created);onSelect(id);setError('');
  }catch(e){setError((e as Error).message)}
 }
 async function upload(file:File|null){
  if(!post||!slide||!file)return;
  setBusy(true);setError('');
  try{
   await saveEditorialImage(post.id,slide.id,file);
   // Changing an asset invalidates visual approval. No external uploads.
   onChange(reviseEditorialPost(post,{preset:post.preset}));
   setAsset(old=>{if(old?.url)URL.revokeObjectURL(old.url);return null});
  }catch(e){setError((e as Error).message)}
  finally{setBusy(false)}
 }
 async function exportZip(){
  if(!post||busy)return;
  setBusy(true);setError('');
  try{
   const zip=await buildEditorialExport(post);
   triggerEditorialDownload(zip,'persona-'+post.id+'.zip');
  }catch(e){setError((e as Error).message)}
  finally{setBusy(false)}
 }
 return <section className="personaEditorialStudio" data-testid="persona-editorial-studio"
  aria-label="Редакция каруселей и фото">
  <header className="personaEditorialHead">
   <div><small>PERSONA / EDITORIAL DESK</small>
    <h2>Редакция: карусели и фото</h2>
    <p>Сначала выбираем тему, затем текст и только после — оформление. Никаких выдуманных съёмок и публикаций.</p>
   </div>
   {post&&<button type="button" className="personaEditorialBack" onClick={onClose}>Все темы ↖</button>}
  </header>
  {!post?<div className="personaEditorialPick" data-testid="editorial-topic-chooser">
   <div className="personaEditorialSplit">
    <div>
     <h3>Темы от Persona</h3>
     <p>Подборка из редакционного банка. Это локальные предложения, а не результат проверенного анализа трендов или ИИ-поиска.</p>
     <div className="personaEditorialSwitch" role="group" aria-label="Формат идей">
      <button type="button" aria-pressed={kind==='carousel'} onClick={()=>setKind('carousel')}>Карусели</button>
      <button type="button" aria-pressed={kind==='photo'} onClick={()=>setKind('photo')}>Фото-посты</button>
     </div>
    </div>
    <div className="personaEditorialMiniStats"><strong>{posts.length}</strong><span>редакционных проектов</span></div>
   </div>
   {targetId?.startsWith('photo-week-')&&<p className="personaEditorialNote">
    Это слот фото-публикации в календаре. Выбери тему, чтобы создать редакционный план для этой даты.
    <button type="button" onClick={()=>setKind('photo')}>Показать идеи фото</button>
   </p>}
   <div className="personaEditorialSuggestions">
    {allTopics.slice(0,8).map(choice=><article key={choice.id}>
     <span>{choice.kind==='photo'?'ФОТО':'КАРУСЕЛЬ'}</span><h4>{choice.title}</h4>
     <p>{choice.angle}</p>
     <button type="button" onClick={()=>choose(choice)}>Выбрать тему <span aria-hidden="true">↗</span></button>
    </article>)}
   </div>
   {allTopics.length===0&&<p>Все предложенные темы уже используются. Можно отредактировать существующий проект.</p>}
   <div className="personaEditorialSaved">
    <h3>Твои редакционные планы</h3>
    <div>{posts.slice().reverse().map(p=><button key={p.id} type="button" onClick={()=>onSelect(p.id)}>
     <strong>{p.title}</strong><small>{p.kind==='carousel'?'Карусель':'Фото'} · {status(p)}</small></button>)}</div>
    {!posts.length&&<p>Пока нет утверждённых тем. Предложения выше — только черновики до твоего выбора.</p>}
   </div>
   {seedCount>0&&<p className="personaEditorialNote">{seedCount} исходных каруселей PHOTO-001…010 можно открыть из календаря. Тексты и ProductionJobs сохраняются.</p>}
  </div>:
  <div className="personaEditorialWorkflow" data-testid="editorial-post-workflow">
   <div className="personaEditorialProjectHead">
    <div><small>{post.id} · {post.kind==='carousel'?'КАРУСЕЛЬ':'ФОТО-ПОСТ'}</small>
     <h3>{post.title}</h3><p>{post.goal}</p></div>
    <span className="personaEditorialState">{status(post)}</span>
   </div>
   {!post.id.startsWith('PHOTO-')&&!post.id.startsWith('photo-week-')&&
    <label className="personaEditorialSchedule">Планируемая дата выпуска (не означает публикацию)
     <input type="date" value={post.scheduledDate??''} onChange={e=>
      persist({scheduledDate:e.target.value||undefined})}/>
    </label>}
   <nav className="personaEditorialSteps" aria-label="Согласование редакционного плана">
    {([['topic','1. Тема'],['content','2. Текст'],['design','3. Оформление'],['production','4. Экспорт']] as const)
      .map(([stage,label])=><span key={stage} data-current={editorialStage(post)===stage?'true':'false'}>
       {label} {stage==='topic'&&post.approvals.topic?'✓':stage==='content'&&post.approvals.content?'✓':stage==='design'&&post.approvals.design?'✓':''}
      </span>)}
   </nav>
   <section aria-label="Шаг 1. Утверждение темы">
    <h4>1. Утверждаем тему</h4>
    <label>Тема<input value={post.topic} maxLength={160} onChange={e=>persist({topic:e.target.value,title:e.target.value})}/></label>
    <label>Редакционная задача<textarea value={post.goal} maxLength={500} onChange={e=>persist({goal:e.target.value})}/></label>
    <p>Что узнает или почувствует зритель? Тема должна быть конкретной. Редакционные идеи — только предложение, факты проверяются автором.</p>
    {!post.approvals.topic?<button className="personaEditorialApprove" type="button" onClick={()=>approve('topic')}>Утвердить тему</button>:
     <span className="personaEditorialApproved">Тема утверждена ✓</span>}
   </section>
   {post.approvals.topic&&<section aria-label="Шаг 2. Текст и подпись">
    <h4>2. Структура и основной текст</h4>
    <p>На слайдах — короткие смысловые фразы. Развёрнутая история располагается <strong>в подписи под каруселью</strong>, а не поверх фотографии.</p>
    <div className="personaEditorialSlides" role="group" aria-label="Выбор слайда">
     {post.slides.map((s,i)=><button key={s.id} type="button" aria-pressed={selectedSlide===i} onClick={()=>setSelectedSlide(i)}>
      Слайд {i+1}</button>)}
    </div>
    <label>{post.kind==='carousel'?'Текст выбранного слайда':'Короткий титр на фото (необязательно)'}
     <textarea value={slide?.text??''} maxLength={170} onChange={e=>modifySlide({text:e.target.value})}/>
    </label>
    {post.kind==='carousel'&&<div className="personaEditorialSlideActions">
     {post.slides.length<7&&<button type="button" onClick={()=>{
      persist({slides:[...post.slides,{id:'slide-'+Date.now(),text:'Новый смысловой поворот',visual:'background',photoDirection:''}]});
      setSelectedSlide(post.slides.length);
     }}>+ Слайд</button>}
     {post.slides.length>3&&<button type="button" onClick={()=>{
      persist({slides:post.slides.filter(x=>x.id!==slide?.id)});setSelectedSlide(Math.max(0,selectedSlide-1));
     }}>Убрать слайд</button>}
    </div>}
    <label>Основной текст публикации (Instagram / VK)
     <textarea className="personaEditorialCaption" value={post.caption} maxLength={4500}
      onChange={e=>persist({caption:e.target.value})} placeholder="Текст, который читатель увидит под каруселью…"/>
    </label>
    <button type="button" className="personaEditorialCopy" onClick={()=>copy(post.caption)}>Скопировать подпись</button>
    {!post.approvals.content?<button type="button" className="personaEditorialApprove"
     onClick={()=>approve('content')} disabled={!post.caption.trim()}>Утвердить тексты и подпись</button>:
     <span className="personaEditorialApproved">Текст утверждён ✓</span>}
   </section>}
   {post.approvals.content&&<section aria-label="Шаг 3. Оформление">
    <h4>3. Выбираем оформление</h4>
    <div className="personaEditorialPresets">
     {visualLabels.map(x=><button key={x.id} type="button" className={'personaEditorialPreset personaEditorialPreset--'+x.id}
      aria-pressed={post.preset===x.id} onClick={()=>persist({preset:x.id})}>{x.name}</button>)}
    </div>
    <p>Каждый слайд отдельно: спокойный фон с типографикой либо реальная фотография из твоего архива. Смешивать можно свободно.</p>
    <div className="personaEditorialSlides">
     {post.slides.map((s,i)=><button key={s.id} type="button" aria-pressed={selectedSlide===i} onClick={()=>setSelectedSlide(i)}>
      {i+1} · {s.visual==='archive-photo'?'Фото':'Фон'}</button>)}
    </div>
    <fieldset className="personaEditorialMediaChoices">
     <legend>Оформление слайда {selectedSlide+1}</legend>
     <label><input type="radio" checked={slide?.visual==='background'} onChange={()=>modifySlide({visual:'background'})}/>Фон + текст</label>
     <label><input type="radio" checked={slide?.visual==='archive-photo'} onChange={()=>modifySlide({visual:'archive-photo'})}/>Фото из архива + текст</label>
    </fieldset>
    {slide?.visual==='archive-photo'&&<div className="personaEditorialFile">
     <label>Фотография из локального архива (JPEG/PNG, до 25 МБ)
      <input type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" onChange={e=>{
       void upload(e.target.files?.[0]??null);e.target.value='';
      }}/>
     </label>
     {asset?<><p>Локально сохранено: {asset.name}</p><img src={asset.url} alt="Выбранное архивное фото" /></>:
      <p>Фото пока не прикреплено. Оформление можно утвердить заранее, но экспорт потребует настоящий файл.</p>}
    </div>}
    <div className={'personaEditorialPreview personaEditorialPreview--'+post.preset}
     role="img" aria-label={'Предпросмотр оформления слайда '+(selectedSlide+1)}>
     {slide?.visual==='archive-photo'&&asset&&<img src={asset.url} alt=""/>}
     <div className="personaEditorialPreviewOverlay">
      <span>СЛАЙД {selectedSlide+1} / {post.slides.length}</span>
      <strong>{slide?.text||'Фото без надписи'}</strong>
      <small>PERSONA · EDITORIAL</small>
     </div>
    </div>
    <p>Предпросмотр показывает композицию. Точный файл 1080×1350 появится в экспорте после утверждения.</p>
    {!post.approvals.design?<button className="personaEditorialApprove" type="button"
     onClick={()=>approve('design')}>Утвердить оформление</button>:
     <span className="personaEditorialApproved">Оформление утверждено ✓</span>}
   </section>}
   {post.approvals.design&&<section aria-label="Шаг 4. Производство и экспорт">
    <h4>4. Производство</h4>
    <p>Тема, подпись и оформление утверждены. Экспорт создаст {post.slides.length} PNG 1080×1350
     {post.kind==='carousel'?' для карусели':' для фото-поста'} и отдельный <code>caption.txt</code> в ZIP.</p>
    <p>Исходные фотографии остаются без изменений. Готовность экспорта не означает публикацию.</p>
    <button className="personaEditorialExport" type="button" disabled={busy} onClick={()=>void exportZip()}>
     {busy?'Собираю ZIP…':'Скачать ZIP с PNG и подписью'}</button>
   </section>}
   {error&&<p className="personaEditorialError" role="alert">{error}</p>}
  </div>}
 </section>;
}
