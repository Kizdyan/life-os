import React,{useEffect,useRef,useState} from 'react';
import {libraryBackground,isGeneratedBackgroundRef} from './personaEditorialBackgrounds';
import {editorialHierarchyLayout} from './personaEditorialTypography';
import quietHorrorCaptions from '../../../config/carousel-quiet-horror-captions.json';
import {
 approveEditorialStep,applyCreamEditorial,composeEditorialByMeaning,createEditorialFromTopic,editorialStage,editorialStageLabel,
 proposeTopics,reviseEditorialPost,SEED_CAROUSELS,createBaselinePauseCarousel,
 loadEditorialStore,attachEditorialIndependentReview,
 CAROUSEL_QUIET_HORROR_ID,createQuietHorrorCarousel,CAROUSEL_BASELINE_ID,CAROUSEL_002_ID,CAROUSEL_003_ID,CAROUSEL_004_ID,
 createDirectorQuestionCarousel,createPhotoArchiveCarousel,createMixedNarrativeCarousel,
 editorialArchiveProvenancePass,applyChatCarouselApproval,publicationDesignApproved,editorialDesignHash,
 editorialChecklistState,editorialChecklistReady,carouselEditorialWarnings,editorialSourcesPass,setEditorialSourceReviewed,
 addEditorialSource,removeEditorialSource,setEditorialInterpretationReviewed,setEditorialPublicCopyReviewed,
 setEditorialChecklistItem,editorialContrastPass,
 type EditorialPost,type TopicChoice,type EditorialPreset,type EditorialSlide,type PostKind
} from './personaEditorialModel';
import {buildEditorialExport,buildEditorialReviewExport,readEditorialImage,readEditorialImageByRef,saveEditorialImage,listEditorialImages,verifyEditorialArchivePhotos,triggerEditorialDownload,renderEditorialSlide,requestEditorialBackground} from './personaEditorialMedia';
import {FRIDGE_HUM_ID,prepareFridgeHumCarousel,fridgeHumSourceEvidence} from './personaProductionCarousel';
import {FRIDGE_HUM_V2_ID,isFridgeHumV2,prepareFridgeHumV2,fridgeHumV2Evidence} from './personaEditorialV2';
import {FRIDGE_HUM_V3_ID,prepareFridgeHumV3,fridgeHumV3Evidence,applyFridgeHumFinalPass,preserveFridgeHumBeforeFinalPass,fridgeHumFinalSnapshotKey} from './personaEditorialV3';
import PersonaLifeOSBridge from './PersonaLifeOSReview';
import {
 PUBLICATION_CAROUSEL_IDS,publicationCarouselDraft,publicationCarouselApproved,
 buildSinglePublicationZip,buildAllPublicationZip,publicationFilename,
 UNAPPROVED_PUBLICATION_MESSAGE,UNAPPROVED_DESIGN_MESSAGE,type PublicationCarouselId
} from './personaEditorialPublish';
import {importResearchCarousel,RESEARCH_CAROUSEL_EXAMPLE,RESEARCH_PROMPT} from './personaResearchCarousel';
import {personaWorkerUrl} from './personaWorkerUrl';
import {carouselReviewInput,currentCarouselReview,validateCarouselReviewReceipt} from './personaCarouselIndependentReview';
import {generateMissingAutonomousBackgrounds,missingAutonomousBackgrounds} from './personaCarouselImageBatch';
import {JAWS_BRAND_TRIAL_ID,createJawsBrandTrial} from './personaJawsBrandTrial';
import PersonaBrandTrialPreview from './PersonaBrandTrialPreview';
import PersonaCarouselVisualReview from './PersonaCarouselVisualReview';
import {applyCreativeStyle,loadCreativeStyle,rememberCreativeStyle} from './personaCreativeMemory';
import {importAboutMeDraft} from './personaAboutMe';
import PersonaRuntimeStatus from './PersonaRuntimeStatus';
import {editorialExperiment,loadPublicationAnalytics} from './personaPublicationAnalytics';
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
  if(post.compositionPreset==='cream-editorial-v1'||post.research||post.slides.some(s=>s.background||s.headline!==undefined)||([CAROUSEL_BASELINE_ID,CAROUSEL_QUIET_HORROR_ID].includes(post.id)&&post.fontPreset==='playfair-inter')){
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
 const exact=Boolean(post.compositionPreset==='cream-editorial-v1'||post.research||post.slides.some(s=>s.background||s.headline!==undefined)||([CAROUSEL_BASELINE_ID,CAROUSEL_QUIET_HORROR_ID].includes(post.id)&&post.fontPreset==='playfair-inter'));
 return <div className={'personaEditorialPublishCover'+(exact?' personaEditorialPublishCover--exact':'')}
  role="img" aria-label={'Первый слайд: '+post.slides[0].text}>
  {url&&<img data-testid={exact?'baseline-exact-cover':undefined} src={url} alt=""/>}
  {!exact&&<strong>{post.slides[0].text}</strong>}
 </div>;
}

export default function PersonaEditorialStudio({posts,targetId,onCreate,onChange,onSelect,onClose}:Props){
 const post=posts.find(x=>x.id===targetId)??null;
 const livePost=useRef(post);livePost.current=post;
 const [backgroundBusy,setBackgroundBusy]=useState(false);
 const batchInFlight=useRef(false),batchCancelled=useRef(false),mounted=useRef(true);
 const [batchBusy,setBatchBusy]=useState(false);
 const [batchMessage,setBatchMessage]=useState('');
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;batchCancelled.current=true}},[]);
 const [backgroundMessage,setBackgroundMessage]=useState('');
 const [paidImageConsent,setPaidImageConsent]=useState(false);
 async function generateBackground(){
  if(!post||backgroundBusy||batchInFlight.current||!paidImageConsent)return;
  const id=post.id,topic=post.topic,revision=post.revision,slideId=post.slides[selectedSlide]?.id;
  setBackgroundBusy(true);setBackgroundMessage('Создаётся фон без текста…');
  setPaidImageConsent(false);
  try{
   const result=await requestEditorialBackground(post,selectedSlide,{paidConsent:true}),current=livePost.current;
   if(current?.id!==id||current.topic!==topic||current.revision!==revision){setBackgroundMessage('Карусель изменилась. Созданный фон не применён к новой редакции.');return}
   if(result.status==='READY'&&result.background)onChange(reviseEditorialPost(current,{slides:current.slides.map(s=>s.id===slideId?{...s,visual:'background',photoRef:undefined,background:result.background}:s)}));
   setBackgroundMessage(result.message);
  }finally{setBackgroundBusy(false)}
 }
 let missingCount=0,batchBlock='';
 if(post?.research?.discovery?.mode==='discover'){
  try{missingCount=missingAutonomousBackgrounds(post).length}catch(e){batchBlock=(e as Error).message}
 }
 async function generateDraftImages(){
  if(!post||batchInFlight.current||backgroundBusy||missingCount<1)return;
  const id=post.id,count=missingCount;
  if(!window.confirm('Разрешить до '+count+' платных запросов OpenAI Images для недостающих фонов этой карусели? Точная стоимость зависит от настроенной модели и тарифа. При ошибке серия остановится; автоматических повторов нет.'))return;
  batchInFlight.current=true;batchCancelled.current=false;setBatchBusy(true);setBatchMessage('Генерация: 0 из '+count);
  try{
   const result=await generateMissingAutonomousBackgrounds({post,authorizedCalls:count,
    readCurrent:()=>loadEditorialStore(localStorage).posts.find(p=>p.id===id),
    persist:onChange,
    generate:(current,index)=>requestEditorialBackground(current,index,{paidConsent:true}),
    active:()=>mounted.current&&!batchCancelled.current&&livePost.current?.id===id,
    progress:(done,total)=>{if(mounted.current)setBatchMessage('Сохранено '+done+' из '+total)}
   });
   if(mounted.current)setBatchMessage(result.message+' · Запросов: '+result.attempted+'; сохранено: '+result.completed+'.');
  }catch(e){if(mounted.current)setBatchMessage(e instanceof Error?e.message:'Серия остановлена')}
  finally{batchInFlight.current=false;if(mounted.current)setBatchBusy(false)}
 }
 const [kind,setKind]=useState<PostKind>('carousel');
 const [researchJson,setResearchJson]=useState('');
 const [researchTheme,setResearchTheme]=useState('');
 const [researchBusy,setResearchBusy]=useState(false);
 const researchInFlight=useRef(false);
 const reviewInFlight=useRef(false);
 const [reviewBusy,setReviewBusy]=useState(false),[reviewMessage,setReviewMessage]=useState('');
 const independentReview=post?currentCarouselReview(post):undefined;
 const [sourceTitle,setSourceTitle]=useState('');
 const [sourceUrl,setSourceUrl]=useState('');
 const [selectedSlide,setSelectedSlide]=useState(0);
 useEffect(()=>setPaidImageConsent(false),[post?.id,post?.revision,selectedSlide]);
 const [baselinePreviewUrl,setBaselinePreviewUrl]=useState<string|null>(null);
 const [baselinePreviewError,setBaselinePreviewError]=useState('');
 const [busy,setBusy]=useState(false);
 const [showPublish,setShowPublish]=useState(false);
 const [publishError,setPublishError]=useState('');
 const [error,setError]=useState('');
 const [aboutMeStatus,setAboutMeStatus]=useState('');
 const aboutMeBusy=useRef(false);
 async function prepareAboutMeDraft(){
  if(aboutMeBusy.current)return;aboutMeBusy.current=true;setBusy(true);setError('');
  try{
   const id='about-me-'+crypto.randomUUID(),r=await importAboutMeDraft(id,setAboutMeStatus);
   if(!mounted.current)return;
   onCreate(r.post);onSelect(id);setArchiveRefresh(n=>n+1);
   setAboutMeStatus('Использовано оценок: '+r.scoresReused+'. Новый черновик; отсутствуют категории: '+(r.missingCategories.join(', ')||'нет')+'. Ошибок импорта: '+r.errors.length+'.');
  }catch(e){if(mounted.current){setError(e instanceof Error?e.message:String(e));setAboutMeStatus('Черновик не создан; исходные материалы сохранены.')}}
  finally{aboutMeBusy.current=false;setBusy(false)}
 }

 const [styleMemoryMessage,setStyleMemoryMessage]=useState('');
 function rememberStyle(){if(!post)return;try{rememberCreativeStyle(localStorage,post);setStyleMemoryMessage('Палитра и гарнитура сохранены для новых каруселей.')}catch(e){setStyleMemoryMessage(e instanceof Error?e.message:String(e))}}
 const [asset,setAsset]=useState<{name:string;url:string}|null>(null);
 const [archiveChoices,setArchiveChoices]=useState<{key:string;name:string;url:string}[]>([]);
 const [archiveLoading,setArchiveLoading]=useState(false);
 const [archiveError,setArchiveError]=useState('');
 const [archiveRefresh,setArchiveRefresh]=useState(0);
 const allTopics=proposeTopics(kind,posts.map(p=>p.title));
 let learning:ReturnType<typeof editorialExperiment>|null=null;
 try{learning=editorialExperiment(loadPublicationAnalytics(localStorage),post?.kind??kind)}catch{/* damaged history remains untouched */}
 const publishRows=PUBLICATION_CAROUSEL_IDS.map(id=>
  posts.find(p=>p.id===id)??applyChatCarouselApproval(publicationCarouselDraft(id)));
 const seedCount=SEED_CAROUSELS.filter(x=>!posts.some(p=>p.id===x.id)).length;
 const checklist=post?.kind==='carousel'?editorialChecklistState(post):[];
 const archiveFixture=Boolean(post?.carouselFormat||post?.research);
 const needsArchiveList=archiveFixture||Boolean(post?.slides.some(s=>s.visual==='archive-photo'&&s.photoRef));
 const sourcePass=post?editorialSourcesPass(post):false;
 const exactCanvasPreview=Boolean(post?.compositionPreset==='cream-editorial-v1'||post?.research||post?.slides.some(s=>s.background||s.headline!==undefined)||([CAROUSEL_BASELINE_ID,CAROUSEL_QUIET_HORROR_ID].includes(post?.id??'')&&post?.fontPreset==='playfair-inter'));
 const archiveRefsReady=post===null||
  (!post.carouselFormat&&!post.slides.some(s=>s.visual==='archive-photo'&&s.photoRef))||
  !post.slides.some(s=>s.visual==='archive-photo')||
  (!archiveLoading&&!archiveError&&
   (post.carouselFormat?editorialArchiveProvenancePass(post,archiveChoices.map(x=>x.key)):
    post.slides.every(s=>!s.photoRef||archiveChoices.some(x=>x.key===s.photoRef))));
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
  if(!needsArchiveList){setArchiveChoices([]);setArchiveError('');return}
  let alive=true;const urls:string[]=[];
  setArchiveLoading(true);setArchiveError('');
  listEditorialImages().then(images=>{
   if(!alive)return;
   const options=images.filter(img=>!isGeneratedBackgroundRef(img.key)&&img.blob instanceof Blob&&img.blob.size===img.bytes&&
    ['image/jpeg','image/png'].includes(img.mime)).map(img=>{
     const url=URL.createObjectURL(img.blob);urls.push(url);
     return {key:img.key,name:img.name,url};
    });
   setArchiveChoices(options);setArchiveLoading(false);
  }).catch(e=>{if(alive){setArchiveLoading(false);setArchiveChoices([]);setArchiveError((e as Error).message)}});
  return()=>{alive=false;urls.forEach(url=>URL.revokeObjectURL(url))};
 },[post?.id,needsArchiveList,archiveRefresh]);
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
   if(step==='design'&&post.research&&!archiveRefsReady)throw Error('В выбранном источнике фотографии нет файла в локальном архиве');
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
   onCreate(applyCreativeStyle(created,loadCreativeStyle(localStorage)));onSelect(id);setError('');setResearchJson('');
  }catch(e){setError('Импорт не выполнен: '+(e as Error).message)}
 }
 async function researchWithPerplexity(mode:'topic'|'discover'='topic'){
  if(researchInFlight.current)return;
  if(mode==='topic'&&(researchTheme.trim().length<6||researchTheme.length>250)){
   setError('Укажи конкретную тему для исследования (6–250 символов)');return;
  }
  researchInFlight.current=true;setResearchBusy(true);setError('');
  try{
   const history=[...new Set([...posts].filter(p=>p.kind==='carousel').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(p=>p.title.trim().slice(0,160)).filter(Boolean))].slice(0,20);
   const healthResponse=await fetch(personaWorkerUrl+'/health',{
    cache:'no-store',signal:AbortSignal.timeout(4500)
   });
   if(!healthResponse.ok)throw Error('Локальный Worker недоступен');
   const health=await healthResponse.json();
   if(health?.service!=='persona-media-worker'||typeof health.token!=='string'||
      !health.carouselResearch?.configured)
    throw Error('Perplexity не подключён к локальному Persona Worker. Доступен ручной импорт JSON.');
   const response=await fetch(personaWorkerUrl+'/carousel-research',{
    method:'POST',headers:{'Content-Type':'application/json','X-Persona-Worker-Token':health.token},
    body:JSON.stringify(mode==='discover'?{mode,history,consent:true}:{mode,theme:researchTheme.trim(),consent:true}),
    signal:AbortSignal.timeout(115000)
   });
   const data=await response.json();
   if(!response.ok)throw Error(typeof data.error==='string'?data.error:'Ошибка исследования');
   if(data?.provider!=='perplexity'||data?.status!=='UNVERIFIED'||data?.mode!==mode||typeof data.model!=='string'||!data.packet)
    throw Error('Worker не вернул исследование с источниками');
   const id='editorial-research-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
   const receivedAt=new Date().toISOString();
   const created=importResearchCarousel(id,JSON.stringify(data.packet),receivedAt,{mode,model:data.model,receivedAt});
   onCreate(applyCreativeStyle(created,loadCreativeStyle(localStorage)));onSelect(id);setResearchTheme('');
  }catch(e){setError('Исследование не импортировано: '+(e instanceof Error?e.message:'Ошибка запроса'))}
  finally{researchInFlight.current=false;setResearchBusy(false)}
 }
 async function runIndependentReview(){
  if(!post||reviewInFlight.current||batchInFlight.current||backgroundBusy)return;
  if(!window.confirm('Разрешить один платный запрос Perplexity на проверку текста другой моделью?'))return;
  reviewInFlight.current=true;setReviewBusy(true);setReviewMessage('Проверяются источники и публичный текст…');
  try{
   const input=carouselReviewInput(post),id=post.id;
   const healthResponse=await fetch(personaWorkerUrl+'/health',{cache:'no-store',signal:AbortSignal.timeout(4500)});
   if(!healthResponse.ok)throw Error('Локальный Worker недоступен');
   const health=await healthResponse.json();
   if(health?.service!=='persona-media-worker'||typeof health.token!=='string')throw Error('Worker недоступен');
   const response=await fetch(personaWorkerUrl+'/carousel-independent-review',{method:'POST',
    headers:{'Content-Type':'application/json','X-Persona-Worker-Token':health.token},body:JSON.stringify({input,consent:true}),signal:AbortSignal.timeout(115000)});
   const data=await response.json();
   if(!response.ok)throw Error(typeof data.error==='string'?data.error:'Проверка недоступна');
   const audit=await validateCarouselReviewReceipt(input,data);
   const current=loadEditorialStore(localStorage).posts.find(p=>p.id===id);
   if(!mounted.current||!current||livePost.current?.id!==id||JSON.stringify(carouselReviewInput(current))!==JSON.stringify(input))
    throw Error('Черновик изменился; отчёт не применён');
   const next=attachEditorialIndependentReview(current,audit);onChange(next);
   if(loadEditorialStore(localStorage).posts.find(p=>p.id===id)?.research?.independentReview?.report.fingerprint!==data.fingerprint)
    throw Error('Сохранение отчёта не подтверждено');
   setReviewMessage('Отчёт сохранён. Авторское утверждение не выполнено.');
  }catch(e){if(mounted.current)setReviewMessage(e instanceof Error?e.message:'Проверка не выполнена')}
  finally{reviewInFlight.current=false;if(mounted.current)setReviewBusy(false)}
 }
 function updateResearch(fn:(current:EditorialPost)=>EditorialPost){
  if(!post)return;
  try{onChange(fn(post));setError('')}
  catch(e){setError(e instanceof Error?e.message:'Ошибка проверки источника')}
 }
 function addCurrentSource(){
  if(!slide)return;
  try{
   if(!post)return;
   onChange(addEditorialSource(post,slide.id,sourceTitle,sourceUrl));
   setSourceTitle('');setSourceUrl('');setError('');
  }catch(e){setError(e instanceof Error?e.message:'Источник не добавлен')}
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
  if(!post||!slide||!(post.carouselFormat||post.research))return;
  if(post.carouselFormat==='mixed'&&selectedSlide%2===1)return;
  modifySlide({visual:'archive-photo',photoRef,background:undefined});
 }
 function clearArchivePhoto(){
  if(!post||!slide||!(post.carouselFormat||post.research))return;
  modifySlide({visual:'background',photoRef:undefined,background:undefined});
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
   onCreate(applyCreativeStyle(created,loadCreativeStyle(localStorage)));onSelect(id);setError('');
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
  const id=post.id,revision=post.revision,slideId=slide.id,assetId='photo-'+crypto.randomUUID();
  setBusy(true);setError('');
  try{
   await saveEditorialImage(id,assetId,file);
   const current=livePost.current;
   if(current?.id!==id||current.revision!==revision){setError('Карусель изменилась. Фото сохранено в архиве, но не применено к новой редакции.');return}
   // Immutable upload: never overwrite a photograph reused by another slide.
   onChange(reviseEditorialPost(current,{slides:current.slides.map(s=>s.id===slideId?
    {...s,visual:'archive-photo',photoRef:id+'/'+assetId,background:undefined}:s)}));
   setArchiveRefresh(n=>n+1);
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
 async function exportReview(){
  if(!post||busy)return;
  setBusy(true);setError('');
  try{triggerEditorialDownload(await buildEditorialReviewExport(post,{sourceEvidence:post.id===FRIDGE_HUM_ID?fridgeHumSourceEvidence(post):isFridgeHumV2(post)?fridgeHumV2Evidence(post):post.id===FRIDGE_HUM_V3_ID?fridgeHumV3Evidence(post,localStorage.getItem(fridgeHumFinalSnapshotKey(post))):undefined}),post.id+'-DRAFT.zip')}
  catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 async function openFridgeHum(){
  if(posts.some(p=>p.id===FRIDGE_HUM_ID)){onSelect(FRIDGE_HUM_ID);return}
  setBusy(true);setError('');
  try{const created=await prepareFridgeHumCarousel();onCreate(created);onSelect(created.id)}
  catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 async function openFridgeV2(hook:'a'|'b'='a'){
  const id=FRIDGE_HUM_V2_ID+(hook==='b'?'-hook-b':'');
  if(posts.some(p=>p.id===id)){onSelect(id);return}
  setBusy(true);setError('');
  try{const created=await prepareFridgeHumV2(hook);onCreate(created);onSelect(created.id)}
  catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 async function openFridgeV3(){
  if(posts.some(p=>p.id===FRIDGE_HUM_V3_ID)){onSelect(FRIDGE_HUM_V3_ID);return}
  setBusy(true);setError('');
  try{const created=await prepareFridgeHumV3();onCreate(created);onSelect(created.id)}
  catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 function composeByMeaning(){
  if(!post)return;
  try{
   onChange(composeEditorialByMeaning(post));
   setError('');setBackgroundMessage('Композиции выбраны по роли текста. Хук из имеющегося факта — редакторское предложение; нужен авторский просмотр. Новые изображения и платные запросы не запускались.');
  }catch(e){setError(e instanceof Error?e.message:'Композиции не применены')}
 }
 function applyFinalEditorialPass(){
  if(!post)return;
  try{
   const next=applyFridgeHumFinalPass(post);
   if(next===post){setBackgroundMessage('Финальная редакторская правка уже применена. Дальше — только авторское решение.');return}
   preserveFridgeHumBeforeFinalPass(localStorage,post,next);
   const changed=post.slides.flatMap((s,i)=>JSON.stringify(s)===JSON.stringify(next.slides[i])?[]:[i+1]);
   const typographyOnly=post.caption===next.caption&&changed.length===1&&changed[0]===5;
   onChange(next);setError('');setBackgroundMessage(typographyOnly?
    'Исправлен только перенос заголовка слайда 5; предыдущая редакция сохранена. Остальные слайды и подпись не менялись.':
    `Обновлены слайды ${changed.join(', ')}${post.caption!==next.caption?' и публичная подпись':''}; предыдущая редакция сохранена. Шрифты, изображения и композиции не менялись.`);
  }catch(e){setError(e instanceof Error?e.message:'Правка не применена')}
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
  {!post&&!showPublish&&<details><summary>Готовность Persona и локальной библиотеки</summary><PersonaRuntimeStatus/></details>}
  {!post&&!showPublish&&<div><button type="button" disabled={busy} onClick={()=>void prepareAboutMeDraft()}>Подготовить «Обо мне» из локального архива</button><p>Повторный отбор по сохранённым оценкам, без Qwen. Создаётся отдельный черновик.</p></div>}
  {aboutMeStatus&&<p role="status">{aboutMeStatus}</p>}
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
   <button type="button" data-testid="open-carousel-fridge-hum" disabled={busy} onClick={()=>void openFridgeHum()}>
    Гул холодильника · производственный черновик
   </button>
   <button type="button" data-testid="open-carousel-fridge-hum-v2" disabled={busy} onClick={()=>void openFridgeV2()}>V2 · музыка под видом шума</button>
   <button type="button" data-testid="open-carousel-fridge-hum-v3" disabled={busy} onClick={()=>void openFridgeV3()}>V3 · финальная редакция для просмотра</button>
   {learning&&<details className="personaEditorialNote" data-testid="persona-editorial-learning"><summary>Редакционное задание на основе статистики</summary>
    <p>Публикаций этого формата: {learning.observedPosts}. Сопоставимых наблюдений через 24–72 ч: {learning.comparablePosts}. Привязано к материалам: {learning.boundPosts}.</p>
    <p>{learning.status==='INSUFFICIENT_EVIDENCE'?'Недостаточно сопоставимых данных. ': 'Проверяемая гипотеза, не установленная причина. '}{learning.experiment}</p>
    {learning.guardrails.map(rule=><p key={rule}>{rule}</p>)}
    <small>Стратегия, факты и авторское утверждение не изменяются автоматически.</small>
   </details>}
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
   {kind==='carousel'&&<article className="personaEditorialNote" data-testid="persona-jaws-brand-trial">
    <h4>Как две ноты заставили зрителей бояться океана</h4>
    <p>«Челюсти» (1975) · музыка Джона Уильямса · пробный комплект Old Money. Предложение из подготовленного редакционного банка, не новый автоматический поиск.</p>
    <button type="button" onClick={()=>{
     try{if(!posts.some(p=>p.id===JAWS_BRAND_TRIAL_ID))onCreate(createJawsBrandTrial());onSelect(JAWS_BRAND_TRIAL_ID);setError('')}
     catch(e){setError(e instanceof Error?e.message:String(e))}
    }}>{posts.some(p=>p.id===JAWS_BRAND_TRIAL_ID)?'Открыть пробный комплект':'Попробовать тему в Persona'}</button>
   </article>}
   <details className="personaEditorialNote" data-testid="editorial-research-import">
    <summary><strong>Создать карусель из исследования</strong> · Perplexity / проверяемый JSON</summary>
    <p>Новый проект в существующей редакции Persona. Источники будут помечены как непроверенные:
     одних ссылок недостаточно для публикации.</p>
    <label>Тема для поиска Perplexity
     <input value={researchTheme} maxLength={250}
      onChange={e=>setResearchTheme(e.target.value)}
      placeholder="Например: необычное решение композитора, изменившее известный фильм"/>
    </label>
    <button type="button" disabled={researchBusy||researchTheme.trim().length<6}
     onClick={()=>void researchWithPerplexity()}>
     {researchBusy?'Исследую…':'Исследовать через Perplexity (платный запрос)'}
    </button>
    <button type="button" data-testid="editorial-discover-carousel" disabled={researchBusy}
     onClick={()=>void researchWithPerplexity('discover')}>
     {researchBusy?'Исследую…':'Persona: самостоятельно найти тему (1 платный запрос)'}
    </button>
    <p>Без заданной темы: поиск учитывает до 20 последних названий каруселей. Результат — новый черновик, не готовая публикация.</p>
    {researchBusy&&<p role="status">Persona ищет первоисточники через локальный Worker. Это черновик, не утверждение фактов.</p>}
    <p>Поиск запускается только нажатием кнопки, если на твоём ПК подключён локальный Worker с ключом API. Если он недоступен, импортируй JSON вручную.</p>
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
   <p className="personaEditorialNote">Факт + мнение · 8 слайдов.
    <button type="button" data-testid="open-carousel-quiet-horror" onClick={()=>{
     if(!posts.some(p=>p.id===CAROUSEL_QUIET_HORROR_ID))onCreate(createQuietHorrorCarousel());
     onSelect(CAROUSEL_QUIET_HORROR_ID);setError('');
    }}>Почему самая страшная сцена часто тише всех</button>
   </p>
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
   {post.research&&<section aria-label="Черновик для авторской проверки">
    {post.research.discovery&&<div className="personaEditorialNote" aria-label="Независимая проверка фактов">
     <button type="button" data-testid="editorial-independent-review" disabled={reviewBusy||batchBusy||backgroundBusy} onClick={()=>void runIndependentReview()}>
      {reviewBusy?'Проверяются факты…':'Независимый фактчек и редактор · 1 платный запрос'}
     </button>
     {post.research.independentReview&&!independentReview&&<p role="status">Отчёт устарел: текст или источники изменились.</p>}
     {independentReview&&<div>
      <strong>{independentReview.status==='NEEDS_REVISION'?'Нужна редактура':'Кандидат на авторскую проверку'} · {independentReview.model}</strong>
      {independentReview.checks.map(c=><div key={c.target}><p><strong>{c.target}: {c.verdict}</strong> — {c.reason}</p>
       {c.evidence.map((ev,i)=><p key={i}><a href={ev.url} target="_blank" rel="noreferrer">Источник</a> — {ev.quote}</p>)}</div>)}
      <p>Хук: {independentReview.editorial.hook}</p><p>Драматургия: {independentReview.editorial.narrative}</p>
      <p>Позиционирование: {independentReview.editorial.positioning}</p><p>Правки: {independentReview.editorial.revision}</p>
     </div>}
     {reviewMessage&&<p role="status">{reviewMessage}</p>}
     <p>ИИ-отчёт не заменяет авторскую проверку. Неподтверждённые факты блокируют утверждение текста.</p>
    </div>}
    {post.research.discovery&&<p role="status">Источник: Perplexity · {post.research.discovery.model} · {post.research.discovery.mode==='discover'?'самостоятельный выбор темы':'поиск заданной темы'}. Факты ещё не проверены.</p>}
    <p>Изображения и текст можно проверить до утверждения. Этот ZIP — черновик; разрешение на публикацию он не даёт.</p>
    {post.id===FRIDGE_HUM_ID&&<p>Новые иллюстрации созданы встроенным генератором Codex и импортированы в Persona. Это не кадры фильма, не копия V14 и не выполненная генерация через Worker. Источники и авторские решения требуют вашего отдельного подтверждения.</p>}
    {(post.id===FRIDGE_HUM_ID||isFridgeHumV2(post)||post.id===FRIDGE_HUM_V3_ID)&&<div aria-label="Сравнение редакций">
     <p>{isFridgeHumV2(post)?'V2 — редакторская доработка; авторское решение и публикация не утверждены. Источник каждого фона и изменения кадрирования и света указаны в ZIP.':'V1 сохранена. Художественная оценка автора: NEEDS_REVISION; публикация запрещена.'}</p>
     <button type="button" disabled={busy} onClick={()=>void openFridgeHum()}>Открыть V1 без изменений</button>
     <button type="button" disabled={busy} onClick={()=>void openFridgeV2('a')}>V2 · обложка A</button>
     <button type="button" disabled={busy} onClick={()=>void openFridgeV2('b')}>V2 · обложка B</button>
     <button type="button" disabled={busy} onClick={()=>void openFridgeV3()}>V3 · финальная редакция</button>
    </div>}
    {post.id===FRIDGE_HUM_V3_ID&&<p>V3 — отдельный черновик для художественной приёмки. Literata и Golos Text; источники и происхождение изображений в ZIP. Текст и оформление не утверждены. Скачивание не является публикацией.</p>}
    {post.research.discovery?.mode==='discover'&&<div className="personaEditorialNote" aria-label="Пакетная генерация черновых изображений">
     <p>Новые изображения OpenAI: {post.slides.filter(s=>s.background?.provenance?.provider==='openai').length} из {post.slides.length}. Источники и оформление остаются неутверждёнными.</p>
     {batchBlock?<p role="status">{batchBlock}</p>:<button type="button" data-testid="editorial-autonomous-draft-images"
      disabled={batchBusy||backgroundBusy||missingCount===0} onClick={()=>void generateDraftImages()}>
      {batchBusy?'Создаются изображения…':missingCount?'Создать недостающие фоны · до '+missingCount+' платных запросов':'Все новые фоны сохранены'}
     </button>}
     {batchBusy&&<button type="button" onClick={()=>{batchCancelled.current=true;setBatchMessage('Остановка после текущего запроса…')}}>Остановить серию</button>}
     {batchMessage&&<p role="status">{batchMessage}</p>}
    </div>}
    <button type="button" disabled={busy} onClick={()=>void exportReview()}>Скачать черновик для проверки</button>
    {!post.approvals.content&&<>
     <div className="personaEditorialSlides">{post.slides.map((s,i)=><button key={s.id} type="button" aria-pressed={selectedSlide===i} onClick={()=>setSelectedSlide(i)}>Проверить слайд {i+1}</button>)}</div>
     {baselinePreviewUrl?<img data-testid="research-draft-preview" src={baselinePreviewUrl} alt={'Черновой PNG слайда '+(selectedSlide+1)} style={{width:'100%',maxWidth:432,height:'auto'}}/>:<p>{baselinePreviewError||'Готовится PNG…'}</p>}
    </>}
   </section>}
   {post.kind==='carousel'&&<section aria-label="Смысловая композиция">
    <button type="button" data-testid="editorial-compose-by-meaning" disabled={busy} onClick={composeByMeaning}>Подобрать композиции по смыслу</button>
    <p>Persona различает сцену, факт, сопоставление и вывод. Размер пояснений — от 60 px. Факты и фотографии сохраняются; результат требует просмотра.</p>
   </section>}
   {post.id===FRIDGE_HUM_V3_ID&&post.compositionPreset==='semantic-editorial-v1'&&<section aria-label="Финальная редакторская правка">
    <button type="button" data-testid="editorial-apply-final-pass" disabled={busy} onClick={applyFinalEditorialPass}>Применить финальную редакторскую правку</button>
    <p>Правки слайдов 1, 2, 5, 7 и подписи. Проверка источников привязана к этой копии; художественное решение остаётся за автором.</p>
   </section>}
   <PersonaLifeOSBridge key={post.id} post={post}/>
   <section aria-label="Шаг 1. Утверждение темы">
    <h4>1. Утверждаем тему</h4>
    <label>Тема<input value={post.topic} maxLength={160} onChange={e=>persist({topic:e.target.value,title:e.target.value})}/></label>
    <label>Редакционная задача<textarea value={post.goal} maxLength={500} onChange={e=>persist({goal:e.target.value})}/></label>
    <p>Что узнает или почувствует зритель? Тема должна быть конкретной. Редакционные идеи — только предложение, факты проверяются автором.</p>
    {!post.approvals.topic?<button className="personaEditorialApprove" type="button" onClick={()=>void approve('topic')}>Утвердить тему</button>:
     <span className="personaEditorialApproved">Тема утверждена ✓</span>}
   </section>
   {post.id===JAWS_BRAND_TRIAL_ID&&post.approvals.topic&&<PersonaBrandTrialPreview post={post} onChange={onChange}/>}
   {post.approvals.topic&&<section aria-label="Шаг 2. Текст и подпись">
    <h4>2. Структура и основной текст</h4>
    <p>На слайдах — короткие смысловые фразы. Развёрнутая история располагается <strong>в подписи под каруселью</strong>, а не поверх фотографии. В исследовательской карусели пустая строка разделяет заголовок, абзац и необязательный курсивный акцент (до трёх блоков).</p>
    {post.kind==='carousel'&&<div className="personaEditorialNote" data-testid="persona-carousel-editorial-preflight">
     <strong>Структура:</strong> {post.slides.length===8?'8 слайдов: хук → контекст → препятствие → факт → поворот → авторская позиция → вопрос → финал.':'У каждого слайда должен быть собственный смысловой ход; допустимо 3–8 слайдов.'}
     {carouselEditorialWarnings(post).map((warning,i)=><p key={i} role="status">Редакторское замечание: {warning}</p>)}
     {carouselEditorialWarnings(post).length===0&&<p>Замечаний по длине текста нет; это не означает, что факты и оформление утверждены.</p>}
    </div>}
    <div className="personaEditorialSlides" role="group" aria-label="Выбор слайда">
     {post.slides.map((s,i)=><button key={s.id} type="button" aria-pressed={selectedSlide===i} onClick={()=>setSelectedSlide(i)}>
      Слайд {i+1}</button>)}
    </div>
    {slide?.headline!==undefined?<div aria-label="Иерархия текста слайда">
     {(post.id!==CAROUSEL_QUIET_HORROR_ID&&!['cormorant-inter','literata-golos'].includes(post.fontPreset??''))&&<label>Кикер<input value={slide.kicker??''} maxLength={60} onChange={e=>modifySlide({kicker:e.target.value})}/></label>}
     <label>Заголовок<textarea aria-label="Заголовок слайда" value={slide.headline} maxLength={170} onChange={e=>modifySlide({headline:e.target.value})}/></label>
     {((post.id!==CAROUSEL_QUIET_HORROR_ID&&!['cormorant-inter','literata-golos'].includes(post.fontPreset??''))||editorialHierarchyLayout(post,selectedSlide)?.body)&&<label>Основной текст<textarea value={slide.body??''} maxLength={350} onChange={e=>modifySlide({body:e.target.value})}/></label>}
     {(post.id!==CAROUSEL_QUIET_HORROR_ID&&!['cormorant-inter','literata-golos'].includes(post.fontPreset??''))&&<label>Курсивный акцент<textarea value={slide.highlight??''} maxLength={170} onChange={e=>modifySlide({highlight:e.target.value})}/></label>}
    </div>:<label>{post.kind==='carousel'?'Текст выбранного слайда':'Короткий титр на фото (необязательно)'}
     <textarea value={slide?.text??''} maxLength={post.research?260:170} onChange={e=>modifySlide({text:e.target.value})}/>
    </label>}
    {post.research&&<section className="personaEditorialResearchReview" data-testid="editorial-source-review">
     <h4>Источники и проверка фактов</h4>
     <p>Открой ссылки, сопоставь каждый факт с оригиналом и отметь только действительно подтверждённые.
      Галочки — ручная редакторская проверка, не автоматический аудит. Если изменишь текст, проверку потребуется повторить.</p>
     <p role="status"><strong>Источник: {sourcePass?'SOURCE_PASS · проверено автором':'UNVERIFIED · утверждение текста заблокировано'}</strong></p>
     <label>
      <input type="checkbox" data-testid="research-public-copy-review"
       checked={post.research.copyReviewed===true}
       onChange={e=>updateResearch(current=>setEditorialPublicCopyReviewed(current,e.target.checked))}/>
      Я проверил заголовок и подпись: в них нет неподтверждённых фактов
     </label>
     {post.slides.map((s,i)=>{
      const sources=post.research!.sourceItems.filter(x=>x.slideId===s.id);
      return <div key={s.id} className="personaEditorialResearchSlide">
       <strong>Слайд {i+1}: {s.text.slice(0,85)}</strong>
       {!sources.length&&<label>
        <input type="checkbox" checked={post.research!.interpretationSlides.includes(s.id)}
         onChange={e=>updateResearch(current=>setEditorialInterpretationReviewed(current,s.id,e.target.checked))}/>
        Проверено автором: это исключительно художественный вывод или мнение, без проверяемых фактов
       </label>}
       {sources.map(source=><div key={source.url}>
        <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} · источник</a>
        <label><input type="checkbox" checked={source.reviewed}
         onChange={e=>reviewSource(s.id,source.url,e.target.checked)}/>
         Проверено по оригиналу</label>
        <button type="button" onClick={()=>updateResearch(current=>removeEditorialSource(current,s.id,source.url))}>Убрать источник</button>
       </div>)}
      </div>;
     })}
     {slide&&<div className="personaEditorialResearchSlide">
      <strong>Добавить источник для выбранного слайда {selectedSlide+1}</strong>
      <label>Название источника
       <input value={sourceTitle} maxLength={160} onChange={e=>setSourceTitle(e.target.value)}/>
      </label>
      <label>Прямая ссылка на источник
       <input type="url" value={sourceUrl} maxLength={2048}
        onChange={e=>setSourceUrl(e.target.value)} placeholder="https://..."/>
      </label>
      <button type="button" disabled={!sourceTitle.trim()||!sourceUrl.trim()}
       onClick={addCurrentSource}>Добавить как непроверенный</button>
     </div>}
    </section>}
    {post.kind==='carousel'&&!post.research&&<div className="personaEditorialSlideActions">
     {post.slides.length<8&&<button type="button" onClick={()=>{
      persist({slides:[...post.slides,{id:'slide-'+Date.now(),text:'Новый смысловой поворот',visual:'background',photoDirection:''}]});
      setSelectedSlide(post.slides.length);
     }}>+ Слайд</button>}
     {post.slides.length>3&&<button type="button" onClick={()=>{
      persist({slides:post.slides.filter(x=>x.id!==slide?.id)});setSelectedSlide(Math.max(0,selectedSlide-1));
     }}>Убрать слайд</button>}
    </div>}
    {post.id===CAROUSEL_QUIET_HORROR_ID&&<button type="button" onClick={()=>{
     const draft=createQuietHorrorCarousel();
     const caption=Object.values(quietHorrorCaptions.variants).find(value=>value===post.caption||value.startsWith(post.caption+'\n\n'))??post.caption;
     persist({slides:draft.slides,caption});
    }}>Применить тексты и фоны v4</button>}
    {post.id===CAROUSEL_QUIET_HORROR_ID&&<div role="group" aria-label="Вариант подписи">
     {(['1','2'] as const).map(id=><button key={id} type="button"
      aria-pressed={post.caption===quietHorrorCaptions.variants[id]}
      onClick={()=>persist({caption:quietHorrorCaptions.variants[id]})}>Вариант {id}</button>)}
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
    {post.research&&slide&&<label>Визуальное решение выбранного слайда
     <textarea value={slide.photoDirection} maxLength={350} onChange={e=>modifySlide({photoDirection:e.target.value})}/>
    </label>}
    <div className="personaEditorialSlides">
     {post.slides.map((s,i)=><button key={s.id} type="button" aria-pressed={selectedSlide===i} onClick={()=>setSelectedSlide(i)}>
      {i+1} · {s.visual==='archive-photo'?'Фото':'Фон'}</button>)}
    </div>
    {(!archiveFixture||post.research)&&<div aria-label="Кинематографичные фоны">
     {!post.research&&<button type="button" data-testid="cinematic-library" disabled={backgroundBusy} onClick={()=>{
      persist({slides:post.slides.map((s,i)=>({...s,visual:'background',background:libraryBackground(i)}))});
      setBackgroundMessage('Локальные кинофоны применены. Текст не изменён; оформление требует утверждения.');
     }}>Кинофоны из библиотеки · все слайды</button>}
     <label><input type="checkbox" aria-label="Разрешаю один платный запрос генерации изображения" checked={paidImageConsent} disabled={backgroundBusy} onChange={e=>setPaidImageConsent(e.target.checked)}/>Разрешаю один платный запрос OpenAI для этого слайда</label>
     <button type="button" disabled={batchBusy||backgroundBusy||!paidImageConsent} onClick={()=>void generateBackground()}>
      {backgroundBusy?'Генерация фона…':'Сгенерировать фон слайда · OpenAI'}</button>
     {slide?.background&&<button type="button" disabled={backgroundBusy} onClick={()=>modifySlide({background:undefined})}>Однотонный фон слайда</button>}
     <p>Текст рисует Persona. Внешняя генерация требует ключа и отдельного согласия. При BLOCKED доступны собственный архив и однотонный фон. Локальная библиотека — предзаготовленные изображения, а не выполненная генерация.</p>
     {backgroundMessage&&<p role="status">{backgroundMessage}</p>}
    </div>}
    <fieldset className="personaEditorialMediaChoices">
     <legend>Оформление слайда {selectedSlide+1}</legend>
     <label><input type="radio" checked={slide?.visual==='background'} onChange={()=>post.carouselFormat||post.research?clearArchivePhoto():modifySlide({visual:'background'})}/>Фон + текст</label>
     <label><input type="radio" checked={slide?.visual==='archive-photo'}
      disabled={Boolean(post.carouselFormat)} onChange={()=>modifySlide({visual:'archive-photo',background:undefined})}/>Фото из архива + текст</label>
    </fieldset>
    {archiveFixture&&<section className="personaEditorialArchivePicker" data-testid="editorial-archive-picker"
     aria-label="Выбор фотографий из архива IndexedDB">
     <div className="personaEditorialArchiveHead"><strong>Фотографии из архива Persona</strong>
      <button type="button" onClick={()=>setArchiveRefresh(n=>n+1)}>Обновить архив</button></div>
     <p>Выбирай фотографии для слайдов. Их оригиналы остаются в IndexedDB; в плане сохраняется лишь ключ и порядок. {post.carouselFormat==='mixed'?'Для смешанной карусели фото ставятся на слайды 1, 3 и 5.':'Для исследовательской карусели можно использовать разные настоящие фотографии на разных слайдах.'}</p>
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
    {!post.carouselFormat&&slide?.visual==='archive-photo'&&<div className="personaEditorialFile">
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
       disabled={index===6||(index===5&&Boolean(post.carouselFormat))} aria-label={'Пункт '+(index+1)}
       onChange={e=>setChecklist(index,e.target.checked)}/>
      <span><strong>{index+1}.</strong> {description}</span>
     </label>)}
     {archiveFixture&&<p>{post.carouselFormat?'Пункт 6: ': 'Фотоархив: '}{archiveRefsReady?'проверяемые ключи исходников найдены / text-only':'не найдено выбранное исходное изображение'}. {post.research?'Для исследовательской карусели отдельно отметь пункт 6 после визуальной проверки.':''}</p>}
     <p>Пункт 7: {editorialContrastPass(post)?'PASS — цвета пресета удовлетворяют WCAG':'FAIL — контраст пресета ниже порога'}.
      Для фото поверх фона нужна дополнительная визуальная проверка.</p>
    </fieldset>}
    {!post.approvals.design?<button className="personaEditorialApprove" type="button"
     disabled={!checklistReady} onClick={()=>void approve('design')}>Утвердить оформление</button>:
     <span className="personaEditorialApproved">Оформление утверждено ✓</span>}
   </section>}
   {post.kind==='carousel'&&post.approvals.topic&&<PersonaCarouselVisualReview key={post.id+':'+post.revision+':'+editorialDesignHash(post)} post={post} onChange={onChange}/>}
   {post.approvals.design&&<section aria-label="Шаг 4. Производство и экспорт">
    <h4>4. Производство</h4>
    {post.kind==='carousel'&&post.id!==JAWS_BRAND_TRIAL_ID&&<button type="button" data-testid="cream-editorial-style" onClick={()=>{try{onChange(applyCreamEditorial(post));setError('')}catch(e){setError(String(e))}}}>Применить Cream Editorial · кремовая бумага и фотокомпозиция</button>}
    {post.kind==='carousel'&&post.id!==JAWS_BRAND_TRIAL_ID&&publicationDesignApproved(post)&&<div><button type="button" onClick={rememberStyle}>Запомнить оформление для новых каруселей</button>{styleMemoryMessage&&<p role="status">{styleMemoryMessage}</p>}</div>}
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
