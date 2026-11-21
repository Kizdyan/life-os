/** Local-only one-click intake + real vision EditPlan + ProductionJob + FFmpeg.
 * Only verified user-uploaded media. Never silently substitute missing AI/footage.
 */
import {randomUUID,createHash} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,readFile,readdir,rename,stat,writeFile,rm,copyFile} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {spawn} from 'node:child_process';
import {join,resolve,basename,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir,tmpdir} from 'node:os';
import {ProductionJob} from './persona_orchestrator.mjs';
import {getVisualPreset} from './persona-creative-director.mjs';
import {frameCandidates,validateEditPlan,editPlanProvider} from './persona-quick-edit-plan.mjs';
import {QUICK_RELOCATION_RECORD,validateQuickRelocation,rebindQuickTimeline} from './persona-quick-relocation.mjs';

/** No inference or fabricated emotion labels when Vision is unavailable. */
export function offlineEditPlan(videos){
 const candidates=frameCandidates(videos);
 if(candidates.length<2){
  const half=Number((videos[0].durationSec/2).toFixed(3));
  if(half<.25)throw Error('Для офлайн-монтажа требуется хотя бы полсекунды видео.');
  candidates.splice(0,candidates.length,
   {id:'offline-0',fileIndex:0,startSec:0,durationSec:half,stillSec:half/2,sourceSha256:videos[0].sha256},
   {id:'offline-1',fileIndex:0,startSec:half,durationSec:half,stillSec:half*1.5,sourceSha256:videos[0].sha256});
 }
 const first=candidates[0],second=candidates.find(c=>c.fileIndex!==first.fileIndex)||candidates[candidates.length-1];
 const plan=validateEditPlan({stylePack:'Commercial',creativeIntent:'Офлайн-черновик без Vision: последовательность проверенных исходных фрагментов. Выбор дублей и эмоций остаётся за автором.',
  choices:[first,second].map(c=>({candidateId:c.id,role:'actor',caption:''}))},candidates);
 return {...plan,mediaEvidence:'ffprobe-verified-offline-intervals',audioUnderstanding:'not_transcribed'};
}

/** Explicit author-selected format: protect speech and performance continuity. */
export const PERSONA_VIDEO_FORMATS=Object.freeze({
 auto:'Автоматический',explainer:'Экспертный',personal:'Личная история',
 dialogue:'Диалог / интервью',acting:'Актёрская сцена',music:'Музыкальный',
 cinematic:'Кинематографическая история',backstage:'Закулисье',voiceover:'Закадровый рассказ'
});
const CONTINUITY_FORMATS=new Set(['explainer','personal','dialogue','acting','music','voiceover']);
/** Keep complete, verified footage; never guess where a sentence can be cut. */
export function continuityEditPlan(videos,format){
 if(!CONTINUITY_FORMATS.has(format)||!Array.isArray(videos)||videos.length<1||videos.length>4)
  throw Error('Некорректный формат или количество исходников');
 if(videos.some(v=>!Number.isFinite(v.durationSec)||v.durationSec<8||v.durationSec>1200||
  typeof v.sha256!=='string'||!/^[a-f0-9]{64}$/.test(v.sha256)))
  throw Error('Нужны проверенные длительность и SHA-256 исходников');
 if(videos.reduce((n,v)=>n+v.durationSec,0)>75)
  throw Error('Бережный монтаж: суммарно больше 75 секунд. Выберите короткие дубли; речь обрезать автоматически нельзя.');
 const candidates=videos.length>1?videos.map((v,i)=>({
  id:'complete-'+i,fileIndex:i,startSec:0,durationSec:v.durationSec,stillSec:v.durationSec/2,sourceSha256:v.sha256
 })):[{id:'complete-0a',fileIndex:0,startSec:0,durationSec:videos[0].durationSec/2,
  stillSec:videos[0].durationSec/4,sourceSha256:videos[0].sha256},
  {id:'complete-0b',fileIndex:0,startSec:videos[0].durationSec/2,
   durationSec:videos[0].durationSec/2,stillSec:videos[0].durationSec*3/4,
   sourceSha256:videos[0].sha256}];
 const plan=validateEditPlan({stylePack:'Cinematic',
  creativeIntent:'Бережный монтаж: исходные фразы, паузы и музыка сохранены. Авторский просмотр обязателен.',
  choices:candidates.map(c=>({candidateId:c.id,role:'actor',caption:''}))},candidates);
 return {...plan,videoFormat:format,mediaEvidence:'ffprobe-verified-continuous-takes',
  audioUnderstanding:'not_transcribed',requiresHumanReview:true};
}

import {runSmartVision,makeSmartEditPlan} from './persona-smart-moments.mjs';
import {analyzeWhisperAudio,rankSpeechHighlights} from './persona-smart-audio.mjs';
import {defaultPersonaStrategy} from '../packages/core/src/persona-strategy.mjs';
import {burnPersonaSubtitles} from './persona-subtitle-burn.mjs';
import {analyzePersonaVideoQuality} from './persona-video-quality.mjs';
import {quickDirectorFrameSchedule,quickDirectorMoodToAppearance,selectQuickStyleFromVision} from './persona-quick-style-director.mjs';
import {classifyQuoteSpeech,cueFromWhisper,validateQuoteText,layoutQuoteForSignatureGold,quoteCue,generatePersonaQuote} from './persona-ai-quote.mjs';
import {inspectPhoto,normalizeCarouselSlides,renderPhotoCarousel,renderPhotoSlideshow,renderPlatformPackage} from './persona-quick-platforms.mjs';

const toolsDir=fileURLToPath(new URL('.',import.meta.url));
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const videoExt=new Set(['.mp4','.mov','.mkv','.webm','.m4v']);
const audioExt=new Set(['.mp3','.wav','.m4a','.aac','.flac']);
const photoExt=new Set(['.jpg','.jpeg','.png']);
const BYTES_MAX=500*1024*1024;
// Only already supported looks: Signature Gold changes subtitles, not color.
const QUICK_STYLES=Object.freeze({
 auto:{stylePack:null,subtitlePreset:'cinematic'},
 cinematic:{stylePack:'Cinematic',subtitlePreset:'cinematic'},
 dynamic:{stylePack:'Dynamic',subtitlePreset:'dynamic-interview'},
 'signature-gold':{stylePack:'Cinematic',subtitlePreset:'signature-gold'},
});
const QUICK_COLORS=new Set(['SoftCinematic','DetailCinematic']);
export function quickRenderAppearance({styleChoice='auto',colorPreset=null}={}){
 if(typeof styleChoice!=='string'||!Object.hasOwn(QUICK_STYLES,styleChoice))
  throw Error('Неизвестный стиль монтажа. Выберите Cinematic, Dynamic или Signature Gold.');
 if(colorPreset!==null&&(typeof colorPreset!=='string'||!QUICK_COLORS.has(colorPreset)))
  throw Error('Неизвестный цветовой пресет. Выберите Soft Cinematic или Detail Cinematic.');
 if(colorPreset)getVisualPreset(colorPreset); // exact authoritative FFmpeg preset
 return {styleChoice,colorPreset,...QUICK_STYLES[styleChoice]};
}
const resJson=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
const safeName=(value,kind)=>{
 if(typeof value!=='string'||value.length<3||value.length>240||/[\\/\x00-\x1f:]/.test(value)||
  !((kind==='video'?videoExt:kind==='photo'?photoExt:audioExt).has(extname(value).toLowerCase())))throw Error('Unsupported or unsafe media filename');
 return value;
};
const sha=async(path)=>{const hash=createHash('sha256');for await(const b of createReadStream(path))hash.update(b);return hash.digest('hex');};
async function verifyUploadedFiles(input,files){for(const f of files){if(await sha(join(input,f.name))!==f.sha256)throw Error('Uploaded source changed since intake');}}
const toFileName=(index,kind,original)=>kind+'-'+String(index+1).padStart(2,'0')+extname(original).toLowerCase();
export function quickRenderRoot(env=process.env){
 return resolve(env.PERSONA_QUICK_RENDER_ROOT||
  (process.platform==='win32'&&env.LOCALAPPDATA?join(env.LOCALAPPDATA,'LifeOS','Persona','quick-renders'):
   join(homedir(),'.life-os','persona','quick-renders')));
}
function mediaBin(name,config){
 return config.ffmpegDir?join(resolve(config.ffmpegDir),name+(process.platform==='win32'?'.exe':'')):name;
}
function workerEnv(config){
 const env={...process.env,...(config.apiEnv??{})};
 if(config.ffmpegDir){
  const key=Object.keys(env).find(x=>x.toLowerCase()==='path')||'PATH';
  env[key]=resolve(config.ffmpegDir)+(process.platform==='win32'?';':':')+(env[key]??'');
 }
 return env;
}
export function runBounded(command,args,{env=process.env,timeoutMs=60000,maxStdout=300000}={}){
 return new Promise((resolveJob,reject)=>{
  const child=spawn(command,args,{env,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
  const out=[],err=[];let total=0,errorText='';let finished=false;
  const timer=setTimeout(()=>{child.kill();finish(Error('Media processing step timed out'))},timeoutMs);
  function finish(error,output){if(finished)return;finished=true;clearTimeout(timer);error?reject(error):resolveJob(output);}
  child.stdout.on('data',b=>{total+=b.length;if(total>maxStdout){child.kill();finish(Error('Media evidence exceeded size limit'))}else out.push(b)});
  child.stderr.on('data',b=>{errorText=(errorText+b.toString()).slice(-1500)});
  child.on('error',()=>finish(Error('Required local processor is unavailable')));
  child.on('close',code=>code===0?finish(null,Buffer.concat(out)):finish(Error('Media processor failed (code '+code+'): '+errorText.slice(-300))));
 });
}
async function probe(file,config,{audioOnly=false,rendered=false}={}){
 const raw=await runBounded(mediaBin('ffprobe',config),['-v','error','-show_entries',
  'format=duration:stream=codec_type,width,height,color_transfer,color_primaries:stream_tags=rotate:stream_side_data=rotation',
  '-of','json',file],{env:workerEnv(config),timeoutMs:15000});
 let data;try{data=JSON.parse(raw.toString('utf8'))}catch{throw Error('FFprobe output invalid')}
 const durationSec=Number(data.format?.duration);
 if(!Number.isFinite(durationSec)||durationSec<(rendered?.25:audioOnly?.2:8)||durationSec>1200)throw Error('Длительность видео должна быть от 8 секунд до 20 минут. Для музыки достаточно 0,2 секунды. Проверьте выбранный файл.');
 const video=data.streams?.find(x=>x.codec_type==='video');
 if(audioOnly){if(!data.streams?.some(x=>x.codec_type==='audio'))throw Error('Music file has no audio stream');return {durationSec}}
 if(!video||!Number.isInteger(video.width)||!Number.isInteger(video.height))throw Error('Video stream is missing');
 if(['smpte2084','arib-std-b67'].includes(video.color_transfer)||
  String(video.color_primaries??'').startsWith('bt2020'))throw Error('Это видео в HDR/Dolby Vision. Для безопасной цветокоррекции сначала экспортируйте его копию в SDR (Rec.709), оригинал сохраните.');
 if(Number(video.tags?.rotate??0)!==0||video.side_data_list?.some(x=>Number(x.rotation??0)!==0))
  throw Error('У видео есть метаданные поворота. Сначала экспортируйте копию с правильной ориентацией кадра, чтобы автоматический монтаж не обрезал лицо.');
 return {durationSec,width:video.width,height:video.height,hasAudio:data.streams.some(x=>x.codec_type==='audio')};
}
async function jpegFrame(path,second,config){
 const raw=await runBounded(mediaBin('ffmpeg',config),
  ['-nostdin','-hide_banner','-loglevel','error','-ss',String(second),'-i',path,
   '-frames:v','1','-vf','scale=480:-2:force_original_aspect_ratio=decrease',
   '-q:v','7','-f','image2pipe','-vcodec','mjpeg','pipe:1'],
   {env:workerEnv(config),timeoutMs:30000,maxStdout:160000});
 if(raw.length<256||raw[0]!==0xff||raw[1]!==0xd8)throw Error('Unable to extract a valid video evidence frame');
 return raw;
}
async function atomicFile(path,value){
 const tmp=path+'.'+randomUUID()+'.tmp';
 try{await writeFile(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx'});await rename(tmp,path)}
 finally{await rm(tmp,{force:true}).catch(()=>{})}
}
function checkedJobId(id){if(!UUID.test(id))throw Error('Invalid quick render job ID');return id}
const decode=(value)=>typeof value==='string'?decodeURIComponent(value):'';
export function createPersonaQuickRenderService(config={}){
 const env=workerEnv(config);
 const root=resolve(config.quickRenderRoot||quickRenderRoot(env));
 const jobs=new Map();
 const inFlightUploads=new Set();
 let active=null;
 const directory=id=>join(root,'quick-'+checkedJobId(id));
 const metaFile=id=>join(directory(id),'quick-state.json');
 async function get(id){
  checkedJobId(id);
  const cached=jobs.get(id);
  let meta=cached;
  if(!meta){try{meta=JSON.parse(await readFile(metaFile(id),'utf8'))}catch{return null}}
  if(meta.id!==id||!Array.isArray(meta.files)||!Array.isArray(meta.uploads))return null;
  const production=new ProductionJob(directory(id));
  let canonical;try{canonical=await production.read()}catch{return null}
  // Crash recovery: a running job without its owning process is not falsely advertised as running.
  if(!cached&&!active&&['ANALYZING','EDITING','QUALITY_CHECK'].includes(canonical.status)){
   canonical=await production.markFailed('Локальный Worker перезапущен до проверки MP4. Начните новый монтаж; исходные файлы сохранены.');
  }
  // Never expose completed before the final quick-state card metadata is
  // committed. The canonical production record transitions first; on a live
  // Worker the final captionDecision/exportItems are saved shortly afterwards.
  // With no cached job (after restart), recovery trusts the persisted receipt.
  const pendingCardSave=Boolean(cached&&cached.state==='running'&&
   canonical.status==='AWAITING_APPROVAL');
  const state=canonical.status==='FAILED'?'failed':pendingCardSave?'running':
   canonical.status==='AWAITING_APPROVAL'?'completed':
   ['ANALYZING','EDITING','QUALITY_CHECK'].includes(canonical.status)?'running':
   meta.seedKey&&meta.files.length===0?'waiting_for_footage':'uploading';
  if(!cached&&!active&&canonical.fullRender?.status==='RENDERING')
   canonical=await production.updateFullRender('FAILED',{reason:'Worker перезапущен до проверки полноразмерного MP4. Черновик сохранён.'});
  const job={...meta,state,error:canonical.status==='FAILED'?canonical.failure?.message??'Ошибка обработки':null,
   fullRender:canonical.fullRender??null};
  // Worker restarts cannot leave an in-flight platform export indefinitely stuck.
  // Recover the package status without revoking the already verified master.
  if(!cached&&!active&&job.exportStatus==='RENDERING'){
   job.exportStatus='FAILED';
   job.exportError='Media Worker перезапущен во время подготовки пакета. Финальный MP4 сохранён; повторите экспорт.';
   await save(job);
  }
  if(state==='completed'&&(!job.sha256||!job.videoName)){
   try{const result=JSON.parse(await readFile(join(directory(id),'output','RESULT.json'),'utf8'));
    job.sha256=result.sha256;job.videoName=result.videoName;}catch{}
  }
  return job;
 }
 async function save(job){
  const view={...job};delete view.child;delete view.promise;
  jobs.set(job.id,view);
  // quick-state.json retains upload/UX metadata only. job.json owns lifecycle and failure.
  const disk={...view};delete disk.state;delete disk.error;delete disk.fullRender;
  await atomicFile(metaFile(job.id),disk);return view;
 }
 const view=job=>({id:job.id,title:job.title,state:job.state,stage:job.stage,
  uploaded:job.uploads.length,expected:job.files.length,error:job.error??null,
  uploadedIndices:job.uploads??[],seedKey:job.seedKey??null,
  goal:job.goal??null,slides:job.slides??null,createdAt:job.createdAt??null,
  productionStatus:job.state==='waiting_for_footage'?'WAITING_FOR_FOOTAGE':null,
  strategyStatus:job.strategyStatus??null,
  ready:job.state==='completed'&&typeof job.sha256==='string',idSource:'local-production-job',
  fastDraft:job.fastDraft===true,
  fullRenderStatus:job.fullRender?.status??null,fullRenderError:job.fullRender?.error??null,
  fullReady:job.fullRender?.status==='COMPLETED',finalQuality:job.finalQuality??null,
  moments:job.moments??[],
  autoStyle:job.autoStyle===true,styleDecision:job.styleDecision??null,
  textAccents:job.textAccents===true,captionDecision:job.captionDecision??null,
  contentType:job.contentType??'video',videoFormat:job.videoFormat??'auto',carouselAspect:job.carouselAspect??'4:5',
  carouselFiles:job.carouselFiles??[],exportStatus:job.exportStatus??null,
  exportError:job.exportError??null,exportItems:job.exportItems??[],
  styleChoice:job.appearance?.styleChoice??'auto',colorPreset:job.appearance?.colorPreset??null,
  notice:job.state==='completed'?(job.result?.visionAvailable===false?
   (job.result?.sparseUnqualified?'Редкий анализ Vision не подтвердил достаточно моментов: собран простой черновик без выдуманных оценок эмоций.':
    job.result?.visionAttempted?'Vision завершился ошибкой, кадры могли быть отправлены в OpenRouter до сбоя. Собран резервный монтаж без оценки эмоций.':
    'Офлайн-черновик: Vision не выполнялся, эмоциональные моменты не оценивались. Проверьте монтаж перед публикацией.'):
   'MP4 создан и технически проверен. Проверьте содержание перед публикацией.'):null});
 async function create(body){
  if(active!==null)throw Error('Another one-click render is currently running');
  if(!body||typeof body.prompt!=='string'||body.prompt.trim().length<3||body.prompt.length>600||
   body.consent!==true||!Array.isArray(body.files)||body.files.length<1||body.files.length>13)
   throw Error('Provide a short prompt, files and explicit vision processing consent');
  const contentType=body.contentType??'video';
  const videoFormat=body.videoFormat??'auto';
  if(typeof videoFormat!=='string'||!Object.hasOwn(PERSONA_VIDEO_FORMATS,videoFormat)||
    (contentType!=='video'&&videoFormat!=='auto'))throw Error('Неподдерживаемый формат монтажа');
  if(!['video','photo-carousel','photo-slideshow'].includes(contentType))throw Error('Unknown content type');
  const nv=body.files.filter(x=>x.kind==='video').length,np=body.files.filter(x=>x.kind==='photo').length,
   na=body.files.filter(x=>x.kind==='audio').length;
  if(contentType==='video'?(nv<1||nv>4||np!==0||na>1||nv+na!==body.files.length):
   (nv!==0||np<1||np>12||na>(contentType==='photo-slideshow'?1:0)||
   (contentType==='photo-slideshow'&&np<2)||np+na!==body.files.length))
   throw Error('Use 1–4 videos OR 1–12 photos; optional music only for videos and photo slideshows');
  const carouselAspect=body.carouselAspect??'4:5';
  if(!['4:5','1:1'].includes(carouselAspect))throw Error('Unsupported carousel aspect');
  if(body.coverTitle!==undefined&&(typeof body.coverTitle!=='string'||body.coverTitle.length>90))
   throw Error('Invalid cover title');
  if(body.coverTitle?.trim())layoutQuoteForSignatureGold(body.coverTitle.trim());
  if(body.slides!==undefined&&contentType!=='photo-carousel')
   throw Error('Per-slide captions only supported for photo carousels');
  const slides=contentType==='photo-carousel'?
   normalizeCarouselSlides(body.slides??null,np):null;
  const files=body.files.map((file,index)=>{
   const name=safeName(file.name,file.kind);
   if(!Number.isSafeInteger(file.size)||file.size<1024||file.size>BYTES_MAX)throw Error('File exceeds upload size limits');
   return {index,kind:file.kind,originalName:name,name:toFileName(index,file.kind,name),size:file.size};
  });
  if(files.reduce((n,f)=>n+f.size,0)>BYTES_MAX)throw Error('Total upload exceeds 500 MB');
  if(body.autoStyle!==undefined&&typeof body.autoStyle!=='boolean')throw Error('Invalid automatic style toggle');
  if(body.textAccents!==undefined&&typeof body.textAccents!=='boolean')throw Error('Invalid AI text accents toggle');
  const autoStyle=body.autoStyle===true; // legacy API calls preserve manual settings
  const appearance=quickRenderAppearance(autoStyle?{}:body); // validate user override only when selected
  // Vision is an optional enhancement. The offline timeline still creates a real MP4.
  await mkdir(root,{recursive:true});
  const id=randomUUID(),title=body.prompt.trim().slice(0,90);
  const production=await ProductionJob.create(directory(id),{title,strategy:defaultPersonaStrategy(),contentType});
  await production.transition('WAITING_FOR_FOOTAGE',{reason:'One-click files requested'});
  const job={version:1,id,title,prompt:body.prompt.trim(),state:'uploading',stage:'Загрузка',files,
   uploads:[],appearance,autoStyle,textAccents:body.textAccents===true,
   contentType,videoFormat,carouselAspect,coverTitle:body.coverTitle?.trim()??'',slides,
   fastDraft:contentType==='video'&&body.fastDraft===true,
   directFull:contentType!=='video'||body.fastDraft===false,
   createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceConsent:true};
  await save(job);
  return view(job);
 }
 /** Attach N actual photo files to an existing editorial-only seeded project.
  * This does not create another ProductionJob and does not change author copy.
  */
 async function attachSeedPhotos(id,body){
  const job=await get(id);
  if(!job||!job.seedKey||job.contentType!=='photo-carousel'||
   !['waiting_for_footage','uploading'].includes(job.state)||
   !Array.isArray(job.slides)||job.slides.length<3||job.slides.length>5)
   throw Error('Only an unrendered seeded carousel can receive photos');
  if(!body||!Array.isArray(body.files)||body.files.length!==job.slides.length)
   throw Error('Upload exactly one photo per planned slide, preserving order');
  const files=body.files.map((file,i)=>{
   if(file.kind!=='photo')throw Error('Only JPEG/PNG photographs allowed');
   const name=safeName(file.name,'photo');
   if(!Number.isSafeInteger(file.size)||file.size<1024||file.size>BYTES_MAX)
    throw Error('Photo size is invalid');
   return {index:i,kind:'photo',originalName:name,
    name:toFileName(i,'photo',name),size:file.size};
  });
  if(files.reduce((n,item)=>n+item.size,0)>BYTES_MAX)
   throw Error('Total photo size exceeds 500MB');
  if(job.files.length){
   if(JSON.stringify(job.files.map(x=>[x.index,x.kind,x.originalName,x.size]))!==
    JSON.stringify(files.map(x=>[x.index,x.kind,x.originalName,x.size])))
    throw Error('Photo manifest already attached; refusing to replace originals');
   return view(job); // resume partial upload using uploadedIndices
  }
  normalizeCarouselSlides(job.slides,files.length);
  job.files=files;job.state='uploading';job.sourceConsent=true;job.stage='Загрузка фотографий по слайдам';
  job.updatedAt=new Date().toISOString();await save(job);
  return view(job);
 }
 async function upload(id,index,req){
  const job=await get(id);
  if(!job||job.state!=='uploading'||!Number.isInteger(index)||index<0||index>=job.files.length||
   job.uploads.includes(index))throw Error('No upload expected for this slot');
  const entry=job.files[index],length=Number(req.headers['content-length']);
  if(!Number.isSafeInteger(length)||length!==entry.size)throw Error('Declared file length differs from selected file');
  const original=decode(req.headers['x-persona-original-name']);
  if(original!==entry.originalName)throw Error('Selected file identity changed during upload');
  const path=join(directory(id),'input',entry.name);
  const guard=id+':'+index;
  if(inFlightUploads.has(guard))throw Error('This media upload is already in progress');
  inFlightUploads.add(guard);
  let owned=false;
  try{
   const sink=createWriteStream(path,{flags:'wx'});
   sink.once('open',()=>{owned=true});
   await pipeline(req,sink);
   if((await stat(path)).size!==entry.size)throw Error('Загрузка файла прервалась. Выберите исходник и повторите попытку.');
   const media=entry.kind==='photo'?await inspectPhoto(path,{run:runBounded,ffmpegDir:config.ffmpegDir,env}):await probe(path,config,{audioOnly:entry.kind==='audio'});
   entry.sha256=await sha(path);
   entry.media=media;
   job.uploads.push(index);job.updatedAt=new Date().toISOString();await save(job);
   return {ok:true,index,sha256:entry.sha256};
  }catch(error){
   // Never delete a file owned by another concurrent uploader when O_EXCL failed.
   if(owned)await rm(path,{force:true}).catch(()=>{});
   throw error;
  }finally{inFlightUploads.delete(guard)}
 }
 async function executePhoto(job){
  const dir=directory(job.id),out=join(dir,'output'),input=join(dir,'input');
  const production=new ProductionJob(dir);
  try{
   await verifyUploadedFiles(input,job.files);
   const photos=job.files.filter(x=>x.kind==='photo');
   const sources=photos.map(x=>join(input,x.name));
   const music=job.files.find(x=>x.kind==='audio');
   const photoConfig={run:runBounded,ffmpegDir:config.ffmpegDir,env};
   let mood=null;
   if(job.autoStyle){
    job.stage='Director Agent: настроение фотографий';await save(job);
    const usable=photos.slice(0,5);
    if(usable.length>=3&&(config.quickStyleDirector||env.OPENROUTER_API_KEY?.trim())){
     try{
      const frames=usable.map((item,i)=>({id:'photo-'+i,fileIndex:i,atSec:0,sourceSha256:item.sha256}));
      const jpegs=await Promise.all(usable.map(item=>jpegFrame(join(input,item.name),0,config)));
      const classified=quickDirectorMoodToAppearance(config.quickStyleDirector
       ?await config.quickStyleDirector({frames,jpegs,prompt:job.prompt})
       :await selectQuickStyleFromVision({frames,jpegs,env}));
      job.appearance=quickRenderAppearance({styleChoice:classified.styleChoice,colorPreset:classified.colorPreset});
      mood=classified.mood;
      job.styleDecision={mode:config.quickStyleDirector?'test-injected':'ai',mood,
       reason:classified.reason,provider:config.quickStyleDirector?'test-injected':'openrouter',
       analyzedFrames:frames.length};
     }catch(error){
      job.appearance=quickRenderAppearance({styleChoice:'cinematic',colorPreset:'SoftCinematic'});
      job.styleDecision={mode:'fallback',mood:null,provider:'none',
       reason:'Photo Director unavailable: '+String(error.message||error).slice(0,120)};
     }
    }else{
     job.appearance=quickRenderAppearance({styleChoice:'cinematic',colorPreset:'SoftCinematic'});
     job.styleDecision={mode:'fallback',mood:null,provider:'none',
      reason:'Insufficient distinct photos or OpenRouter unavailable'};
    }
   }else job.styleDecision={mode:'manual',mood:null,provider:'none',reason:'User-selected visual preset'};
   job.stage='Фото: цвет и текстовые акценты';await save(job);
   let title=job.coverTitle||null;
   job.captionDecision={mode:'disabled',generatedText:null,reason:'Text accents disabled',requestCount:0};
   if(job.textAccents&&!title&&!job.slides){
    if(config.quickQuoteGenerator||env.OPENROUTER_API_KEY?.trim()){
     try{
      const quoted=config.quickQuoteGenerator?await config.quickQuoteGenerator({mood,prompt:job.prompt})
       :await generatePersonaQuote({mood,env});
      title=validateQuoteText(typeof quoted==='string'?quoted:quoted?.quote);
      layoutQuoteForSignatureGold(title);
      job.captionDecision={mode:'ai-quote',generatedText:title,
       reason:'Original image caption (not spoken)',source:config.quickQuoteGenerator?'test-injected':'openrouter',
       requestCount:config.quickQuoteGenerator?0:1};
     }catch(error){job.captionDecision={mode:'quote-unavailable',generatedText:null,
      reason:String(error.message||error).slice(0,150),requestCount:0};}
    }else job.captionDecision={mode:'quote-unavailable',generatedText:null,
     reason:'No OpenRouter key: original text was not generated',requestCount:0};
   }else if(job.textAccents&&job.slides){
    job.captionDecision={mode:'per-slide-author',generatedText:null,
     reason:'One-to-one author text for each uploaded photo; no AI quote requested',
     slideCount:job.slides.length,requestCount:0};
   }else if(job.textAccents&&title){
    title=validateQuoteText(title);
    job.captionDecision={mode:'author-title',generatedText:title,
     reason:'Title explicitly provided by author',requestCount:0};
   }
   await production.transition('EDITING',{reason:'Photo sources verified by FFprobe and SHA-256'});
   const colorPreset=job.appearance.colorPreset||'SoftCinematic';
   let result;
   if(job.contentType==='photo-carousel'){
    result=await renderPhotoCarousel({photos:sources,outputDir:out,aspect:job.carouselAspect,
     colorPreset,title,slides:job.slides??null,textAccents:job.textAccents,config:photoConfig});
    job.carouselFiles=result.photos.map(x=>({id:x.id,width:x.width,height:x.height,textOverlay:x.textOverlay,captionText:x.captionText}));
    job.exportItems=[{id:result.package.id,filename:result.package.file,sha256:result.package.sha256,
     bytes:result.package.bytes,kind:'zip'},...result.photos.map(x=>({id:x.id,filename:x.file,sha256:x.sha256,
     bytes:x.bytes,kind:'image',width:x.width,height:x.height}))];
    job.exportStatus='COMPLETED';job.sha256=result.package.sha256;
   }else{
    result=await renderPhotoSlideshow({photos:sources,music:music?join(input,music.name):null,
     outputDir:out,colorPreset,title,textAccents:job.textAccents,config:photoConfig});
    job.videoName='ready.mp4';job.sha256=result.sha256;job.exportItems=[];
   }
   await verifyUploadedFiles(input,job.files);
   await production.transition('QUALITY_CHECK',{reason:'Locally rendered photo outputs pass validation'});
   const receipt={version:1,id:job.id,contentType:job.contentType,...result,
    captionDecision:job.captionDecision,styleDecision:job.styleDecision,
    sourceShas:job.files.map(f=>f.sha256),publicationApproved:false,distributionAllowed:false};
   await atomicFile(join(out,'RESULT.json'),receipt);
   await production.transition('AWAITING_APPROVAL',{reason:'Photo outputs await human review'});
   job.state='completed';job.stage='Готово';job.result={visionAvailable:mood!==null,
    visualPreset:colorPreset,subtitlePreset:'signature-gold',hasCaptions:Boolean(job.textAccents&&(title||job.slides?.length))};
   await save(job);
  }catch(error){
   const message=String(error.message||error).replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]').slice(0,400);
   try{await production.markFailed(message)}catch{}
   job.state='failed';job.stage='Ошибка фото';job.error=message;await save(job);
  }finally{active=null}
 }
 async function execute(job){
  if(job.contentType!=='video')return executePhoto(job);
  const startedAt=Date.now();
  const id=job.id,dir=directory(id),out=join(dir,'output'),input=join(dir,'input');
  const production=new ProductionJob(dir);
  try{
   const vids=job.files.filter(f=>f.kind==='video');
   job.stage='Проверка идеи';await save(job);
   const payload={title:job.title,sourceIdea:job.prompt,strategy:defaultPersonaStrategy(),
    scenes:vids.map(f=>({line:'',action:'Загруженный оригинал '+f.originalName,durationSec:f.media.durationSec}))};
   const strategyInput=join(input,'strategy-input.json'),strategyOutput=join(out,'strategy-analysis.json');
   await writeFile(strategyInput,JSON.stringify(payload,null,2)+'\n',{flag:'wx'});
   if(config.quickStrategy){
    const audit=await config.quickStrategy(payload);
    if(!audit||!['PASS','WARNING','BLOCKED'].includes(audit.status)||typeof audit.recommendation!=='string')
     throw Error('Injected strategy audit invalid');
    await writeFile(strategyOutput,JSON.stringify({...audit,provider:'test-injected',publicationApproved:false},null,2));
   }else{
    const py=config.pythonBin||env.PERSONA_PYTHON|| (process.platform==='win32'?'python':'python3');
    if(job.fastDraft||!env.OPENROUTER_API_KEY?.trim()){ // Fast Draft skips optional strategic cloud requests
     await writeFile(strategyOutput,JSON.stringify({status:'WARNING',recommendation:'Нет облачного ключа: стратегический анализ пропущен, доступен офлайн-монтаж.',provider:'offline',publicationApproved:false}));
    }else{
     try{await runBounded(py,[join(toolsDir,'strategy_analyzer.py'),'--input',strategyInput,'--output',strategyOutput],
      {env,timeoutMs:120000,maxStdout:20000});}
     catch(error){await writeFile(strategyOutput,JSON.stringify({status:'WARNING',recommendation:'Облачный стратегический анализ недоступен: '+String(error.message||error).slice(0,120),provider:'offline',publicationApproved:false}));}
    }
   }
   const audit=JSON.parse(await readFile(strategyOutput,'utf8'));job.strategyStatus=audit.status;
   // Strategic BLOCKED is a review warning, not a prohibition on generating a private draft.
   // Publication remains disabled and the original finding is retained.
   const lightingPath=join(out,'lighting-plan.json');
   if(config.quickLighting){
    await writeFile(lightingPath,JSON.stringify(await config.quickLighting(job.prompt),null,2));
   }else if(job.fastDraft){
    await writeFile(lightingPath,JSON.stringify({status:'skipped',note:'Fast Draft skips optional lighting plan'}));
   }else{
    const py=config.pythonBin||env.PERSONA_PYTHON||(process.platform==='win32'?'python':'python3');
    try{await runBounded(py,[join(toolsDir,'lighting_planner.py'),'--scene',job.prompt,'--json','--output',lightingPath],
     {env,timeoutMs:15000,maxStdout:10000});}
    catch{await writeFile(lightingPath,JSON.stringify({status:'unavailable',note:'План света не обязателен для монтажа уже снятого видео.'}));}
   }
   const candidateInput=vids.map((f)=>({durationSec:f.media.durationSec,sha256:f.sha256}));
   // In Fast Draft, optional text accents explicitly opt in to a real local
   // Whisper attempt. Previously Fast Draft skipped ASR entirely. Unavailable
   // ASR is never silently interpreted as silence or a license to invent words.
   let accentAudio=null;
   if(job.textAccents){
    job.stage='Текстовые акценты: проверка речи Whisper';await save(job);
    accentAudio=[];
    for(const f of vids){
     const videoPath=join(input,f.name);
     try{
      accentAudio.push(await analyzeWhisperAudio({videoPath,durationSec:f.media.durationSec,
       hasAudio:f.media.hasAudio,whisperCli:config.whisperCli||env.PERSONA_MEDIA_WHISPER_CLI,
       whisperModel:config.whisperModel||env.PERSONA_MEDIA_WHISPER_MODEL,
       ffmpeg:mediaBin('ffmpeg',config),run:runBounded,env,
       asrOverride:config.quickAudioOverride||null}));
     }catch(error){
      accentAudio.push({status:'whisper-failed',segments:[],reason:String(error.message||error).slice(0,140)});
     }
    }
   }
   // One shared Fast Draft Vision deadline: 3–5 mood frames + sparse moment detection.
   // This prevents automatic styling from silently extending the cloud time budget.
   const visionDeadline=job.fastDraft?Date.now()+18000:null;
   const remainingVisionMs=()=>visionDeadline===null?null:Math.max(0,visionDeadline-Date.now());
   if(job.autoStyle){
    const hasVisionKey=Boolean(env.OPENROUTER_API_KEY?.trim());
    const injected=typeof config.quickStyleDirector==='function';
    if(injected||hasVisionKey){
     job.stage='Director Agent: настроение и стиль';await save(job);
     let frameSchedule=[],callStarted=false;
     try{
      frameSchedule=quickDirectorFrameSchedule(candidateInput);
      const frames=[];
      for(const ref of frameSchedule){
       if(remainingVisionMs()===0)throw Error('Fast Draft mood budget exhausted');
       frames.push(await jpegFrame(join(input,vids[ref.fileIndex].name),ref.atSec,config));
      }
      if(remainingVisionMs()===0)throw Error('Fast Draft mood budget exhausted');
      callStarted=true;
      const classified=injected?
       quickDirectorMoodToAppearance(await config.quickStyleDirector({
        frames:frameSchedule,jpegs:frames,prompt:job.prompt})):
       await selectQuickStyleFromVision({frames:frameSchedule,jpegs:frames,env,
        timeoutMs:Math.min(6500,remainingVisionMs()??6500)});
      job.appearance=quickRenderAppearance({
       styleChoice:classified.styleChoice,colorPreset:classified.colorPreset});
      job.styleDecision={version:1,mode:injected?'test-injected':'ai',
       mood:classified.mood,reason:classified.reason,
       provider:injected?'test-injected':'openrouter',
       model:injected?'fixture':classified.model,
       analyzedFrames:frameSchedule.length,requestCount:injected?0:1,
       attempted:true,sourceShas:vids.map(f=>f.sha256),
       ...(classified.evidenceSha256?{evidenceSha256:classified.evidenceSha256}:{})};
     }catch(error){
      job.appearance=quickRenderAppearance({styleChoice:'cinematic',colorPreset:'SoftCinematic'});
      job.styleDecision={version:1,mode:'fallback',mood:null,provider:hasVisionKey?'openrouter-attempted':'none',
       reason:'Director Agent недоступен: '+String(error.message||error).slice(0,140),
       analyzedFrames:frameSchedule.length,requestCount:callStarted&&!injected?null:0,
       attempted:callStarted&&hasVisionKey,sourceShas:vids.map(f=>f.sha256)};
     }
    }else{
     job.appearance=quickRenderAppearance({styleChoice:'cinematic',colorPreset:'SoftCinematic'});
     job.styleDecision={version:1,mode:'fallback',mood:null,provider:'none',
      reason:'Нет ключа OpenRouter: применён безопасный стиль Soft Cinematic / Cinematic без оценки настроения.',
      analyzedFrames:0,requestCount:0,attempted:false,sourceShas:vids.map(f=>f.sha256)};
    }
   }else{
    job.styleDecision={version:1,mode:'manual',mood:null,provider:'none',
     reason:'Стиль и цвет явно выбраны автором.',analyzedFrames:0,requestCount:0,
     attempted:false,sourceShas:vids.map(f=>f.sha256)};
   }
   await writeFile(join(out,'style-decision.json'),JSON.stringify(job.styleDecision,null,2)+'\n',{flag:'wx'});
   await save(job);
   let plan,provenance;
   if(CONTINUITY_FORMATS.has(job.videoFormat??'auto')&&!config.quickPlanner&&!config.quickVisionBatch){
    job.stage='Бережный монтаж: сохраняю полные дубли';await save(job);
    plan=continuityEditPlan(candidateInput,job.videoFormat);
    provenance={version:1,kind:'author-selected-continuity',provider:'none',visionAvailable:false,
     visionAttempted:false,sourceShas:vids.map(f=>f.sha256),rightsConfirmed:false,
     reason:'Формат указан автором; сохранены все интервалы источников.'};
   }else if(config.quickPlanner){
    // Legacy unit-test seam only: production selects via full 2fps Vision instead.
    job.stage='Тестовый редакторский план';await save(job);
    const candidates=frameCandidates(candidateInput),frames=[];
    for(const candidate of candidates)frames.push(await jpegFrame(join(input,vids[candidate.fileIndex].name),candidate.stillSec,config));
    const proposed=await config.quickPlanner({prompt:job.prompt,candidates,frames});
    plan=validateEditPlan(proposed,candidates);
    provenance={version:1,kind:'one-click-planning-evidence',provider:'test-injected',model:'test-only',
     sampleCount:frames.length,sourceShas:vids.map(f=>f.sha256),
     note:'Fixture-only candidate selection; no real Vision/Whisper inference.',rightsConfirmed:false};
   }else if(!config.quickVisionBatch&&!env.OPENROUTER_API_KEY?.trim()){
    job.stage='Офлайн-монтаж: Vision отключён';await save(job);
    plan=offlineEditPlan(candidateInput);
    provenance={version:1,kind:'offline-fallback',provider:'none',visionAvailable:false,
     reason:'OPENROUTER_API_KEY отсутствует; кадры не отправлялись в облако',visionAttempted:false,
     sourceShas:vids.map(f=>f.sha256),rightsConfirmed:false};
   }else{
    job.stage=job.fastDraft?'Fast Draft: редкие кадры':'Whisper: проверка речи';await save(job);
    const audio=[];
    if(accentAudio)audio.push(...accentAudio);
    else if(job.fastDraft){for(const f of vids)audio.push({status:'skipped-fast-draft',segments:[],reason:'Speech not examined in quick preview'})}
    else for(const f of vids){
     const videoPath=join(input,f.name);
     try{
      audio.push(await analyzeWhisperAudio({videoPath,durationSec:f.media.durationSec,
       hasAudio:f.media.hasAudio,whisperCli:config.whisperCli||env.PERSONA_MEDIA_WHISPER_CLI,
       whisperModel:config.whisperModel||env.PERSONA_MEDIA_WHISPER_MODEL,
       ffmpeg:mediaBin('ffmpeg',config),run:runBounded,env,
       asrOverride:config.quickAudioOverride||null}));
     }catch(error){
      audio.push({status:'whisper-failed',segments:[],reason:String(error.message||error).slice(0,140),
       meaning:'Speech presence/content unverified due to local Whisper failure'});
     }
    }
    const speechRanking=(config.quickVisionBatch||job.fastDraft)?{highlights:[],status:'skipped-fast-draft'}:
     await rankSpeechHighlights({audio,env}).catch(()=>({highlights:[],status:'unavailable'}));
    job.stage=job.fastDraft?'Vision: кадры каждые 2,5 с':'Vision: анализ каждые 0,5 с';await save(job);
    const vision=await runSmartVision({videos:candidateInput,intervalSec:job.fastDraft?2.5:.5,
     visionBudgetMs:job.fastDraft?remainingVisionMs():null,
     frameAt:async(frame)=>jpegFrame(join(input,vids[frame.fileIndex].name),frame.atSec,config),
     env,batchOverride:config.quickVisionBatch||null,
     onProgress:async(progress)=>{
      job.stage='Vision: '+progress.completedFrames+'/'+progress.totalFrames+' кадров';
      await save(job);
     }}).catch(error=>{
      if(config.quickVisionBatch)throw error; // test failures must remain visible
      return {unavailable:String(error.message||error).slice(0,200)};
     });
    if(vision.unavailable){
     job.stage='Vision недоступен — собираю офлайн-черновик';await save(job);
     plan=offlineEditPlan(candidateInput);
     provenance={version:1,kind:'offline-fallback',provider:'openrouter-attempted',visionAvailable:false,
      visionAttempted:true,reason:vision.unavailable,sourceShas:vids.map(f=>f.sha256),rightsConfirmed:false};
    }else{
    job.stage='Выбор эмоциональных пиков';await save(job);
    const ranked=audio.map((track,fileIndex)=>({...track,
     segments:track.segments.map(segment=>({...segment,
      emphasis:speechRanking.highlights.some(highlight=>highlight.fileIndex===fileIndex&&
       highlight.startSec<=segment.endSec&&highlight.endSec>=segment.startSec)?4:0}))}));
    let chosen;
    try{chosen=makeSmartEditPlan({prompt:job.prompt,videos:candidateInput,scored:vision.scored,
     audio:ranked,visionProvider:vision.provider,visionModel:vision.model,frameIntervalSec:vision.frameIntervalSec});}
    catch(error){
     if(!job.fastDraft)throw error;
     plan=offlineEditPlan(candidateInput);
     provenance={version:1,kind:'sparse-vision-unqualified',provider:vision.provider,model:vision.model,
      visionAttempted:true,visionAvailable:false,sampleCount:vision.frameCount,
      frameIntervalSec:vision.frameIntervalSec,visionRequests:vision.requests,
      reason:'Разреженный анализ не нашёл три независимых проверенных момента: '+String(error.message||error).slice(0,150),
      sourceShas:vids.map(f=>f.sha256),rightsConfirmed:false};
    }
    if(chosen){plan=chosen.plan;
    job.moments=chosen.moments.map(m=>({
     sourceName:vids[m.fileIndex].originalName,
     startSec:m.startSec,peakSec:m.stillSec,role:m.arcRole,emotion:m.emotion,
     reason:m.visualReason}));
    await save(job);
    const evidence={version:1,kind:'persona-smart-moment-evidence',prompt:job.prompt,
     frameIntervalSec:vision.frameIntervalSec,manualTimecodes:false,
     sourceVideos:vids.map(f=>({originalName:f.originalName,durationSec:f.media.durationSec,sha256:f.sha256})),
     vision:{provider:vision.provider,model:vision.model,requests:vision.requests,
      totalFrames:vision.frameCount,evidenceSha256:vision.evidenceSha256},
     frameAssessments:vision.scored,audio:ranked,highlightedSpeech:speechRanking.highlights,
     speechRankingStatus:speechRanking.status,selectedMoments:chosen.moments,
     limitations:['Visual ratings are model estimates, not measured acting quality',
      'Whisper transcript is fallible and not verbatim-verified',
      'Unavailable or failed Whisper means unknown speech, not absence of speech'],
     publicationApproved:false};
    await writeFile(join(out,'smart-moments.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
    provenance={version:2,kind:'smart-moment-evidence',provider:vision.provider,model:vision.model,
     sampleCount:vision.frameCount,frameIntervalSec:vision.frameIntervalSec,visionRequests:vision.requests,
     sourceShas:vids.map(f=>f.sha256),audioStatus:ranked.map(a=>a.status),
     speechRanking:speechRanking.status,evidenceSha256:vision.evidenceSha256,
     note:job.fastDraft?(job.textAccents?'Sparse 2.5s Vision; local Whisper attempted for optional text accents. See smart-moments.json.':'Sparse 2.5s Vision; no Whisper. See smart-moments.json.'):'Half-second Vision + optional local Whisper. See smart-moments.json.',
     rightsConfirmed:false};
    }
    }
   }
   const appearance=quickRenderAppearance(job.appearance);
   let accentCues=null;
   if(job.textAccents){
    const assessment=classifyQuoteSpeech(accentAudio);
    job.captionDecision={version:1,mode:assessment.mode,wordCount:assessment.wordCount,
     reason:assessment.reason,source:'local-whisper',generatedText:null,
     requestCount:0,authorReviewRequired:true};
    if(assessment.mode==='speech'){
     accentCues=cueFromWhisper({audio:accentAudio,choices:plan.choices});
     if(!accentCues.length){
      job.captionDecision.mode='speech-not-in-cut';
      job.captionDecision.reason='Whisper detected words, but no recognized phrase overlaps chosen edit windows';
     }
    }else if(assessment.mode==='quote'&&CONTINUITY_FORMATS.has(job.videoFormat??'auto')){
     job.captionDecision.mode='speech-unavailable';
     job.captionDecision.reason='В этом формате нельзя подменять речь выдуманной ИИ цитатой.';
    }else if(assessment.mode==='quote'){
     job.stage='AI Quote Generator: короткая оригинальная фраза';await save(job);
     if(config.quickQuoteGenerator||env.OPENROUTER_API_KEY?.trim()){
      try{
       const generated=config.quickQuoteGenerator
        ?await config.quickQuoteGenerator({mood:job.styleDecision?.mood??null,
         prompt:job.prompt,assessment})
        :await generatePersonaQuote({mood:job.styleDecision?.mood??null,env});
       const phrase=validateQuoteText(typeof generated==='string'?generated:generated?.quote);
       accentCues=quoteCue(phrase,plan.choices);
       job.captionDecision={...job.captionDecision,mode:'ai-quote',source:
        config.quickQuoteGenerator?'test-injected':'openrouter',generatedText:phrase,
        requestCount:config.quickQuoteGenerator?0:1,
        reason:'Original creative accent (not spoken text) based on mood '+(job.styleDecision?.mood??'unverified')};
      }catch(error){
       job.captionDecision={...job.captionDecision,mode:'quote-unavailable',
        source:config.quickQuoteGenerator?'test-injected':'openrouter-attempted',
        requestCount:env.OPENROUTER_API_KEY?.trim()&&!config.quickQuoteGenerator?null:0,
        reason:'Quote unavailable: '+String(error.message||error).slice(0,160)};
      }
     }else{
      job.captionDecision={...job.captionDecision,mode:'quote-unavailable',source:'none',
       reason:'OpenRouter key unavailable; no generated phrase was invented'};
     }
    }
    // Do not retain unverified editorial captions when there is a speech/quote
    // decision; they could be misread as dialogue from the source material.
    plan={...plan,choices:plan.choices.map(c=>({...c,caption:''})),
     audioUnderstanding:assessment.mode==='speech'?'whisper-transcribed':
      assessment.mode==='quote'&&!CONTINUITY_FORMATS.has(job.videoFormat??'auto')?'no-substantial-speech-confirmed':'speech-unverified'};
    await writeFile(join(out,'caption-decision.json'),JSON.stringify(job.captionDecision,null,2)+'\n',{flag:'wx'});
    await save(job);
   }
   // Model chooses verified intervals; the author's style choice takes precedence.
   if(appearance.stylePack)plan={...plan,stylePack:appearance.stylePack};
   await writeFile(join(out,'edit-plan.json'),JSON.stringify({...plan,provenance,
    appearance:{styleChoice:appearance.styleChoice,colorPreset:appearance.colorPreset,subtitlePreset:appearance.subtitlePreset},
    styleDecision:job.styleDecision,captionDecision:job.captionDecision??null},null,2)+'\n');
   await production.transition('EDITING',{reason:'Real provider or explicit test-fixture chose verified intervals'});
   job.stage='Монтаж FFmpeg';await save(job);
   await verifyUploadedFiles(input,job.files);
   const sources=plan.choices.map(c=>({
    path:join(input,vids[c.fileIndex].name),startSec:c.startSec,durationSec:c.durationSec,
    framing:{mode:'contain',position:{x:.5,y:.5}},
    preserveOriginalAudio:false,beat:c.order,
   }));
   const music=job.files.find(x=>x.kind==='audio');
   const timeline={version:1,width:job.directFull?1080:720,height:job.directFull?1920:1280,fps:job.fastDraft?24:30,
    ...(job.fastDraft?{renderProfile:'fast-draft'}:job.directFull?{renderProfile:'full-quality'}:{}),visualIdentity:'persona-visual-identity-v1',
    stylePack:plan.stylePack,
    ...(appearance.colorPreset?{visualPreset:appearance.colorPreset}:{}),clips:sources,
    ...(music?{soundtrack:{path:join(input,music.name),volume:.38,originalVolume:.74}}:{})};
   const timelinePath=join(out,'timeline.json'),draft=join(out,'edited.mp4');
   await writeFile(timelinePath,JSON.stringify(timeline,null,2)+'\n',{flag:'wx'});
   await production.transition('QUALITY_CHECK',{reason:'FFmpeg timeline render and source hash verification'});
   await runBounded(process.execPath,[join(toolsDir,'persona-timeline-render.mjs'),timelinePath,draft],
    {env:{...env,PERSONA_WORKER_RENDER:'1'},timeoutMs:720000,maxStdout:30000});
   let video=draft;
   const cues=accentCues??[];
   if(!job.textAccents){
    let offset=0;
    for(const clip of plan.choices){
     if(clip.caption){
      cues.push({startMs:Math.round(offset*1000),endMs:Math.round((offset+Math.min(clip.durationSec,3))*1000),
       text:clip.caption});
     }
     offset+=clip.durationSec;
    }
   }
   if(cues.length){
    const subtitle=join(out,'caption-review.json');
    await writeFile(subtitle,JSON.stringify({version:1,cues,
     captionTiming:job.textAccents?(job.captionDecision?.mode==='ai-quote'
      ?'ai-generated-original-not-spoken':'local-whisper-timed-not-verified')
      :'model_title_not_transcription',authorReviewRequired:true}));
    if(!job.fastDraft||job.textAccents){
     const finished=join(out,'ready.mp4');
     await burnPersonaSubtitles({videoPath:draft,reviewPath:subtitle,outputPath:finished,
      ffmpegDir:config.ffmpegDir,preset:appearance.subtitlePreset});
     video=finished;
    }
   }
   await verifyUploadedFiles(input,job.files);
   const outputHash=await sha(video),details=await probe(video,config,{rendered:true});
   const editPlanSha256=await sha(join(out,'edit-plan.json'));
   const timelineSha256=await sha(timelinePath);
   const result={version:1,status:'awaiting-author-review',distributionAllowed:false,
    publicationApproved:false,id,videoName:basename(video),sha256:outputHash,
    bytes:(await stat(video)).size,durationSec:details.durationSec,
    fastDraft:job.fastDraft===true,renderProfile:job.fastDraft?'fast-draft':job.directFull?'full-quality':'standard',
    width:details.width,height:details.height,editPlanSha256,timelineSha256,
    strategy:{status:audit.status,recommendation:audit.recommendation},
    stylePack:plan.stylePack,videoFormat:job.videoFormat??'auto',visualPreset:appearance.colorPreset,
    subtitlePreset:appearance.subtitlePreset,styleChoice:appearance.styleChoice,
    autoStyle:job.autoStyle===true,styleDecision:job.styleDecision,
    textAccents:job.textAccents===true,captionDecision:job.captionDecision??null,
    visionAttempted:Boolean(provenance.visionAttempted||provenance.kind==='smart-moment-evidence'),
    performance:{renderElapsedMs:Date.now()-startedAt,
     visionFrames:provenance.sampleCount??0,visionRequests:provenance.visionRequests??0,
     styleVisionFrames:job.styleDecision?.analyzedFrames??0,
     styleVisionRequests:job.styleDecision?.requestCount??null,
     quoteRequests:job.captionDecision?.requestCount??0,
     standardHalfSecondFrames:vids.reduce((n,f)=>n+Math.ceil(f.media.durationSec*2-1e-7),0),
     caveat:'Image volume is not a direct API cost measurement; pricing and network latency vary.'},
    hasMusic:Boolean(music),hasCaptions:(!job.fastDraft||job.textAccents)&&cues.length>0,
    captionsDeferred:job.fastDraft&&!job.textAccents&&cues.length>0,
    submittedToModel:(['offline-fallback','sparse-vision-unqualified','author-selected-continuity'].includes(provenance.kind))?
      (provenance.visionAttempted?'vision_attempted_not_verified':'none'):
     config.quickPlanner?'sampled_jpeg_frames_only':
      job.fastDraft?'sparse_2_5_second_jpeg_frames':'half_second_jpeg_frames_and_optional_text_transcript',
    smartMomentDetection:provenance.kind==='smart-moment-evidence',audioUnderstanding:plan.audioUnderstanding,
    broll:'only_user_uploaded_source_windows',
    technicalChecks:{video:true,sha256:true,sourceIntegrity:true}};
   await writeFile(join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
   await production.transition('AWAITING_APPROVAL',{reason:'Verified MP4, awaiting human review'});
   job.state='completed';job.stage='Готово';job.videoName=basename(video);job.sha256=outputHash;
   job.result={durationSec:details.durationSec,hasMusic:Boolean(music),hasCaptions:(!job.fastDraft||job.textAccents)&&cues.length>0,
    captionDecision:job.captionDecision??null,
    strategyStatus:audit.status,stylePack:plan.stylePack,visualPreset:appearance.colorPreset,
    subtitlePreset:appearance.subtitlePreset,styleChoice:appearance.styleChoice,
    styleDecision:job.styleDecision,
    visionAvailable:provenance.kind==='smart-moment-evidence'||provenance.kind==='one-click-planning-evidence',
    visionAttempted:Boolean(provenance.visionAttempted),
    visionFrames:provenance.sampleCount??0,renderElapsedMs:Date.now()-startedAt,
    sparseUnqualified:provenance.kind==='sparse-vision-unqualified'};job.updatedAt=new Date().toISOString();
   await save(job);
  }catch(error){
   job.stage='Ошибка';
   const message=String(error.message||error).replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]').slice(0,400);
   await production.markFailed(message);
   job.state='failed';job.error=message;
   job.updatedAt=new Date().toISOString();await save(job);
  }finally{active=null}
 }
 async function run(id){
  const job=await get(id);
  if(!job||job.state!=='uploading'||job.uploads.length!==job.files.length)
   throw Error('All files must finish uploading before auto-render');
  if(active!==null)throw Error('The local worker is already rendering another job');
  // Commit the authoritative state before acknowledging /run.
  const first=job.files.find(f=>f.kind==='video')||job.files.find(f=>f.kind==='photo');
  await new ProductionJob(directory(id)).transition('ANALYZING',{reason:'Verified source staged for rendering',
   asset:{name:first.name,sha256:first.sha256,durationSec:first.kind==='photo'?0:first.media.durationSec}});
  active=id;job.state='running';job.stage='Начинаю обработку';await save(job);
  void execute(job);return view(job);
 }
 /** Re-render a verified draft's immutable timeline at 1080x1920. No model, Vision,
  * Whisper, or strategic calls; original EditPlan and source hashes are checked again.
  */
 async function executeFull(job,{withPackage=false}={}){
  const id=job.id,dir=directory(id),out=join(dir,'output');
  const production=new ProductionJob(dir),started=Date.now();
  try{
   job.stage='1080p: проверка сохранённого плана';await save(job);
   const result=JSON.parse(await readFile(join(out,'RESULT.json'),'utf8'));
   if(result.id!==id||result.fastDraft!==true||!/^[a-f0-9]{64}$/.test(result.editPlanSha256)||
      !/^[a-f0-9]{64}$/.test(result.timelineSha256))
     throw Error('Полный экспорт требует подтверждённый Fast Draft и неизменённый план');
   if(result.editPlanSha256!==await sha(join(out,'edit-plan.json'))||
      result.timelineSha256!==await sha(join(out,'timeline.json')))
     throw Error('EditPlan или таймлайн изменился после черновика: повторный анализ не допускается');
   await verifyUploadedFiles(join(dir,'input'),job.files);
   const plan=JSON.parse(await readFile(join(out,'edit-plan.json'),'utf8'));
   const timeline=JSON.parse(await readFile(join(out,'timeline.json'),'utf8'));
   let originalJobDir=dir;
   try{
    const record=JSON.parse(await readFile(join(dir,QUICK_RELOCATION_RECORD),'utf8'));
    originalJobDir=validateQuickRelocation(record,{
     id,currentJobDir:dir,receiptSha256:await sha(join(out,'RESULT.json'))});
   }catch(error){if(error.code!=='ENOENT')throw error;}
   // Verify signed original source paths, then rebind only the derived full
   // timeline. edit-plan.json, timeline.json and RESULT.json remain immutable.
   const verifiedTimeline=rebindQuickTimeline({jobDir:dir,originalJobDir,
    files:job.files,plan,timeline});
   // Retry is allowed only after a recorded full-render failure; stale derivatives
   // are removed but the original draft and the verified edit plan are untouched.
   for(const filename of ['full-timeline.json','full-edited.mp4','full-edited.mp4.persona.json',
     'full-ready.mp4','RESULT-FULL.json','video-quality-full.json']){
    await rm(join(out,filename),{force:true});
   }
   await rm(join(out,'visual-evidence-video-quality-full'),{recursive:true,force:true});
   const fullTimeline={...verifiedTimeline,width:1080,height:1920,fps:30,renderProfile:'full-quality'};
   const fullTimelinePath=join(out,'full-timeline.json');
   await writeFile(fullTimelinePath,JSON.stringify(fullTimeline,null,2)+'\n',{flag:'wx'});
   job.stage='1080p: локальный FFmpeg (без Vision)';await save(job);
   const fullDraft=join(out,'full-edited.mp4');
   await runBounded(process.execPath,[join(toolsDir,'persona-timeline-render.mjs'),fullTimelinePath,fullDraft],{
    env:{...env,PERSONA_WORKER_RENDER:'1'},timeoutMs:900000,maxStdout:30000});
   let video=fullDraft,hasCaptions=false;
   const reviewPath=join(out,'caption-review.json');
   const review=await readFile(reviewPath,'utf8').then(JSON.parse).catch(error=>{
    if(error.code==='ENOENT')return null;
    throw error;
   });
   if(review?.cues?.length){
    video=join(out,'full-ready.mp4');
    await burnPersonaSubtitles({videoPath:fullDraft,reviewPath,outputPath:video,
      ffmpegDir:config.ffmpegDir,preset:quickRenderAppearance(job.appearance).subtitlePreset});
    hasCaptions=true;
   }
   await verifyUploadedFiles(join(dir,'input'),job.files);
   const details=await probe(video,config,{rendered:true});
   if(details.width!==1080||details.height!==1920)
    throw Error('Финальный экспорт не достиг разрешения 1080×1920');
   const hash=await sha(video),bytes=(await stat(video)).size;
   // Run the existing Video Quality Lab against the actual, final 1080p MP4.
   // Findings are local measurements, NOT creative quality approval.
   const qualityPath=join(out,'video-quality-full.json');
   try{
    job.stage='1080p: проверяю кадры, звук и цвет';await save(job);
    const quality=await analyzePersonaVideoQuality({
     videoPath:video,expectedDurationSec:details.durationSec,outputPath:qualityPath,
     ffmpegDir:config.ffmpegDir,timelinePath:join(out,'full-edited.mp4.persona.json'),
     timelineSourceVideoPath:fullDraft,
     ...(hasCaptions?{
      subtitleBurnManifestPath:video+'.persona-subtitles.json',
      subtitleReviewPath:reviewPath,
     }:{})});
    if(quality.video.sha256!==hash)throw Error('Video Quality Lab проверил не тот MP4');
    const warnings=quality.findings.filter(item=>item.status==='warning');
    const contact=quality.visualEvidence?.contactSheetPath;
    job.finalQuality={status:'REVIEW_REQUIRED',videoSha256:hash,
     reportSha256:await sha(qualityPath),contactSheetSha256:contact?await sha(contact):null,
     warnings:warnings.map(item=>({id:item.id,title:item.title,timecodes:item.timecodes??[]})).slice(0,30),
     notMeasuredCount:quality.findings.filter(item=>item.status==='not_measured').length};
    await save(job);
    if(quality.findings.some(item=>item.id==='decode_integrity'&&item.status==='warning'))
     throw Error('MP4 не прошёл полное декодирование: экспорт остановлен, проверь файл вручную');
   }catch(error){
    if(job.finalQuality?.status==='REVIEW_REQUIRED')throw error;
    job.finalQuality={status:'UNAVAILABLE',videoSha256:hash,reason:String(error.message||error).slice(0,250)};
    await save(job);
    // Do not misrepresent unavailable QC as PASS; author must check the MP4.
   }
   const receipt={version:1,status:'awaiting-author-review',distributionAllowed:false,
    id,videoName:basename(video),sha256:hash,bytes,width:1080,height:1920,
    durationSec:details.durationSec,hasCaptions,renderProfile:'full-quality',
    reusedEditPlanSha256:result.editPlanSha256,reusedTimelineSha256:result.timelineSha256,
    visionRequests:0,cloudCalls:0,renderElapsedMs:Date.now()-started};
   await atomicFile(join(out,'RESULT-FULL.json'),receipt);
   const canonical=await production.updateFullRender('COMPLETED',{
    reason:'Verified 1080p MP4 from unchanged author EditPlan; zero new Vision calls',
    videoName:basename(video),sha256:hash,bytes});
   job.fullRender=canonical.fullRender;job.stage='Полный MP4 готов';await save(job);
   if(withPackage){
    // Both deliverables are requested by one explicit click after draft review.
    // Keep active=id throughout; platform variants are not author-approved.
    job.exportStatus='RENDERING';job.exportError=null;
    job.stage='1080p готов · готовлю платформенные версии';await save(job);
    await executePackage(job);
   }
  }catch(error){
   const message=String(error.message||error).replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]').slice(0,400);
   try{job.fullRender=(await production.updateFullRender('FAILED',{reason:message})).fullRender}
   catch(persistError){console.error('Persona: cannot persist full render failure',persistError)}
   job.stage='1080p: ошибка';await save(job);
  }finally{active=null}
 }
 async function promote(id,{withPackage=false}={}){
  const job=await get(id);
  if(!job||job.state!=='completed'||job.fastDraft!==true||!job.sha256)
   throw Error('Сначала создайте и проверьте быстрый MP4-черновик');
  if(job.fullRender?.status==='COMPLETED')return view(job);
  if(job.fullRender?.status==='RENDERING'||active!==null)
   throw Error('Локальный Worker уже выполняет рендер');
  const receipt=await new ProductionJob(directory(id)).updateFullRender('RENDERING',{
   reason:'1080p export reuses stored author EditPlan; cloud analysis disabled'});
  active=id;job.fullRender=receipt.fullRender;job.finalQuality=null;job.stage='Начинаю 1080p';await save(job);
  void executeFull(job,{withPackage});return view(job);
 }
 async function video(id,res,quality='draft'){
  const job=await get(id);
  if(!job||job.state!=='completed')throw Error('Verified MP4 not available');
  const full=quality==='full',receipt=full?job.fullRender:job;
  if(full&&receipt?.status!=='COMPLETED')throw Error('1080p MP4 ещё не готов');
  if(!receipt||typeof receipt.sha256!=='string'||!(full?
   ['full-edited.mp4','full-ready.mp4']:['edited.mp4','ready.mp4']).includes(receipt.videoName))
   throw Error('Verified MP4 not available');
  const path=join(directory(id),'output',receipt.videoName);
  if((await sha(path))!==receipt.sha256)throw Error('MP4 checksum does not match verified result');
  const size=(await stat(path)).size;
  res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':size,
   'Content-Disposition':'attachment; filename="persona-'+id+(full?'-1080p':'-draft')+'.mp4"',
   'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  createReadStream(path).pipe(res);
 }
 async function executePackage(job){
  const out=join(directory(job.id),'output'),input=join(directory(job.id),'input');
  try{
   await verifyUploadedFiles(input,job.files);
   const receipt=job.fullRender?.status==='COMPLETED'?job.fullRender:job;
   const source=join(out,receipt.videoName);
   if(await sha(source)!==receipt.sha256)throw Error('Verified master SHA-256 mismatch');
   const media=await probe(source,config,{rendered:true});
   if(media.width!==1080||media.height!==1920)throw Error('Platform exports require 1080×1920 master');
   const target=join(out,'platform-package');
   await rm(target,{recursive:true,force:true});
   const title=job.coverTitle||job.captionDecision?.generatedText||'Новый ролик';
   const result=await renderPlatformPackage({videoPath:source,outputDir:target,
    title,colorPreset:job.appearance?.colorPreset||'SoftCinematic',durationSec:media.durationSec,
    config:{run:runBounded,ffmpegDir:config.ffmpegDir,env}});
   job.exportItems=result.entries.map(e=>({id:e.id,filename:e.file,sha256:e.sha256,
    bytes:e.bytes,width:e.width,height:e.height,kind:e.id==='cover'?'image':'video'}));
   await atomicFile(join(target,'EXPORTS.json'),result);
   await verifyUploadedFiles(input,job.files);
   job.exportStatus='COMPLETED';job.exportError=null;job.stage='Пакет для соцсетей готов';
  }catch(error){
   job.exportStatus='FAILED';job.exportError=String(error.message||error).slice(0,250);
   job.stage='Ошибка экспорта для соцсетей';
  }finally{active=null;await save(job)}
 }
 async function preparePackage(id){
  const job=await get(id);
  if(!job||job.state!=='completed'||job.contentType==='photo-carousel')
   throw Error('Platform video export requires a finished video or photo slideshow');
  if(job.fastDraft&&job.contentType==='video'&&job.fullRender?.status!=='COMPLETED')
   throw Error('Сначала получите проверенную версию 1080p');
  if(job.exportStatus==='COMPLETED')return view(job);
  if(job.exportStatus==='RENDERING'||active!==null)throw Error('Worker already exporting');
  active=id;job.exportStatus='RENDERING';job.exportError=null;
  job.stage='Готовлю платформенные файлы';await save(job);
  void executePackage(job);return view(job);
 }
 async function qualityArtifact(id,kind,res){
  if(!['report','contact-sheet'].includes(kind))throw Error('Unknown quality artifact');
  const job=await get(id);
  if(!job||job.state!=='completed'||job.fullRender?.status!=='COMPLETED'||
     job.finalQuality?.status!=='REVIEW_REQUIRED'||
     job.finalQuality.videoSha256!==job.fullRender.sha256)
   throw Error('Full-quality evidence is not available');
  const out=join(directory(id),'output'),reportPath=join(out,'video-quality-full.json');
  // The report also becomes stale if its referenced master was changed.
  if(!['full-edited.mp4','full-ready.mp4'].includes(job.fullRender.videoName)||
    await sha(join(out,job.fullRender.videoName))!==job.fullRender.sha256)
   throw Error('Final MP4 checksum mismatch: quality evidence is stale');
  if(await sha(reportPath)!==job.finalQuality.reportSha256)
   throw Error('Quality report checksum mismatch');
  const report=JSON.parse(await readFile(reportPath,'utf8'));
  if(report.kind!=='persona-video-quality-v1'||report.video?.sha256!==job.fullRender.sha256||
     report.publicationApproved!==false||report.distributionAllowed!==false)
   throw Error('Quality report does not match final MP4');
  const file=kind==='report'?reportPath:join(out,'visual-evidence-video-quality-full','contact-sheet.jpg');
  if(kind==='contact-sheet'&&(!job.finalQuality.contactSheetSha256||
     await sha(file)!==job.finalQuality.contactSheetSha256))
   throw Error('Quality contact sheet checksum mismatch');
  const size=(await stat(file)).size;
  res.writeHead(200,{'Content-Type':kind==='report'?'application/json':'image/jpeg','Content-Length':size,
   'Content-Disposition':'attachment; filename="persona-'+id+(kind==='report'?'-quality-report.json':'-quality-contact-sheet.jpg')+'"',
   'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  createReadStream(file).pipe(res);
 }
 async function exported(id,slug,res){
  const job=await get(id);
  if(!job||job.state!=='completed'||job.exportStatus!=='COMPLETED')
   throw Error('Exports not ready');
  const chosen=job.exportItems?.find(e=>e.id===slug);
  if(!chosen||!/^([a-z0-9-]+)\.(mp4|png|zip)$/.test(chosen.filename))
   throw Error('Unknown export artifact');
  const dir=job.contentType==='photo-carousel'?join(directory(id),'output'):
   join(directory(id),'output','platform-package');
  const path=join(dir,chosen.filename);
  if(await sha(path)!==chosen.sha256||(await stat(path)).size!==chosen.bytes)
   throw Error('Export checksum mismatch');
  const ext=chosen.kind==='zip'?'.zip':chosen.kind==='image'?'.png':'.mp4';
  res.writeHead(200,{'Content-Type':chosen.kind==='zip'?'application/zip':
   chosen.kind==='image'?'image/png':'video/mp4','Content-Length':chosen.bytes,
   'Content-Disposition':'attachment; filename="persona-'+slug+'-'+id+ext+'"',
   'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  createReadStream(path).pipe(res);
 }
 async function list(){
  await mkdir(root,{recursive:true});
  const entries=(await readdir(root,{withFileTypes:true})).filter(x=>x.isDirectory()&&/^quick-[0-9a-f-]{36}$/.test(x.name)).slice(-100);
  const result=[];
  for(const x of entries){const id=x.name.slice(6),job=await get(id);if(job)result.push(view(job))}
  result.sort((a,b)=>a.seedKey&&b.seedKey?a.seedKey.localeCompare(b.seedKey):
   a.seedKey?-1:b.seedKey?1:String(b.createdAt??'').localeCompare(String(a.createdAt??'')));
  return result.slice(0,40);
 }
 async function handle(req,res,url){
  if(!url.pathname.startsWith('/quick-render'))return false;
  const path=url.pathname;
  try{
   if(req.method==='GET'&&path==='/quick-render'){resJson(res,200,{jobs:await list()});return true}
   if(req.method==='POST'&&path==='/quick-render'){
    const chunks=[];let size=0;
    for await(const data of req){size+=data.length;if(size>12000)throw Error('Quick render request too large');chunks.push(data)}
    let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Error('Invalid quick render JSON')}
    resJson(res,201,await create(body));return true;
   }
   const matched=/^\/quick-render\/([0-9a-f-]{36})(?:\/(upload\/(\d+)|run|status|video|video-full|render-full|attach-photos|export-package|quality-report|quality-contact-sheet|export\/([a-z0-9-]+)))?$/.exec(path);
   if(!matched){resJson(res,404,{error:'unknown_quick_render_route'});return true}
   const id=checkedJobId(matched[1]),action=matched[2];
   if(req.method==='GET'&&action==='status'){
    const job=await get(id);resJson(res,job?200:404,job?view(job):{error:'not_found'});return true;
   }
   if(req.method==='POST'&&action==='attach-photos'){
    const parts=[];let size=0;
    for await(const data of req){size+=data.length;if(size>12000)throw Error('Photo manifest too large');parts.push(data)}
    let body;try{body=JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{throw Error('Invalid photo manifest')}
    resJson(res,200,await attachSeedPhotos(id,body));return true;
   }
   if(req.method==='PUT'&&action?.startsWith('upload/')){
    resJson(res,200,await upload(id,Number(matched[3]),req));return true;
   }
   if(req.method==='POST'&&action==='run'){resJson(res,202,await run(id));return true}
   if(req.method==='POST'&&action==='render-full'){
    const withPackage=url.searchParams.get('withPackage');
    if(withPackage!==null&&withPackage!=='1')throw Error('Unsupported full-render package option');
    resJson(res,202,await promote(id,{withPackage:withPackage==='1'}));return true;
   }
   if(req.method==='POST'&&action==='export-package'){resJson(res,202,await preparePackage(id));return true}
   if(req.method==='GET'&&action?.startsWith('export/')){await exported(id,matched[4],res);return true}
   if(req.method==='GET'&&action==='video'){await video(id,res);return true}
   if(req.method==='GET'&&action==='video-full'){await video(id,res,'full');return true}
   if(req.method==='GET'&&action==='quality-report'){await qualityArtifact(id,'report',res);return true}
   if(req.method==='GET'&&action==='quality-contact-sheet'){await qualityArtifact(id,'contact-sheet',res);return true}
   resJson(res,405,{error:'method_not_allowed'});return true;
  }catch(error){resJson(res,400,{error:String(error.message||error).slice(0,400)});return true}
 }
 return {root,create,attachSeedPhotos,upload,run,promote,preparePackage,get,view,list,handle};
}
