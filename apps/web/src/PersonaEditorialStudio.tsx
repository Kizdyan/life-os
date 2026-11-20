import React,{useEffect,useState} from 'react';
import {
 approveEditorialStep,createEditorialFromTopic,editorialStage,editorialStageLabel,
 proposeTopics,reviseEditorialPost,SEED_CAROUSELS,createBaselinePauseCarousel,
 CAROUSEL_BASELINE_ID,CAROUSEL_002_ID,CAROUSEL_003_ID,CAROUSEL_004_ID,
 createDirectorQuestionCarousel,createPhotoArchiveCarousel,createMixedNarrativeCarousel,
 editorialArchiveProvenancePass,applyChatCarouselApproval,publicationDesignApproved,
 editorialChecklistState,editorialChecklistReady,editorialSourcesPass,setEditorialSourceReviewed,
 setEditorialChecklistItem,editorialContrastPass,
 type EditorialPost,type TopicChoice,type EditorialPreset,type EditorialSlide,type PostKind
} from './personaEditorialModel';
import {buildEditorialExport,readEditorialImage,readEditorialImageByRef,saveEditorialImage,listEditorialImages,verifyEditorialArchivePhotos,triggerEditorialDownload,renderEditorialSlide} from './personaEditorialMedia';
import {
 PUBLICATION_CAROUSEL_IDS,publicationCarouselDraft,publicationCarouselApproved,
 buildSinglePublicationZip,buildAllPublicationZip,publicationFilename,
 UNAPPROVED_PUBLICATION_MESSAGE,UNAPPROVED_DESIGN_MESSAGE,type PublicationCarouselId
} from './personaEditorialPublish';
import {importResearchCarousel,RESEARCH_CAROUSEL_EXAMPLE,RESEARCH_PROMPT} from './personaResearchCarousel';
import './persona-editorial-studio.css';

type Props={posts:EditorialPost[];targetId:string|null;onCreate:(post:EditorialPost)=>void;
 onChange:(post:EditorialPost)=>void;onSelect:(id:string)=>void;onClose:()=>void};
const visualLabels:{id:EditorialPreset;name:string}[]=[
 {id:'ink',name:'Ночной графит + золото'},
 {id:'cream',name:'Слоновая кость'},
 {id:'chocolate',name:'Тёмный шоколад'},
 {id:'filmic',name:'Плёночный серый'},
 {id:'chocolate-graphite',name:'Шоколад / графит'}
];
const status=(post:EditorialPost)=>editorialStageLabel(post);
const CHECKLIST_TEXT=[
 'Каждый слайд читается за ≤4 секунды на телефоне при 1080×1350.',
 'Первый слайд создаёт вопрос или напряжение, а не резюмирует тему.',
 'Каждый следующий слайд добавляет одну новую мысль; нет двух слайдов с одинаковым смыслом.',
 'Последний слайд завершается мыслью, а не клише «а вы как думаете?».',
 'В подписи есть минимум одна мысль, которой нет ни на одном слайде.',
 'Каждое изображение прослеживается до архива (или карусель text-only и это явно указано).',
 'Контраст текста к фону ≥ 4.5:1 для основного текста и ≥ 3:1 для крупных заголовков. Проверяется автоматически.'
];
const copy=(text:string)=>{void navigator.clipboard?.writeText(text)};

/** Baseline cover uses the EXACT exported Canvas PNG, not a CSS approximation. */
function EditorialPublishCover({post}: {post:EditorialPost}){
 const first=post.slides[0];
 const [url,setUrl]=useState<string|null>(null);
 useEffect(()=>{
  let alive=true,objectUrl:string|null=null;
  setUrl(null);
  if(post.id===CAROUSEL_BASELINE_ID&&post.fontPreset==='playfair-inter'){
   void renderEditorialSlide(post,first,0).then(blob=>{
    if(!alive)return;
    objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);
   }).catch(()=>{if(alive)setUrl(null)});
   return()=>{alive=false;if(objectUrl)URL.revokeObjectURL(objectUrl)};
  }
  if(first?.visual!=='archive-photo')return;
  (first.photoRef?readEditorialImageByRef(first.photoRef):readEditorialImage(post.id,first.id))
   .then(record=>{if(!alive||!record)return;
    objectUrl=URL.createObjectURL(record.blob);setUrl(objectUrl);
   }).catch(()=>{if(alive)setUrl(null)});
  return()=>{alive=false;if(objectUrl)URL.revokeObjectURL(objectUrl)};
 },[post.id,post.revision,first?.id,first?.visual,first?.photoRef]);
 const exact=post.id===CAROUSEL_BASELINE_ID&&post.fontPreset==='playfair-inter';
 return <div className={'personaEditorialPublishCover'+(exact?' personaEditorialPublishCover--exact':'')}
  role="img" aria-label={'Первый слайд: '+post.slides[0].text}>
  {url&&<img data-testid={exact?'baseline-exact-cover':undefined} src={url} alt=""/>}
  {!exact&&<strong>{post.slides[0].text}</strong>}
 </div>;
}

export default function PersonaEditorialStudio({posts,targetId,onCreate,onChange,onSelect,onClose}:Props){
 const post=posts.find(x=>x.id===targetId)??null;
 const [kind,setKind]=useState<PostKind>('carousel');
 const [researchJson,setResearchJson]=useState('');
 const [selectedSlide,setSelectedSlide]=useState(0);
 const [baselinePreviewUrl,setBaselinePreviewUrl]=useState<string|null>(null);
 const [baselinePreviewError,setBaselinePreviewError]=useState('');
 const [busy,setBusy]=useState(false);
 const [showPublish,setShowPublish]=useState(false);
 const [publishError,setPublishError]=useState('');
 const [error,setError]=useState('');
 const [asset,setAsset]=useState<{name:string;url:string}|null>(null);
 const [archiveChoices,setArchiveChoices]=useState<{key:string;name:string;url:string}[]>([]);
 const [archiveLoading,setArchiveLoading]=useState(false);
 const [archiveError,setArchiveError]=useState('');
 const [archiveRefresh,setArchiveRefresh]=useState(0);
 const allTopics=proposeTopics(kind,posts.map(p=>p.title));
 const publishRows=PUBLICATION_CAROUSEL_IDS.map(id=>
  posts.find(p=>p.id===id)??applyChatCarouselApproval(publicationCarouselDraft(id)));
 const seedCount=SEED_CAROUSELS.filter(x=>!posts.some(p=>p.id===x.id)).length;
 const checklist=post?.kind==='carousel'?editorialChecklistState(post):[];
 const archiveFixture=Boolean(post?.carouselFormat);
 const sourcePass=post?editorialSourcesPass(post):false;
 const exactCanvasPreview=Boolean(post?.research||(post?.id===CAROUSEL_BASELINE_ID&&post.fontPreset==='playfair-inter'));
 const archiveRefsReady=post===null||!post.carouselFormat||!post.slides.some(s=>s.visual==='archive-photo')||
  (!archiveLoading&&!archiveError&&editorialArchiveProvenancePass(post,
   archiveChoices.map(x=>x.key)));
 const checklistReady=post?.kind==='carousel'?editorialChecklistReady(post)&&archiveRefsReady:true;
 const photoSequence=post?.slides.map((s,i)=>({s,i})).filter(x=>x.s.visual==='archive-photo'&&x.s.photoRef)??[];
 const selectedPhotoPosition=photoSequence.findIndex(x=>x.i===selectedSlide);
 useEffect(()=>{setSelectedSlide(0);setError('');if(targetId?.startsWith('photo-week-'))setKind('photo')},[targetId]);
 const slide=post?.slides[Math.min(selectedSlide,post.slides.length-1)]??null;
 useEffect(()=>{
  let alive=true;let previewUrl:string|null=null;
  setBaselinePreviewUrl(null);setBaselinePreviewError('');
  if(!post||!slide||!exactCanvasPreview)return;
  void renderEditorialSlide(post,slide,selectedSlide).then(blob=>{
   if(!alive)return;
   previewUrl=URL.createObjectURL(blob);setBaselinePreviewUrl(previewUrl);
  }).catch(e=>{if(alive)setBaselinePreviewError((e as Error).message)});
  return()=>{alive=false;if(previewUrl)URL.revokeObjectURL(previewUrl)};
 },[post?.id,post?.revision,slide?.id,slide?.text,selectedSlide,post?.fontPreset,post?.preset,exactCanvasPreview]);
 useEffect(()=>{
  let alive=true,url:string|null=null;
  setAsset(null);
  if(!post||!slide||slide.visual!=='archive-photo')return;
  (slide.photoRef?readEditorialImageByRef(slide.photoRef):readEditorialImage(post.id,slide.id)).then(record=>{
   if(!alive||!record)return;
   url=URL.createObjectURL(record.blob);setAsset({name:record.name,url});
  }).catch(e=>{if(alive)setError((e as Error).message)});
  return()=>{alive=false;if(url)URL.revokeObjectURL(url)};
 },[post?.id,slide?.id,slide?.visual,slide?.photoRef,post?.revision]);
 useEffect(()=>{
  if(!post?.carouselFormat){setArchiveChoices([]);setArchiveError('');return}
  let alive=true;const urls:string[]=[];
  setArchiveLoading(true);setArchiveError('');
  listEditorialImages().then(images=>{
   if(!alive)return;
   const options=images.filter(img=>img.blob instanceof Blob&&img.blob.size===img.bytes&&
    ['image/jpeg','image/png'].includes(img.mime)).map(img=>{
     const url=URL.createObjectURL(img.blob);urls.push(url);
     return {key:img.key,name:img.name,url};
    });
   setArchiveChoices(options);setArchiveLoading(false);
  }).catch(e=>{if(alive){setArchiveLoading(false);setArchiveChoices([]);setArchiveError((e as Error).message)}});
  return()=>{alive=false;urls.forEach(url=>URL.revokeObjectURL(url))};
 },[post?.id,post?.carouselFormat,archiveRefresh]);
 function persist(changes:Partial<Pick<EditorialPost,'topic'|'title'|'goal'|'caption'|'preset'|'slides'|'scheduledDate'>>){
  if(!post)return;
  try{onChange(reviseEditorialPost(post,changes));setError('')}
  catch(e){setError((e as Error).message)}
 }
 function modifySlide(changes:Partial<EditorialSlide>){
  if(!post||!slide)return;
  persist({slides:post.slides.map(x=>x.id===slide.id?{...x,...changes}:x)});
 }
 async function approve(step:'topic'|'content'|'design'){
  if(!post)return;
  try{
   if(step==='design'&&post.carouselFormat&&!(await verifyEditorialArchivePhotos(post)))
    throw Error('Пункт 6: выбранные фотографии не подтверждены архивом IndexedDB');
   onChange(approveEditorialStep(post,step));setError('');
  }catch(e){setError((e as Error).message)}
 }
 function setChecklist(index:number,checked:boolean){
  if(!post)return;
  try{onChange(setEditorialChecklistItem(post,index,checked));setError('')}
  catch(e){setError((e as Error).message)}
 }
 function importResearch(){
  try{
   const id='editorial-research-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
   const created=importResearchCarousel(id,researchJson);
   onCreate(created);onSelect(id);setError('');setResearchJson('');
  }catch(e){setError('Импорт не выполнен: '+(e as Error).message)}
 }
 function reviewSource(slideId:string,url:string,reviewed:boolean){
  if(!post)return;
  try{onChange(setEditorialSourceReviewed(post,slideId,url,reviewed));setError('')}
  catch(e){setError((e as Error).message)}
 }
 function openBaseline(){
  try{
   if(!posts.some(p=>p.id===CAROUSEL_BASELINE_ID))onCreate(createBaselinePauseCarousel());
   onSelect(CAROUSEL_BASELINE_ID);setError('');
  }catch(e){setError((e as Error).message)}
 }
 function openDirectorQuestionCarousel(){
  try{
   if(!posts.some(p=>p.id===CAROUSEL_002_ID))onCreate(createDirectorQuestionCarousel());
   onSelect(CAROUSEL_002_ID);setError('');
  }catch(e){setError((e as Error).message)}
 }
 function openArchiveCarousel(id:string){
  try{
   if(id===CAROUSEL_003_ID){
    if(!posts.some(p=>p.id===id))onCreate(createPhotoArchiveCarousel());
   }else if(id===CAROUSEL_004_ID){
    if(!posts.some(p=>p.id===id))onCreate(createMixedNarrativeCarousel());
   }else throw Error('Неизвестная карусель');
   onSelect(id);setError('');
  }catch(e){setError((e as Error).message)}
 }
 function chooseArchivePhoto(photoRef:string){
  if(!post||!slide||!post.carouselFormat)return;
  if(post.carouselFormat==='mixed'&&selectedSlide%2===1)return;
  modifySlide({visual:'archive-photo',photoRef});
 }
 function clearArchivePhoto(){
  if(!post||!slide||!post.carouselFormat)return;
  modifySlide({visual:'background',photoRef:undefined});
 }
 function moveArchivePhoto(delta:-1|1){
  if(!post||selectedPhotoPosition<0)return;
  const next=photoSequence[selectedPhotoPosition+delta];
  if(!next)return;
  const slides=post.slides.map(s=>({...s}));
  const current=slides[selectedSlide],other=slides[next.i];
  const oldRef=current.photoRef;current.photoRef=other.photoRef;other.photoRef=oldRef;
  persist({slides});setSelectedSlide(next.i);
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

 function approvePublicationVisual(id:PublicationCarouselId){
  const target=publishRows.find(p=>p.id===id);
  if(!target)return;
  if(!target.approvals.content||!target.approvals.textApproved){setPublishError('Сначала утвердите текст');return}
  if(!editorialChecklistReady(target)){setPublishError('Требуется чек-лист');return}
  try{
   const signed=approveEditorialStep(target,'design');
   if(!posts.some(p=>p.id===id))onCreate(target);
   onChange(signed);setPublishError('');
  }catch(e){setPublishError((e as Error).message)}
 }
 function openPublicationApproval(id:PublicationCarouselId){
  try{
   if(!posts.some(p=>p.id===id))onCreate(applyChatCarouselApproval(publicationCarouselDraft(id)));
   setPublishError('');onSelect(id);
  }catch(e){setPublishError((e as Error).message)}
 }
 async function downloadPublication(id:PublicationCarouselId|null){
  if(busy)return;
  const targets=id?publishRows.filter(p=>p.id===id):publishRows;
  if(targets.length!==(id?1:4)||targets.some(p=>!publicationCarouselApproved(p))){
   setPublishError(targets.some(p=>p.approvals.textApproved&&p.approvals.designApproved===false)?
    UNAPPROVED_DESIGN_MESSAGE:UNAPPROVED_PUBLICATION_MESSAGE);return;
  }
  setPublishError('');setBusy(true);
  try{
   const zip=id?await buildSinglePublicationZip(targets[0]):
    await buildAllPublicationZip(targets);
   triggerEditorialDownload(zip,publicationFilename(id));
  }catch(e){setPublishError((e as Error).message)}
  finally{setBusy(false)}
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
   {post&&<div className="personaEditorialPublishHeadActions">
    <button type="button" className="personaEditorialBack" onClick={()=>{setShowPublish(true);onClose()}}>Пакет для публикации</button>
    <button type="button" className="personaEditorialBack" onClick={onClose}>Все темы ↖</button>
   </div>}
  </header>
  {!post&&showPublish?<div className="personaEditorialPublish" data-testid="editorial-publication-package">
   <div className="personaEditorialPublishIntro">
    <div><h3>Пакет для публикации</h3>
     <p>Здесь четыре готовых сценария каруселей. Скачивание доступно только после твоего утверждения темы, текста и оформления. Instagram ничего не публикует автоматически.</p>
    </div>
    <button type="button" onClick={()=>{setShowPublish(false);setPublishError('')}}>← К темам</button>
   </div>
   <div className="personaEditorialPublishList">
    {publishRows.map(entry=><article key={entry.id} data-publish-carousel-id={entry.id}>
     <EditorialPublishCover post={entry}/>
     <div className="personaEditorialPublishDetails">
      <h4>{entry.title}</h4>
      <span className="personaEditorialPublishStatus" data-approved={publicationCarouselApproved(entry)?'true':'false'}>
       {publicationCarouselApproved(entry)?'Утверждена':entry.approvals.textApproved?
        'Текст утверждён · оформление ожидает просмотра':'Черновик'}</span>
      <p>6 слайдов · {entry.carouselFormat?(entry.slides.some(s=>s.visual==='archive-photo')?
       'фото из архива':'текстовый вариант без фото'):'текстовая карусель'}</p>
      <div className="personaEditorialPublishActions">
       {!publicationCarouselApproved(entry)&&<button type="button"
        onClick={()=>openPublicationApproval(entry.id as PublicationCarouselId)}>Утвердить</button>}
       {entry.approvals.textApproved&&!publicationDesignApproved(entry)&&<button type="button"
        onClick={()=>approvePublicationVisual(entry.id as PublicationCarouselId)}>Утвердить оформление</button>}
       {publicationCarouselApproved(entry)&&<button type="button"
        onClick={()=>openPublicationApproval(entry.id as PublicationCarouselId)}>Редактировать</button>}
       <button type="button" disabled={busy||!publicationCarouselApproved(entry)}
        onClick={()=>void downloadPublication(entry.id as PublicationCarouselId)}>Скачать пакет</button>
       {!publicationCarouselApproved(entry)&&entry.approvals.textApproved&&
         <p role="status">{UNAPPROVED_DESIGN_MESSAGE}</p>}
      </div>
     </div>
    </article>)}
   </div>
   <button type="button" className="personaEditorialExport"
    disabled={busy||publishRows.some(p=>!publicationCarouselApproved(p))}
    onClick={()=>void downloadPublication(null)}>
    {busy?'Собираю архив…':'Скачать все четыре одним архивом'}
   </button>
   {publishError&&<p role="alert" className="personaEditorialError">{publishError}</p>}
  </div>:!post?<div className="personaEditorialPick" data-testid="editorial-topic-chooser">
   <p className="personaEditorialNote">Четыре карусели можно собрать в один архив для ручной публикации.
    <button type="button" data-testid="open-publication-package" onClick={()=>{setShowPublish(true);setPublishError('')}}>Пакет для публикации</button>
   </p>
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
   <details className="personaEditorialNote" data-testid="editorial-research-import">
    <summary><strong>Создать карусель из исследования</strong> · Perplexity / проверяемый JSON</summary>
    <p>Новый проект в существующей редакции Persona. Источники будут помечены как непроверенные:
     одних ссылок недостаточно для публикации. Встроенного автоматического поиска на этом этапе нет.</p>
    <button type="button" onClick={()=>copy(RESEARCH_PROMPT)}>Скопировать исследовательский промпт</button>
    <button type="button" onClick={()=>copy(JSON.stringify(RESEARCH_CAROUSEL_EXAMPLE,null,2))}>Скопировать пример JSON</button>
    <label>JSON исследования с фактами, слайдами и ссылками
     <textarea rows={9} value={researchJson} onChange={e=>setResearchJson(e.target.value)}
      placeholder="Вставь JSON, полученный после исследования. Для каждого фактического слайда нужен источник, для авторского вывода — interpretation: true."/>
    </label>
    <button type="button" disabled={!researchJson.trim()} onClick={importResearch}>Импортировать как черновик</button>
   </details>
   {targetId?.startsWith('photo-week-')&&<p className="personaEditorialNote">
    Это слот фото-публикации в календаре. Выбери тему, чтобы создать редакционный план для этой даты.
    <button type="button" onClick={()=>setKind('photo')}>Показать идеи фото</button>
   </p>}
   <p className="personaEditorialNote">Первая реальная карусель: «Почему пауза сильнее реплики» · text-only · 6 слайдов.
    <button type="button" data-testid="open-carousel-baseline" onClick={openBaseline}>
     {posts.some(p=>p.id===CAROUSEL_BASELINE_ID)?'Открыть baseline':'Создать baseline-карусель'}
    </button>
   </p>
   <p className="personaEditorialNote">Карусель №2: «Зачем режиссёру оставлять зрителя без ответа» · text-only · 6 слайдов · исследовательские источники.
    <button type="button" data-testid="open-carousel-002" onClick={openDirectorQuestionCarousel}>
     {posts.some(p=>p.id===CAROUSEL_002_ID)?'Открыть карусель №2':'Создать карусель №2'}
    </button>
   </p>
   <p className="personaEditorialNote">Карусель №3: «Один стул — три совершенно разных персонажа» · 6 слайдов · фото из архива или текстовый fallback.
    <button type="button" data-testid="open-carousel-003" onClick={()=>openArchiveCarousel(CAROUSEL_003_ID)}>
     {posts.some(p=>p.id===CAROUSEL_003_ID)?'Открыть карусель №3':'Создать карусель №3'}
    </button>
   </p>
   <p className="personaEditorialNote">Карусель №4: «Что происходит с героем до первой реплики» · 6 слайдов · фото / текст / фото / текст / фото / текст.
    <button type="button" data-testid="open-carousel-004" onClick={()=>openArchiveCarousel(CAROUSEL_004_ID)}>
     {posts.some(p=>p.id===CAROUSEL_004_ID)?'Открыть карусель №4':'Создать карусель №4'}
    </button>
   </p>
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
    {!post.approvals.topic?<button className="personaEditorialApprove" type="button" onClick={()=>void approve('topic')}>Утвердить тему</button>:
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
     <textarea value={slide?.text??''} maxLength={post.research?260:170} onChange={e=>modifySlide({text:e.target.value})}/>
    </label>
    {post.research&&<section className="personaEditorialResearchReview" data-testid="editorial-source-review">
     <h4>Источники и проверка фактов</h4>
     <p>Открой ссылки, сопоставь каждый факт с оригиналом и отметь только действительно подтверждённые.
      Галочки — ручная редакторская проверка, не автоматический аудит. Если изменишь текст, проверку потребуется повторить.</p>
     <p role="status"><strong>Источник: {sourcePass?'SOURCE_PASS · проверено автором':'UNVERIFIED · утверждение текста заблокировано'}</strong></p>
     {post.slides.map((s,i)=>{
      const sources=post.research!.sourceItems.filter(x=>x.slideId===s.id);
      return <div key={s.id} className="personaEditorialResearchSlide">
       <strong>Слайд {i+1}: {s.text.slice(0,85)}</strong>
       {!sources.length&&<p>{post.research!.interpretationSlides.includes(s.id)?
        'Авторская интерпретация: на слайде не должно быть непроверенных фактов.' :
        'Нет источника: требуется исправить исследование.'}</p>}
       {sources.map(source=><div key={source.url}>
        <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} · источник</a>
        <label><input type="checkbox" checked={source.reviewed}
         onChange={e=>reviewSource(s.id,source.url,e.target.checked)}/>
         Проверено по оригиналу</label>
       </div>)}
      </div>;
     })}
    </section>}
    {post.kind==='carousel'&&!post.research&&<div className="personaEditorialSlideActions">
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
     onClick={()=>void approve('content')} disabled={!post.caption.trim()||!sourcePass}>Утвердить тексты и подпись</button>:
     <span className="personaEditorialApproved">Текст утверждён ✓</span>}
   </section>}
   {post.approvals.content&&<section aria-label="Шаг 3. Оформление">
    <h4>3. Выбираем оформление</h4>
    <div className="personaEditorialPresets">
     {visualLabels.map(x=><button key={x.id} type="button" className={'personaEditorialPreset personaEditorialPreset--'+x.id}
      aria-pressed={post.preset===x.id} onClick={()=>persist({preset:x.id})}>{x.name}</button>)}
    </div>
    <p>Каждый слайд отдельно: спокойный фон с типографикой либо реальная фотография из твоего архива. Смешивать можно свободно.</p>
    {post.research&&slide?.photoDirection&&<p className="personaEditorialNote"><strong>Замысел визуала:</strong> {slide.photoDirection}</p>}
    <div className="personaEditorialSlides">
     {post.slides.map((s,i)=><button key={s.id} type="button" aria-pressed={selectedSlide===i} onClick={()=>setSelectedSlide(i)}>
      {i+1} · {s.visual==='archive-photo'?'Фото':'Фон'}</button>)}
    </div>
    <fieldset className="personaEditorialMediaChoices">
     <legend>Оформление слайда {selectedSlide+1}</legend>
     <label><input type="radio" checked={slide?.visual==='background'} onChange={()=>post.carouselFormat?clearArchivePhoto():modifySlide({visual:'background'})}/>Фон + текст</label>
     <label><input type="radio" checked={slide?.visual==='archive-photo'}
      disabled={Boolean(post.carouselFormat)} onChange={()=>modifySlide({visual:'archive-photo'})}/>Фото из архива + текст</label>
    </fieldset>
    {archiveFixture&&<section className="personaEditorialArchivePicker" data-testid="editorial-archive-picker"
     aria-label="Выбор фотографий из архива IndexedDB">
     <div className="personaEditorialArchiveHead"><strong>Фотографии из архива Persona</strong>
      <button type="button" onClick={()=>setArchiveRefresh(n=>n+1)}>Обновить архив</button></div>
     <p>Выбирай фотографии для слайдов. Их оригиналы остаются в IndexedDB; в плане сохраняется лишь ключ и порядок. Для смешанной карусели фото ставятся на слайды 1, 3 и 5.</p>
     {archiveLoading&&<p role="status">Читаю архив фотографий…</p>}
     {archiveError&&<p role="alert">{archiveError}. Можно сохранить текстовый вариант.</p>}
     {!archiveLoading&&!archiveError&&archiveChoices.length===0&&<p data-testid="editorial-archive-empty">В архиве нет фотографий. Добавьте фотографии в архив Persona, чтобы использовать их в карусели</p>}
     {post.carouselFormat==='mixed'&&selectedSlide%2===1&&<p>Это текстовый слайд. Для фотографии выбери слайд 1, 3 или 5.</p>}
     <div className="personaEditorialArchiveGrid">
      {archiveChoices.map(item=><button type="button" key={item.key} data-archive-key={item.key}
       disabled={post.carouselFormat==='mixed'&&selectedSlide%2===1}
       aria-label={'Выбрать фото '+item.name+' ('+item.key+')'}
       aria-pressed={slide?.photoRef===item.key} onClick={()=>chooseArchivePhoto(item.key)}>
       <img src={item.url} alt={item.name}/><strong>{item.name}</strong><small>{item.key}</small>
      </button>)}
     </div>
     {slide?.photoRef&&<p data-testid="editorial-selected-photo">Выбрано: {archiveChoices.find(x=>x.key===slide.photoRef)?.name??'Не найдено в текущем архиве'} · {slide.photoRef}</p>}
     {slide?.visual==='archive-photo'&&<button type="button" onClick={clearArchivePhoto}>Заменить фото текстовым фоном</button>}
     {photoSequence.length>1&&<div className="personaEditorialArchiveOrder">
      <strong>Порядок выбранных фотографий</strong>
      {photoSequence.map(({s,i},order)=><div key={s.id}>
       <button type="button" onClick={()=>setSelectedSlide(i)} aria-pressed={selectedSlide===i}>
        {order+1}. Слайд {i+1} · {archiveChoices.find(x=>x.key===s.photoRef)?.name??s.photoRef}
       </button>
      </div>)}
      <button type="button" disabled={selectedPhotoPosition<=0} aria-label="Выбранное фото выше"
       onClick={()=>moveArchivePhoto(-1)}>↑ Переместить фото выше</button>
      <button type="button" disabled={selectedPhotoPosition<0||selectedPhotoPosition===photoSequence.length-1}
       aria-label="Выбранное фото ниже" onClick={()=>moveArchivePhoto(1)}>↓ Переместить фото ниже</button>
     </div>}
     <p>Пункт 6: {archiveRefsReady?'архивные ссылки подтверждены / text-only':'ссылка не найдена в архиве, утверждение заблокировано'}.</p>
    </section>}
    {!archiveFixture&&slide?.visual==='archive-photo'&&<div className="personaEditorialFile">
     <label>Фотография из локального архива (JPEG/PNG, до 25 МБ)
      <input type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" onChange={e=>{
       void upload(e.target.files?.[0]??null);e.target.value='';
      }}/>
     </label>
     {asset?<><p>Локально сохранено: {asset.name}</p><img src={asset.url} alt="Выбранное архивное фото" /></>:
      <p>Фото пока не прикреплено. Оформление можно утвердить заранее, но экспорт потребует настоящий файл.</p>}
    </div>}
    <div className={'personaEditorialPreview personaEditorialPreview--'+post.preset+
      (exactCanvasPreview?' personaEditorialPreview--exact':'')}
     data-alternate={selectedSlide%2?'graphite':'chocolate'}
     role="img" aria-label={'Предпросмотр оформления слайда '+(selectedSlide+1)}>
     {exactCanvasPreview?
       baselinePreviewUrl?<img data-testid={post.research?'research-exact-preview':'baseline-exact-preview'} src={baselinePreviewUrl} alt={'Готовый PNG слайда '+(selectedSlide+1)}/>:
        <span>{baselinePreviewError||'Готовится точный PNG...'}</span>:
       <>
        {slide?.visual==='archive-photo'&&asset&&<img src={asset.url} alt=""/>}
        <div className="personaEditorialPreviewOverlay">
         <span>СЛАЙД {selectedSlide+1} / {post.slides.length}</span>
         <strong>{slide?.text||'Фото без надписи'}</strong>
         <small>PERSONA · EDITORIAL</small>
        </div>
       </>}
    </div>
    <p>{exactCanvasPreview?
      'Предпросмотр сделан тем же Canvas-рендером, что и экспортируемый PNG 1080×1350, без служебных подписей.':
      'Предпросмотр показывает композицию. Точный файл 1080×1350 появится в экспорте после утверждения.'}</p>
    {exactCanvasPreview&&baselinePreviewUrl&&<a href={baselinePreviewUrl}
     download={'slide-'+String(selectedSlide+1).padStart(2,'0')+'-review.png'}>Скачать этот PNG для проверки на телефоне</a>}
    {!post.approvals.design&&post.kind==='carousel'&&<fieldset className="personaCarouselChecklist"
     data-testid="carousel-acceptance-checklist">
     <legend>Чек-лист приёмки · 7 проверок</legend>
     {CHECKLIST_TEXT.map((description,index)=><label key={index}>
      <input type="checkbox" checked={Boolean(checklist[index])}
       disabled={index===6||(index===5&&archiveFixture)} aria-label={'Пункт '+(index+1)}
       onChange={e=>setChecklist(index,e.target.checked)}/>
      <span><strong>{index+1}.</strong> {description}</span>
     </label>)}
     {archiveFixture&&<p>Пункт 6: {archiveRefsReady?'PASS — все выбранные фото найдены в существующем архиве или карусель text-only':'FAIL — отсутствует оригинал по ключу IndexedDB'}.</p>}
     <p>Пункт 7: {editorialContrastPass(post)?'PASS — цвета пресета удовлетворяют WCAG':'FAIL — контраст пресета ниже порога'}.
      Для фото поверх фона нужна дополнительная визуальная проверка.</p>
    </fieldset>}
    {!post.approvals.design?<button className="personaEditorialApprove" type="button"
     disabled={!checklistReady} onClick={()=>void approve('design')}>Утвердить оформление</button>:
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
