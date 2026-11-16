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
import {frameCandidates,selectEditPlan,validateEditPlan,editPlanProvider} from './persona-quick-edit-plan.mjs';
import {defaultPersonaStrategy} from '../packages/core/src/persona-strategy.mjs';
import {burnPersonaSubtitles} from './persona-subtitle-burn.mjs';

const toolsDir=fileURLToPath(new URL('.',import.meta.url));
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const videoExt=new Set(['.mp4','.mov','.mkv','.webm','.m4v']);
const audioExt=new Set(['.mp3','.wav','.m4a','.aac','.flac']);
const BYTES_MAX=500*1024*1024;
const resJson=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
const safeName=(value,kind)=>{
 if(typeof value!=='string'||value.length<3||value.length>240||/[\\/\x00-\x1f:]/.test(value)||
  !((kind==='video'?videoExt:audioExt).has(extname(value).toLowerCase())))throw Error('Unsupported or unsafe media filename');
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
  child.stdout.on('data',b=>{total+=b.length;if(total>maxStdout)finish(Error('Media evidence exceeded size limit'));else out.push(b)});
  child.stderr.on('data',b=>{errorText=(errorText+b.toString()).slice(-1500)});
  child.on('error',()=>finish(Error('Required local processor is unavailable')));
  child.on('close',code=>code===0?finish(null,Buffer.concat(out)):finish(Error('Media processor failed (code '+code+'): '+errorText.slice(-300))));
 });
}
async function probe(file,config,{audioOnly=false}={}){
 const raw=await runBounded(mediaBin('ffprobe',config),['-v','error','-show_entries',
  'format=duration:stream=codec_type,width,height,color_transfer,color_primaries:stream_tags=rotate:stream_side_data=rotation',
  '-of','json',file],{env:workerEnv(config),timeoutMs:15000});
 let data;try{data=JSON.parse(raw.toString('utf8'))}catch{throw Error('FFprobe output invalid')}
 const durationSec=Number(data.format?.duration);
 if(!Number.isFinite(durationSec)||durationSec<(audioOnly?.2:8)||durationSec>1200)throw Error('Input duration must be '+(audioOnly?'0.2–1200':'8–1200')+' seconds');
 const video=data.streams?.find(x=>x.codec_type==='video');
 if(audioOnly){if(!data.streams?.some(x=>x.codec_type==='audio'))throw Error('Music file has no audio stream');return {durationSec}}
 if(!video||!Number.isInteger(video.width)||!Number.isInteger(video.height))throw Error('Video stream is missing');
 if(['smpte2084','arib-std-b67'].includes(video.color_transfer)||
  String(video.color_primaries??'').startsWith('bt2020'))throw Error('HDR/BT.2020 source needs manual SDR conversion');
 if(Number(video.tags?.rotate??0)!==0||video.side_data_list?.some(x=>Number(x.rotation??0)!==0))
  throw Error('Rotated source requires manual normalization before automatic cropping');
 return {durationSec,width:video.width,height:video.height};
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
 let active=null;
 const directory=id=>join(root,'quick-'+checkedJobId(id));
 const metaFile=id=>join(directory(id),'quick-state.json');
 async function get(id){
  checkedJobId(id);
  if(jobs.has(id))return jobs.get(id);
  let meta;
  try{meta=JSON.parse(await readFile(metaFile(id),'utf8'))}catch{return null}
  if(meta.id!==id||!['uploading','running','completed','failed','interrupted'].includes(meta.state))return null;
  if(meta.state==='running')meta={...meta,state:'interrupted',error:'Local Worker restarted before MP4 verification. Re-create this one-click job.'};
  return meta;
 }
 async function save(job){const view={...job};delete view.child;delete view.promise;jobs.set(job.id,view);await atomicFile(metaFile(job.id),view);return view}
 const view=job=>({id:job.id,title:job.title,state:job.state,stage:job.stage,
  uploaded:job.uploads.length,expected:job.files.length,error:job.error??null,
  strategyStatus:job.strategyStatus??null,
  ready:job.state==='completed'&&typeof job.sha256==='string',idSource:'local-production-job',
  notice:job.state==='completed'?'MP4 создан и технически проверен. Проверьте содержание перед публикацией.':null});
 async function create(body){
  if(active!==null)throw Error('Another one-click render is currently running');
  if(!body||typeof body.prompt!=='string'||body.prompt.trim().length<3||body.prompt.length>600||
   body.consent!==true||!Array.isArray(body.files)||body.files.length<1||body.files.length>5)
   throw Error('Provide a short prompt, files and explicit vision processing consent');
  const countVideo=body.files.filter(x=>x.kind==='video').length;
  if(countVideo<1||countVideo>4||body.files.filter(x=>x.kind==='audio').length>1)
   throw Error('Use 1–4 videos and at most one optional original music file');
  const files=body.files.map((file,index)=>{
   const name=safeName(file.name,file.kind);
   if(!Number.isSafeInteger(file.size)||file.size<1024||file.size>BYTES_MAX)throw Error('File exceeds upload size limits');
   return {index,kind:file.kind,originalName:name,name:toFileName(index,file.kind,name),size:file.size};
  });
  if(files.reduce((n,f)=>n+f.size,0)>BYTES_MAX)throw Error('Total upload exceeds 500 MB');
  if(!config.quickPlanner)editPlanProvider(env); // fail before copying any private media
  await mkdir(root,{recursive:true});
  const id=randomUUID(),title=body.prompt.trim().slice(0,90);
  const production=await ProductionJob.create(directory(id),{title,strategy:defaultPersonaStrategy()});
  await production.transition('WAITING_FOR_FOOTAGE',{reason:'One-click files requested'});
  const job={version:1,id,title,prompt:body.prompt.trim(),state:'uploading',stage:'Загрузка',files,
   uploads:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceConsent:true};
  await save(job);
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
  try{
   await pipeline(req,createWriteStream(path,{flags:'wx'}));
   if((await stat(path)).size!==entry.size)throw Error('Upload was incomplete');
   const media=await probe(path,config,{audioOnly:entry.kind==='audio'});
   entry.sha256=await sha(path);
   entry.media=media;
   job.uploads.push(index);job.updatedAt=new Date().toISOString();await save(job);
   return {ok:true,index,sha256:entry.sha256};
  }catch(error){
   await rm(path,{force:true}).catch(()=>{});
   throw error;
  }
 }
 async function execute(job){
  const id=job.id,dir=directory(id),out=join(dir,'output'),input=join(dir,'input');
  const production=new ProductionJob(dir);
  try{
   const vids=job.files.filter(f=>f.kind==='video');
   const first=vids[0];
   await production.transition('ANALYZING',{reason:'Real user video staged',asset:{
    name:first.name,sha256:first.sha256,durationSec:first.media.durationSec}});
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
    await runBounded(py,[join(toolsDir,'strategy_analyzer.py'),'--input',strategyInput,'--output',strategyOutput],
     {env,timeoutMs:120000,maxStdout:20000});
   }
   const audit=JSON.parse(await readFile(strategyOutput,'utf8'));job.strategyStatus=audit.status;
   // Strategic BLOCKED is a review warning, not a prohibition on generating a private draft.
   // Publication remains disabled and the original finding is retained.
   const lightingPath=join(out,'lighting-plan.json');
   if(config.quickLighting){
    await writeFile(lightingPath,JSON.stringify(await config.quickLighting(job.prompt),null,2));
   }else{
    const py=config.pythonBin||env.PERSONA_PYTHON||(process.platform==='win32'?'python':'python3');
    await runBounded(py,[join(toolsDir,'lighting_planner.py'),'--scene',job.prompt,'--json','--output',lightingPath],
     {env,timeoutMs:15000,maxStdout:10000});
   }
   job.stage='Анализ кадров';await save(job);
   const candidateInput=vids.map((f)=>({durationSec:f.media.durationSec,sha256:f.sha256}));
   const candidates=frameCandidates(candidateInput);
   if(candidates.length<2)throw Error('At least two distinct real video intervals are required');
   const frames=[];
   for(const candidate of candidates)frames.push(await jpegFrame(join(input,vids[candidate.fileIndex].name),candidate.stillSec,config));
   job.stage='Редакторский план';await save(job);
   const proposed=config.quickPlanner
    ?await config.quickPlanner({prompt:job.prompt,candidates,frames})
    :await selectEditPlan({prompt:job.prompt,candidates,frames,env});
   const plan=validateEditPlan(proposed,candidates);
   const provenance={
    version:1,kind:'one-click-planning-evidence',
    provider:config.quickPlanner?'test-injected':proposed.provider,model:config.quickPlanner?'test-only':proposed.model,
    sampleCount:frames.length,sourceShas:vids.map(f=>f.sha256),
    note:'Model only saw sampled stills and timing metadata; not motion, speech, or full audio.',
    rightsConfirmed:false};
   await writeFile(join(out,'edit-plan.json'),JSON.stringify({...plan,provenance},null,2)+'\n',{flag:'wx'});
   await production.transition('EDITING',{reason:'Real provider or explicit test-fixture chose verified intervals'});
   job.stage='Монтаж FFmpeg';await save(job);
   await verifyUploadedFiles(input,job.files);
   const sources=plan.choices.map(c=>({
    path:join(input,vids[c.fileIndex].name),startSec:c.startSec,durationSec:c.durationSec,
    framing:{mode:'contain',position:{x:.5,y:.5}},
    preserveOriginalAudio:false,beat:c.order,
   }));
   const music=job.files.find(x=>x.kind==='audio');
   const timeline={version:1,width:720,height:1280,fps:30,visualIdentity:'persona-visual-identity-v1',
    stylePack:plan.stylePack,clips:sources,
    ...(music?{soundtrack:{path:join(input,music.name),volume:.38,originalVolume:.74}}:{})};
   const timelinePath=join(out,'timeline.json'),draft=join(out,'edited.mp4');
   await writeFile(timelinePath,JSON.stringify(timeline,null,2)+'\n',{flag:'wx'});
   await production.transition('QUALITY_CHECK',{reason:'FFmpeg timeline render and source hash verification'});
   await runBounded(process.execPath,[join(toolsDir,'persona-timeline-render.mjs'),timelinePath,draft],
    {env:{...env,PERSONA_WORKER_RENDER:'1'},timeoutMs:720000,maxStdout:30000});
   let video=draft;
   const cues=[];let offset=0;
   for(const clip of plan.choices){
    if(clip.caption){
     cues.push({startMs:Math.round(offset*1000),endMs:Math.round((offset+Math.min(clip.durationSec,3))*1000),
      text:clip.caption});
    }
    offset+=clip.durationSec;
   }
   if(cues.length){
    const subtitle=join(out,'caption-review.json');
    await writeFile(subtitle,JSON.stringify({version:1,cues,captionTiming:'model_title_not_transcription',authorReviewRequired:true}));
    const finished=join(out,'ready.mp4');
    await burnPersonaSubtitles({videoPath:draft,reviewPath:subtitle,outputPath:finished,
     ffmpegDir:config.ffmpegDir,preset:'cinematic'});
    video=finished;
   }
   await verifyUploadedFiles(input,job.files);
   const outputHash=await sha(video),details=await probe(video,config);
   const result={version:1,status:'awaiting-author-review',distributionAllowed:false,
    publicationApproved:false,id,videoName:basename(video),sha256:outputHash,
    bytes:(await stat(video)).size,durationSec:details.durationSec,
    strategy:{status:audit.status,recommendation:audit.recommendation},
    stylePack:plan.stylePack,hasMusic:Boolean(music),hasCaptions:cues.length>0,
    submittedToModel:'sampled_jpeg_frames_only',broll:'only_user_uploaded_source_windows',
    technicalChecks:{video:true,sha256:true,sourceIntegrity:true}};
   await writeFile(join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
   await production.transition('AWAITING_APPROVAL',{reason:'Verified MP4, awaiting human review'});
   job.state='completed';job.stage='Готово';job.videoName=basename(video);job.sha256=outputHash;
   job.result={durationSec:details.durationSec,hasMusic:Boolean(music),hasCaptions:cues.length>0,
    strategyStatus:audit.status,stylePack:plan.stylePack};job.updatedAt=new Date().toISOString();
   await save(job);
  }catch(error){
   job.state='failed';job.stage='Ошибка';
   job.error=String(error.message||error).replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]').slice(0,400);
   job.updatedAt=new Date().toISOString();await save(job);
  }finally{active=null}
 }
 async function run(id){
  const job=await get(id);
  if(!job||job.state!=='uploading'||job.uploads.length!==job.files.length)
   throw Error('All files must finish uploading before auto-render');
  if(active!==null)throw Error('The local worker is already rendering another job');
  active=id;job.state='running';job.stage='Начинаю обработку';await save(job);
  void execute(job);return view(job);
 }
 async function video(id,res){
  const job=await get(id);if(!job||job.state!=='completed'||!job.sha256||
   !['edited.mp4','ready.mp4'].includes(job.videoName))throw Error('Verified MP4 not available');
  const path=join(directory(id),'output',job.videoName);
  if((await sha(path))!==job.sha256)throw Error('MP4 checksum does not match verified result');
  const size=(await stat(path)).size;
  res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':size,
   'Content-Disposition':'attachment; filename="persona-'+id+'.mp4"',
   'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  createReadStream(path).pipe(res);
 }
 async function list(){
  await mkdir(root,{recursive:true});
  const entries=(await readdir(root,{withFileTypes:true})).filter(x=>x.isDirectory()&&/^quick-[0-9a-f-]{36}$/.test(x.name)).slice(-100);
  const result=[];
  for(const x of entries){const id=x.name.slice(6),job=await get(id);if(job)result.push(view(job))}
  return result.reverse().slice(0,40);
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
   const matched=/^\/quick-render\/([0-9a-f-]{36})(?:\/(upload\/(\d+)|run|status|video))?$/.exec(path);
   if(!matched){resJson(res,404,{error:'unknown_quick_render_route'});return true}
   const id=checkedJobId(matched[1]),action=matched[2];
   if(req.method==='GET'&&action==='status'){
    const job=await get(id);resJson(res,job?200:404,job?view(job):{error:'not_found'});return true;
   }
   if(req.method==='PUT'&&action?.startsWith('upload/')){
    resJson(res,200,await upload(id,Number(matched[3]),req));return true;
   }
   if(req.method==='POST'&&action==='run'){resJson(res,202,await run(id));return true}
   if(req.method==='GET'&&action==='video'){await video(id,res);return true}
   resJson(res,405,{error:'method_not_allowed'});return true;
  }catch(error){resJson(res,400,{error:String(error.message||error).slice(0,400)});return true}
 }
 return {root,create,upload,run,get,view,list,handle};
}
