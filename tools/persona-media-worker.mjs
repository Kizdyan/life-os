#!/usr/bin/env node
import {readTakeBindings} from '../packages/core/src/persona-manual-script.mjs';
/**
 * Local Persona AI Media Worker. This is intentionally a loopback-only bridge
 * from an explicit browser file selection to the existing AI reel CLI.
 * It accepts bytes and supported public reference links. Originals are staged
 * as copies and every persistent result lives in a new worker-owned folder.
 */
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {createWriteStream,createReadStream} from 'node:fs';
import {access,appendFile,mkdir,readFile,rename,rm,stat,writeFile} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {join,resolve,basename,extname,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {selectCreativePreset,getVisualPreset} from './persona-creative-director.mjs';
import {generateLocalPersonaScriptDraft} from './persona-script-draft.mjs';
import {proposePersonaIdeas,selectPersonaIdea} from './persona-idea-selection.mjs';
import {parseManualScript,validateManualSource} from './persona-manual-script.mjs';
import {externalIdeaStatus,generateExternalIdeas} from './persona-external-ideas.mjs';
import {generatePersonaCarouselResearch} from './persona-carousel-research.mjs';
import {commercialPrompt} from './persona-commercial-prompt.mjs';
import {analyzeMusicMaster,audioMode,musicFormats,renderMusicCandidate} from './persona-music-studio.mjs';
import {subtitlePreset} from './persona-subtitle-burn.mjs';
import {runStudioPython} from './persona-studio-python.mjs';
import {cachedFfprobe,fullProbeArgs} from './persona-stage-cache.mjs';
import {draftHookLines,inspectHookVideo,renderHookVariants} from './persona-hook-variants.mjs';
import {personaMediaPaths} from './persona-media-paths.mjs';
import {parseLearnedRules} from './persona-internet-learner.mjs';
import {createPersonaQuickRenderService,quickRenderRoot} from './persona-quick-render.mjs';
import {seedCarousels} from './seed_carousels.mjs';
import {ProductionJob} from './persona_orchestrator.mjs';
import {generateCarouselBackground,carouselBackgroundStatus} from './persona-carousel-backgrounds.mjs';
import {localCreativeRevision} from './persona-creative-revision.mjs';

const here=resolve(fileURLToPath(new URL('.',import.meta.url)));
const host='127.0.0.1';
const maxFile=2*1024*1024*1024, maxTotal=4*1024*1024*1024;
const takeName=/^(?:S(?:0[1-9]|[12]\d|30)_take(?:0[1-9]|[1-9]\d)|(?:A|B)0[1-4]_[a-z0-9_-]+_take(?:0[1-9]|[1-9]\d))\.(?:mp4|mov|mkv|webm|m4v)$/i;
const modelName=/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,119}$/;
const variations=new Set(['cinematic','humor','intimate','unexpected']);
function fail(message){throw Error('Persona Media Worker: '+message)}
function respond(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data))}
function envPath(bin){const copy={...process.env};const key=Object.keys(copy).find(k=>k.toLowerCase()==='path')||'PATH';if(bin)copy[key]=resolve(bin)+(process.platform==='win32'?';':':')+(copy[key]||'');return copy}
export function parseWorkerArgs(args){
 const value=(flag,required=true)=>{const i=args.indexOf(flag);const v=i<0?undefined:args[i+1];if(required&&(!v||v.startsWith('--')))fail('missing '+flag);return v};
 const unknown=args.filter((item,i)=>item.startsWith('--')&&!['--port','--output-root','--ffmpeg-dir','--whisper-cli','--whisper-model','--ollama-model'].includes(item)&&!(i&&args[i-1].startsWith('--')));if(unknown.length)fail('unknown argument '+unknown[0]);
 const port=Number(value('--port',false)||process.env.PERSONA_MEDIA_WORKER_PORT||47832);
 if(!Number.isInteger(port)||(port!==0&&(port<1024||port>65535)))fail('invalid port');
 return {port,outputRoot:resolve(value('--output-root',false)||process.env.PERSONA_MEDIA_OUTPUT_ROOT||join(tmpdir(),'persona-ai-media-results')),
  ffmpegDir:value('--ffmpeg-dir',false)||process.env.PERSONA_MEDIA_FFMPEG_DIR,
  musicOriginPort:Number(process.env.PERSONA_MUSIC_ORIGIN_PORT),
  musicLut:personaMediaPaths().humbleLut,
  whisperCli:value('--whisper-cli',false)||process.env.PERSONA_MEDIA_WHISPER_CLI||null,
  whisperModel:value('--whisper-model',false)||process.env.PERSONA_MEDIA_WHISPER_MODEL||null,
  ollamaModel:value('--ollama-model',false)||process.env.PERSONA_MEDIA_OLLAMA_MODEL||'qwen3:4b-instruct'};
}
function validBrief(value){return value&&typeof value==='object'&&!Array.isArray(value)&&(value.preEditPlanNeedsReview===undefined||value.preEditPlanNeedsReview===false)&&value.version===1&&value.sourceFormat==='reel'&&Array.isArray(value.script)&&value.script.length>=2&&value.script.length<=30&&Array.isArray(value.shots)&&value.shots.length===value.script.length&&value.script.every((b,i)=>b&&b.order===i+1&&typeof b.line==='string'&&b.line.trim())&&value.shots.every((s,i)=>s&&s.order===i+1)}
async function json(req,limit=512*1024){let bytes=0,parts=[];for await(const part of req){bytes+=part.length;if(bytes>limit)fail('request too large');parts.push(part)}try{return JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{fail('invalid JSON')}}
async function exists(file){try{await access(file);return true}catch{return false}}
function permittedOrigin(origin,musicPort){
 const allowed=/^http:\/\/(?:localhost|127\.0\.0\.1):(5173|5174|5175|4173)$/.test(origin||'');
 return allowed||Number.isInteger(musicPort)&&musicPort>=1024&&musicPort<=65535&&
  (origin==='http://localhost:'+musicPort||origin==='http://127.0.0.1:'+musicPort);
}
async function ollamaHasModel(model){
 try{const response=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(1500)});const body=await response.json();return Boolean(response.ok&&body?.models?.some(entry=>entry?.name===model))}catch{return false}
}
async function health(config){
 const ffmpeg=Boolean(config.ffmpegDir&&await exists(join(config.ffmpegDir,process.platform==='win32'?'ffmpeg.exe':'ffmpeg'))&&await exists(join(config.ffmpegDir,process.platform==='win32'?'ffprobe.exe':'ffprobe')));
 const whisper=Boolean(config.whisperCli&&config.whisperModel&&await exists(config.whisperCli)&&await exists(config.whisperModel));
 const ollama=modelName.test(config.ollamaModel)&&await ollamaHasModel(config.ollamaModel);
 const unavailable=[!ffmpeg?'FFmpeg/FFprobe':null,!whisper?'Whisper CLI or multilingual model':null,!ollama?'Ollama model '+config.ollamaModel:null].filter(Boolean);
 return {ok:unavailable.length===0,components:{ffmpeg,whisper,ollama},reason:unavailable.length?unavailable.join('; ')+' unavailable':null};
}
function safeFile(name){return typeof name==='string'&&basename(name)===name&&takeName.test(name)}
function originalName(header,fallback){
 if(header===undefined)return fallback;
 if(typeof header!=='string'||header.length>4096)fail('invalid original filename');
 let name;try{name=decodeURIComponent(header)}catch{fail('invalid original filename encoding')}
 if(!name||name.length>255||/[\\/\x00-\x1f:]/.test(name)||! /\.(mp4|mov|mkv|webm|m4v)$/i.test(name))fail('invalid original filename');
 if(extname(name).toLowerCase()!==extname(fallback).toLowerCase())fail('original container extension must be preserved');
 return name;
}
async function fileHash(path){const hash=createHash('sha256');for await(const part of createReadStream(path))hash.update(part);return hash.digest('hex')}
async function inspectUploadedTake(path,config,{musicMaster=false}={}){
 const bin=config.ffmpegDir?join(config.ffmpegDir,process.platform==='win32'?'ffprobe.exe':'ffprobe'):'ffprobe';
 const args=['-v','error',...(musicMaster?['-protocol_whitelist','file','-format_whitelist','mov,matroska,webm']:[]),...fullProbeArgs.slice(2)];
 const env={...process.env,...config.apiEnv};
 const media=await cachedFfprobe(path,{binary:bin,args,env,run:(command,options)=>new Promise((ok,no)=>{
  const child=spawn(command,options,{env,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});let output='',err='';
  const timer=setTimeout(()=>{child.kill();no(Error('FFprobe: время проверки файла истекло'))},15000);
  child.stdout.on('data',b=>{output+=b;if(output.length>1024*1024){child.kill();no(Error('FFprobe output limit'))}});child.stderr.on('data',b=>err=(err+b).slice(-1000));
  child.once('error',e=>{clearTimeout(timer);no(e)});child.once('close',code=>{clearTimeout(timer);if(code!==0)no(Error('Повреждённый или неподдерживаемый видеофайл: '+err));else ok(output)});
 })});
 const v=media.streams?.find(s=>s.codec_type==='video');if(!v||!v.width||!v.height)fail('В файле нет видеопотока');
 if(['smpte2084','arib-std-b67'].includes(v.color_transfer)||String(v.color_primaries).startsWith('bt2020'))fail('HDR/BT.2020: скрытая конвертация запрещена; подготовьте отдельную SDR-копию');
 if(!musicMaster&&(Number(v.tags?.rotate||0)!==0||v.side_data_list?.some(s=>Number(s.rotation||0)!==0)))fail('Поворот в метаданных требует отдельной подготовки копии; исходник не изменён');
 if(media.streams.some(s=>s.codec_type==='subtitle'))fail('Встроенные субтитры требуют отдельного согласования');
 const [sarW,sarH]=String(v.sample_aspect_ratio).split(':').map(Number);
 const displayWidth=sarW>0&&sarH>0?Math.max(2,Math.round(v.width*sarW/sarH/2)*2):v.width;
 const rotation=Number(v.side_data_list?.find(s=>s.rotation!==undefined)?.rotation??v.tags?.rotate??0);
 const rotated=Math.round(rotation/90)%2!==0;
 return {duration:Number(media.format?.duration),videoCodec:v.codec_name,audioCodecs:media.streams.filter(s=>s.codec_type==='audio').map(s=>s.codec_name),width:v.width,height:v.height,colorTransfer:v.color_transfer??'unknown',
  displayWidth:rotated?v.height:displayWidth,displayHeight:rotated?displayWidth:v.height};
}
async function sessionView(s){
 const canonical=await s.production.read();
 const state=canonical.status==='FAILED'?(s.cancelled?'cancelled':'failed'):
  canonical.status==='AWAITING_APPROVAL'?'completed':
  ['ANALYZING','EDITING','QUALITY_CHECK'].includes(canonical.status)?'running':'uploading';
 const error=canonical.status==='FAILED'?canonical.failure?.message??'Ошибка рендера':null;
 const evidence=join(s.output,'evidence','analysis.json'), decisions=join(s.output,'decisions.ai.json'), timeline=join(s.output,'timeline.json'), finished=join(s.output,'ai-edited-reel.mp4');
 let stage=s.stage;
 if(state==='running')stage=s.files.has('result')?'technical_qa':s.files.has('finished')?'color_render':s.files.has('timeline')?'ffmpeg_timeline':s.files.has('decisions')?'ollama_selection':s.files.has('evidence')?'whisper_asr':'intake';
 return {id:s.id,state,stage,uploaded:s.uploaded.size,expected:s.expected,totalBytes:s.total,error,
  outputPath:state==='completed'?s.output:null,videoPath:state==='completed'?finished:null,
  resultPath:state==='completed'?join(s.output,'RESULT.json'):null,qaPath:state==='completed'?join(s.output,'ai-edited-qa.json'):null,
  result:s.resultSummary??null,
  exports:s.exports??null,
  artifacts:{evidence:s.files.has('evidence'),decisions:s.files.has('decisions'),timeline:s.files.has('timeline'),finished:s.files.has('finished')}};
}
function scan(s){for(const [name,file] of Object.entries({evidence:join(s.output,'evidence','analysis.json'),decisions:join(s.output,'decisions.ai.json'),timeline:join(s.output,'timeline.json'),finished:join(s.output,'ai-edited-reel.mp4'),result:join(s.output,'RESULT.json')}))if(s.files.has(name)===false){stat(file).then(()=>s.files.add(name),()=>{})}}
function runProcess(s,config){
 const args=[join(here,'persona-ai-reel.mjs'),'--takes',s.sourceManifest??s.input,'--brief',s.briefPath,'--out',s.output,'--whisper-cli',config.whisperCli,'--whisper-model',config.whisperModel,'--ollama-model',s.model,'--variation',s.variation];
 if(config.ffmpegDir)args.push('--ffmpeg-dir',config.ffmpegDir);
 if(s.burnSubtitles)args.push('--burn-subtitles','true');
 if(s.burnSubtitles&&s.subtitlePreset)args.push('--subtitle-preset',s.subtitlePreset);
 if(s.visualPreset)args.push('--visual-preset',s.visualPreset);
 if(s.takeBindingsPath)args.push('--take-bindings',s.takeBindingsPath);
 s.child=spawn(process.execPath,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],
  env:{...envPath(config.ffmpegDir),PERSONA_WORKER_RENDER:'1',PERSONA_WORKER_HUMBLE_LUT:config.musicLut??'',
   ...(config.ffmpegDir?{PERSONA_MEDIA_FFMPEG_DIR:config.ffmpegDir}:{})}});
 let stderr='';s.child.stderr.on('data',b=>stderr=(stderr+String(b)).slice(-6000));s.child.stdout.on('data',()=>scan(s));
 s.timer=setInterval(()=>scan(s),750).unref();
 let spawnError=null;
 s.child.on('error',error=>{spawnError=error});
 s.child.on('close',async code=>{
  clearInterval(s.timer);s.child=null;scan(s);
  try{
   if(s.cancelled)throw Error('Монтаж отменён автором. Исходники не изменены.');
   if(spawnError||code!==0)throw Error((spawnError?.message||stderr||'AI reel process exited '+code).slice(-3000));
   const result=JSON.parse(await readFile(join(s.output,'RESULT.json'),'utf8'));
   if(result.status!=='awaiting-author-review'||result.distributionAllowed!==false||typeof result.aiFinishedVideo!=='string')
    fail('runner did not provide a verified unpublished AI MP4');
   // Authoritative lifecycle first. The UI can never report success ahead of job.json.
   await s.production.transition('EDITING',{reason:'Renderer produced a verified editorial timeline'});
   await s.production.transition('QUALITY_CHECK',{reason:'Finished MP4 and technical checks verified'});
   await s.production.transition('AWAITING_APPROVAL',{reason:'Verified draft awaiting author review'});
   s.resultSummary={status:result.status,briefFingerprintSha256:result.briefFingerprintSha256,
    sourceSelection:result.sourceSelection,takeBindings:result.takeBindings??null,aiEditorial:result.aiEditorial,
    output:result.output,aiFinishedVideo:result.aiFinishedVideo,aiColorPackage:result.aiColorPackage,
    aiFinishedQaPath:result.aiFinishedQaPath,creativeDirection:s.direction??null,
    subtitleBurnIn:result.subtitleBurnIn??null,technicalChecks:result.technicalChecks,distributionAllowed:false};
   s.state='completed';s.stage='awaiting_author_review';
  }catch(error){
   const message=String(error.message||error).slice(0,1000);
   try{await s.production.markFailed(message)}catch(persistError){
    console.error('Persona: could not persist FAILED job state: '+String(persistError.message||persistError));
   }
   s.state=s.cancelled?'cancelled':'failed';s.error=message;
  }

 });
}
export function createPersonaMediaWorker(config=parseWorkerArgs(process.argv.slice(2))){
 const sessions=new Map();
 const token=randomUUID();
 const quickRender=createPersonaQuickRenderService(config);
 // Read only operation metadata from worker-session.json; job.json is the state authority.
 async function restoreSession(id){
  if(!/^[a-f0-9-]{36}$/.test(id))return null;
  const input=join(config.outputRoot,'.worker-staging-'+id);
  const production=new ProductionJob(join(input,'production'));
  let manifest,canonical,brief;
  try{
   manifest=JSON.parse(await readFile(join(input,'worker-session.json'),'utf8'));
   canonical=await production.read();
   brief=JSON.parse(await readFile(join(input,'approved-production-brief.json'),'utf8'));
  }catch{return null}
  if(manifest?.version!==1||manifest.id!==id||!validBrief(brief))return null;
  if(!['AWAITING_APPROVAL','FAILED'].includes(canonical.status)){
   try{canonical=await production.markFailed('Worker был перезапущен до завершения проверки MP4. Исходники сохранены; начните новый монтаж.')}
   catch{return null}
  }
  const uploaded=new Set();let total=0;
  for(let i=0;i<manifest.expected;i++){
   try{const intake=JSON.parse(await readFile(join(input,'source-'+i+'.json'),'utf8'));
    if(intake?.sha256&&intake?.bytes){uploaded.add(i);total+=intake.bytes}}
   catch{}
  }
  const output=join(config.outputRoot,'ai-reel-'+id);
  let resultSummary=null;
  if(canonical.status==='AWAITING_APPROVAL'){
   try{resultSummary=JSON.parse(await readFile(join(output,'RESULT.json'),'utf8'))}catch{}
  }
  const direction=JSON.parse(await readFile(join(input,'AI-DIRECTOR.json'),'utf8').catch(()=>'null'));
  const state=canonical.status==='AWAITING_APPROVAL'?'completed':'failed';
  const session={id,input,output,production,brief,briefPath:join(input,'approved-production-brief.json'),
   direction,visualPreset:manifest.visualPreset,variation:manifest.variation,model:manifest.model,
   burnSubtitles:manifest.burnSubtitles,subtitlePreset:manifest.subtitlePreset,
   masterAsset:manifest.masterAsset,expected:manifest.expected,takeBindings:manifest.takeBindings??null,
   uploaded,total,state,stage:state==='completed'?'awaiting_author_review':'intake',
   files:new Set(),child:null,cancelled:false,error:canonical.failure?.message??null,resultSummary};
  sessions.set(id,session);return session;
 }
 const musicJobs=new Map();let musicBusy=false;
 const learnedRulesFile=()=>join(config.outputRoot,'learned_rules.json');
 let referenceBusy=false;
 async function recordMusicTiming(job,renderStarted,status){
  const measuredAt=performance.now();
  const intake=job.intake;
  const timing={version:1,event:'music-studio-build',status,jobId:job.id,formatId:job.analysis.format.id,
   startedAt:intake.startedAt,recordedAt:new Date().toISOString(),startSource:intake.source,
   totalMs:Math.round(measuredAt-intake.start+intake.browserLeadMs),
   uploadAndAnalysisMs:Math.round(intake.finished-intake.start),
   waitingBeforeRenderMs:Math.round(renderStarted-intake.finished),
   renderAndQaMs:Math.round(measuredAt-renderStarted),
   ...(status==='failed'?{}:{videoSha256:job.report.video.sha256})};
  try{await appendFile(join(config.outputRoot,'render-timings.jsonl'),JSON.stringify(timing)+'\n',{encoding:'utf8'});}
  catch{console.error('Persona: could not append render-timings.jsonl');return {...timing,loggingWarning:'Не удалось записать журнал времени.'};}
  return timing;
 }
 const hookJobs=new Map();let hookBusy=false;
 let producerBusy=false;
 async function produce(task,input){
  if(producerBusy)fail('Продюсер уже готовит материал. Дождитесь текущего ответа.');
  const env=config.apiEnv??process.env;
  if(!config.producer&&task!=='hook-variants'&&!env.OPENROUTER_API_KEY?.trim())fail('Настройте ключ OpenRouter в локальном Worker.');
  producerBusy=true;
  try{
   return await (config.producer?config.producer(task,input):
    runStudioPython(config,'./studio_producer.py',[task],task==='social-copy'?180000:task==='hook-variants'?145000:110000,input));
  }finally{producerBusy=false;}
 }
 async function makeHookVersions(req,res,job){
  const body=await json(req,2048);
  const hook=typeof body?.hook==='string'?body.hook.trim():'';
  if(body?.consent!==true)fail('Подтвердите отправку текста хука в OpenRouter.');
  if(hook.length<3||hook.length>240||/[\p{C}]/u.test(hook))fail('Введите хук одной строкой от 3 до 240 знаков.');
  if(body.videoSha256!==undefined&&body.videoSha256!==job.sourceSha256)fail('Выбран другой MP4.');
  const hookStartSec=body.hookStartSec??job.hookStartSec??0;
  if(!Number.isFinite(hookStartSec)||hookStartSec<(job.hookStartSec??0)||hookStartSec>=900)
   fail('Укажите начало нового хука после уже вшитого титра.');
  if(hookBusy)fail('Уже идёт A/B-рендер.');
  if(job.report&&job.hook===hook&&job.lastHookStartSec===hookStartSec){respond(res,200,job.report);return;}
  hookBusy=true;
  try{
   if(await fileHash(job.video)!==job.sourceSha256)fail('Исходный MP4 изменился.');
   const drafts=await produce('hook-variants',{hook});
   draftHookLines(drafts.hooks);
   const output=join(job.directory,'variants-'+randomUUID());
   const report=await renderHookVariants({...job,hookStartSec,drafts:drafts.hooks,output,config});
   const id=randomUUID();
   // Keep each completed set immutable so that previously returned links stay valid.
   const result={...report,id,hook,model:drafts.model,provider:drafts.provider};
   hookJobs.set(id,{output,report:result});
   job.report=result;job.hook=hook;job.lastHookStartSec=hookStartSec;
   respond(res,201,result);
  }finally{hookBusy=false;}
 }
 async function socialCopy(req,res,video,formatTitle,expectedHash){
  const body=await json(req,1024);
  if(body?.consent!==true)fail('Подтвердите отправку одного стоп-кадра в OpenRouter.');
  if(body.videoSha256!==undefined&&body.videoSha256!==expectedHash)
   fail('Ролик изменился. Откройте текущий результат.');
  const videoSha256=await fileHash(video);
  if(expectedHash&&videoSha256!==expectedHash)fail('MP4 изменился после проверки.');
  const file=join(dirname(video),'social-copy.json');
  if(await exists(file)){
   const cached=JSON.parse(await readFile(file,'utf8'));
   if(cached.videoSha256===videoSha256&&cached.formatTitle===formatTitle){
    respond(res,200,cached);return;
   }
  }
  const draft=await produce('social-copy',{video,formatTitle});
  if(await fileHash(video)!==videoSha256)fail('MP4 изменился при подготовке текста.');
  const result={...draft,videoSha256,publicationApproved:false,distributionAllowed:false};
  const temp=file+'.'+randomUUID()+'.tmp';
  try{
   await writeFile(temp,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
   await rename(temp,file);
  }finally{await rm(temp,{force:true}).catch(()=>{});}
  respond(res,201,result);
 }
 const directorDecisions=new Map();let directorPending=null,ideationBusy=false,activeExport=false,externalBusy=false;const externalCalls=[];
 const briefHash=brief=>createHash('sha256').update(JSON.stringify(brief)).digest('hex');
 const server=createServer(async(req,res)=>{
  const expected=new Set(['127.0.0.1:'+server.address().port,'localhost:'+server.address().port]);if(!expected.has(req.headers.host||'')){respond(res,403,{error:'host_not_allowed'});return}
  const origin=req.headers.origin;
  const allowedOrigin=config.frontend?origin==='http://'+req.headers.host:permittedOrigin(origin,config.musicOriginPort);
  if(origin&&!allowedOrigin){respond(res,403,{error:'origin_not_allowed'});return}
  const url=new URL(req.url||'/','http://127.0.0.1');
  if(config.frontend){
   const prefix='/persona-worker';
   if(!url.pathname.startsWith(prefix+'/')){config.frontend(req,res,url);return}
   url.pathname=url.pathname.slice(prefix.length);
  }
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin')}
  if(req.method==='OPTIONS'&&origin){res.writeHead(204,{'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,X-Persona-Worker-Token,X-Persona-File-Name,X-Persona-Original-Name'});res.end();return}
  try{
   if(req.method==='GET'&&url.pathname==='/health'){
    const musicStudio=Boolean(config.musicLut&&await exists(config.musicLut));

    const status=await health(config);
    respond(res,200,{...status,service:'persona-media-worker',creativeDirector:true,musicStudio,productionLut:musicStudio,quickRender:true,quickRenderConfigured:Boolean(config.quickPlanner||config.quickVisionBatch||(config.apiEnv??process.env).OPENROUTER_API_KEY),externalIdeas:externalIdeaStatus(config.apiEnv??process.env),carouselResearch:{configured:Boolean((config.apiEnv??process.env).PERPLEXITY_API_KEY),requiresConsent:true,provider:'perplexity'},token,model:config.ollamaModel,ffmpegDir:config.ffmpegDir?true:false});return;
   }
   const hookRoute=/^\/hook-tests\/([a-f0-9-]{36})\/(render|variant\/([1-3]))$/.exec(url.pathname);
   const videoToken=req.method==='GET'&&((url.pathname.endsWith('/video')||url.pathname.endsWith('/video-full'))||hookRoute?.[3]||/^\/music-studio\/[a-f0-9-]{36}\/source$/.test(url.pathname)||/\/export-video\/(shorts|reels|vk|youtube)$/.test(url.pathname)||/^\/quick-render\/[0-9a-f-]{36}\/export\/[a-z0-9-]+$/.test(url.pathname)||/^\/quick-render\/[0-9a-f-]{36}\/quality-(?:report|contact-sheet)$/.test(url.pathname))?url.searchParams.get('token'):null;
   if(req.headers['x-persona-worker-token']!==token&&videoToken!==token){respond(res,401,{error:'invalid_local_worker_token'});return}
   if(await quickRender.handle(req,res,url))return;
   if(req.method==='GET'&&url.pathname==='/carousel-background/status'){
    respond(res,200,carouselBackgroundStatus(config.apiEnv??process.env));return;
   }
   if(req.method==='POST'&&url.pathname==='/carousel-creative-revision'){
    const body=await json(req,10000);
    if(ideationBusy||directorPending||activeExport||[...sessions.values()].some(j=>j.state==='running'))fail('Local AI is busy');
    ideationBusy=true;
    try{respond(res,200,await (config.creativeRevision??localCreativeRevision)({request:body,model:config.ollamaModel}));}
    finally{ideationBusy=false}return;
   }
   if(req.method==='POST'&&url.pathname==='/carousel-background'){
    const request=await json(req,4096);
    const result=await generateCarouselBackground(request,{env:config.apiEnv??process.env});
    respond(res,200,result);return;
   }
   if(req.method==='PUT'&&url.pathname==='/hook-tests'){
    const length=Number(req.headers['content-length']);
    if(!Number.isSafeInteger(length)||length<1024||length>maxFile)fail('Выберите MP4 размером до 2 ГБ.');
    const id=randomUUID(),directory=join(config.outputRoot,'hook-test-'+id),video=join(directory,'master.mp4');
    await mkdir(directory,{recursive:true});
    try{
     let received=0;
     const bound=new Transform({transform(chunk,_encoding,callback){
      received+=chunk.length;
      callback(received>length?Error('Размер загрузки не совпал с заявленным.'):null,chunk);
     }});
     await pipeline(req,bound,createWriteStream(video,{flags:'wx'}));
     if(received!==length)fail('Размер загрузки не совпал с заявленным.');
     await inspectHookVideo(video,config.ffmpegDir);
     const sourceSha256=await fileHash(video);
     hookJobs.set(id,{directory,video,sourceSha256});
     respond(res,201,{id,sourceSha256});return;
    }catch(error){await rm(directory,{recursive:true,force:true}).catch(()=>{});throw error;}
   }
   if(hookRoute){
    const job=hookJobs.get(hookRoute[1]);
    if(req.method==='POST'&&hookRoute[2]==='render'&&job?.video){
     await makeHookVersions(req,res,job);return;
    }
    const variant=job?.output&&job.report.variants.find(item=>String(item.index)===hookRoute[3]);
    if(req.method==='GET'&&variant){
     const path=join(job.output,variant.file);
     if(await fileHash(path)!==variant.sha256)fail('Файл варианта изменился после проверки.');
     res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':variant.bytes,'Cache-Control':'no-store',
      'Content-Disposition':'attachment; filename="'+variant.file+'"'});
     createReadStream(path).pipe(res);return;
    }
    respond(res,404,{error:'Вариант A/B-теста не найден.'});return;
   }
   if(req.method==='POST'&&url.pathname==='/preproduction'){
    const body=await json(req,4096);
    if(body?.consent!==true)fail('Подтвердите передачу идеи в OpenRouter.');
    const idea=typeof body.idea==='string'?body.idea.trim():'';
    if(idea.length<3||idea.length>600||/[\x00-\x1f]/.test(idea))fail('Введите идею одной строкой от 3 до 600 знаков.');
    const draft=await produce('shot-list',{idea});
    const id=randomUUID(),project=join(config.outputRoot,'shooting-'+id),path=join(project,'shot_list.md');
    const result={...draft,id,idea};
    await mkdir(project,{recursive:true});
    try{
     await writeFile(path,draft.markdown,{flag:'wx'});
     await writeFile(join(project,'SHOT-LIST.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    }catch(error){
     await rm(path,{force:true}).catch(()=>{});
     throw error;
    }
    respond(res,201,result);return;
   }
   const shotList=/^\/preproduction\/([a-f0-9-]{36})$/.exec(url.pathname);
   if(req.method==='GET'&&shotList){
    const file=join(config.outputRoot,'shooting-'+shotList[1],'SHOT-LIST.json');
    if(!await exists(file)){respond(res,404,{error:'Съёмочный лист не найден.'});return;}
    respond(res,200,JSON.parse(await readFile(file,'utf8')));return;
   }
   if(req.method==='GET'&&url.pathname==='/music-studio/reference'){
    const rules=await readFile(learnedRulesFile(),'utf8').catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
    respond(res,200,{rules:rules?JSON.parse(rules):null});return;
   }
   if(req.method==='POST'&&url.pathname==='/music-studio/reference'){
    const body=await json(req,4096);
    if(body?.consent!==true||typeof body.url!=='string'||!body.url.trim()||body.url.length>2048)
     fail('Укажите публичную ссылку и подтвердите отправку шести кадров в OpenRouter.');
    if(referenceBusy)fail('Анализ другого референса уже идёт.');
    referenceBusy=true;
    let temp;
    try{
     const input={url:body.url.trim()};
     const rules=config.learnReference?await config.learnReference(input):
      await runStudioPython(config,'./persona_internet_learner.py',[],360000,input);
     parseLearnedRules(rules);
     await mkdir(config.outputRoot,{recursive:true});
     temp=join(config.outputRoot,'.learned-rules-'+randomUUID()+'.tmp');
     await writeFile(temp,JSON.stringify(rules,null,2)+'\n',{flag:'wx'});
     await rename(temp,learnedRulesFile());
     temp=undefined;
     respond(res,201,{rules});
    }finally{
     referenceBusy=false;
     if(temp)await rm(temp,{force:true}).catch(()=>{});
    }
    return;
   }
   const musicRoute=/^\/music-studio\/([a-f0-9-]{36})\/(render|video|source|social-copy|hook-tests)$/.exec(url.pathname);
   if(req.method==='PUT'&&url.pathname==='/music-studio'){
    const arrival=Date.now(),intakeStart=performance.now();
    const clicked=Number(url.searchParams.get('clickedAt'));
    const clickAge=arrival-clicked;
    const fromBrowser=Number.isSafeInteger(clicked)&&clickAge>=0&&clickAge<=60000;
    const intake={start:intakeStart,startedAt:new Date(fromBrowser?clicked:arrival).toISOString(),
     source:fromBrowser?'browser-click':'worker-intake',browserLeadMs:fromBrowser?clickAge:0};
    const selected=musicFormats.find(item=>item.id===url.searchParams.get('format'));
    if(!selected)fail('Выберите один из пяти форматов.');
    if(selected.missing)fail(selected.missing);
    if(musicBusy)fail('Музыкальная студия уже обрабатывает файл.');
    if(!config.musicLut||!await exists(config.musicLut))
     fail('Не настроен локальный Humble LUT.');
    const length=Number(req.headers['content-length']);
    if(!Number.isSafeInteger(length)||length<1024||length>maxFile)fail('Выберите видео размером до 2 ГБ.');
    const extension=url.searchParams.get('extension');
    if(!/^\.(mp4|mov|mkv|webm|m4v)$/i.test(extension??''))fail('Поддерживаются MP4, MOV, MKV, WebM и M4V.');
    if(musicBusy)fail('Музыкальная студия уже обрабатывает файл.');
    musicBusy=true;
    let job;
    try{
     const id=randomUUID(),output=join(config.outputRoot,'music-'+id),input=join(output,'master'+extension.toLowerCase());
     await mkdir(config.outputRoot,{recursive:true});
     await mkdir(output);
     job={id,output,input};
     let received=0;
     const bound=new Transform({transform(chunk,_encoding,callback){
      received+=chunk.length;
      callback(received>length?Error('Размер загрузки не совпал с заявленным.'):null,chunk);
     }});
     await pipeline(req,bound,createWriteStream(input,{flags:'wx'}));
     if(received!==length)fail('Размер загрузки не совпал с заявленным.');
     const media=await inspectUploadedTake(input,config,{musicMaster:true});
     if(!Number.isFinite(media.duration)||media.duration>900||media.duration<selected.minSec)
      fail('Длительность мастер-файла должна быть не менее '+selected.minSec+' с и не более 15 минут.');
     const analysis=await analyzeMusicMaster(input,selected.id,config,media),sourceSha256=await fileHash(input);
     await writeFile(join(output,'ANALYSIS.json'),JSON.stringify({analysis,sourceSha256,media},null,2)+'\n',{flag:'wx'});
     musicJobs.set(id,{...job,analysis,sourceSha256,media,intake:{...intake,finished:performance.now()}});
     respond(res,201,{id,analysis,sourceSha256,media});return;
    }catch(error){
     if(job)await rm(job.input,{force:true}).catch(()=>{});
     throw error;
    }finally{musicBusy=false;}
   }
   if(musicRoute){
    const job=musicJobs.get(musicRoute[1]), action=musicRoute[2];
    if(!job){respond(res,404,{error:'unknown_music_job'});return;}
    if(req.method==='POST'&&action==='hook-tests'){
     const report=job.report;
     if(!report||job.rendering)fail('Сначала соберите MP4.');
     if(job.hookSource?.sourceSha256!==report.video.sha256){
      const directory=dirname(report.video.path);
      job.hookSource={video:report.video.path,sourceSha256:report.video.sha256,directory,
       hookStartSec:report.hooks?.[0]?.endSec??0,
       hookDurationSec:report.hooks?.[0]?.endSec,kinetic:report.profile==='Dynamic Soft'};
     }
     await makeHookVersions(req,res,job.hookSource);return;
    }
    if(req.method==='POST'&&action==='social-copy'){
     if(!job.report||job.rendering)fail('Сначала соберите MP4.');
     const report=job.report;
     await socialCopy(req,res,report.video.path,job.analysis.format.title,report.video.sha256);return;
    }
    if(req.method==='POST'&&action==='render'){
     const renderStarted=performance.now();
     if(musicBusy||job.rendering)fail('Музыкальная студия уже обрабатывает задание.');
     const body=await json(req,1024);
     const candidate=job.analysis.candidates.find(item=>item.id===body?.candidateId);
     if(!candidate||body.approved!==true)fail('Сначала подтвердите один из найденных фрагментов.');
     if(musicBusy||job.rendering)fail('Музыкальная студия уже обрабатывает задание.');
     const mode=audioMode(body.autoMusic);
     const captionStyle=body.captionStyle==='learned-reference'?body.captionStyle:subtitlePreset(body.captionStyle);
     let learned;
     if(captionStyle==='learned-reference'){
      const raw=await readFile(learnedRulesFile(),'utf8').catch(error=>{if(error.code!=='ENOENT')throw error;fail('Сначала обучите систему на референсе.');});
      const rules=JSON.parse(raw);
      learned={...parseLearnedRules(rules),sourceUrl:rules.sourceUrl,sha256:createHash('sha256').update(raw).digest('hex')};
     }
     if(musicBusy||job.rendering)fail('Музыкальная студия уже обрабатывает задание.');
     if(job.report?.selection.id===candidate.id&&job.report.audio?.mode===mode&&
        (job.report.captionStyle??'cinematic')===captionStyle&&
        job.report.reference?.sha256===learned?.sha256&&
        !job.report.audio?.music?.visionWarning){
      const timing=await recordMusicTiming(job,renderStarted,'cached');
      respond(res,200,{...job.report,timing});return;
     }
     const output=join(job.output,'render-'+randomUUID());
     job.rendering=true;musicBusy=true;
     try{
      await mkdir(output);
      job.report=await renderMusicCandidate({...job,candidate,output,config,mode,captionStyle,learned});
      const timing=await recordMusicTiming(job,renderStarted,'ready');
      respond(res,201,{...job.report,timing});return;
     }catch(error){
      await recordMusicTiming(job,renderStarted,'failed');
      throw error;
     }finally{job.rendering=false;musicBusy=false;}
    }
    if(req.method==='GET'&&(action==='video'||action==='source')){
     const expectedHash=action==='video'?job.report?.video.sha256:job.sourceSha256;
     if(!expectedHash)fail('Готовый MP4 ещё недоступен.');
     const file=action==='video'?job.report.video.path:job.input;
     if(action==='video'&&await fileHash(file)!==expectedHash)fail('MP4 изменился после проверки.');
     const size=(await stat(file)).size;
     const sizeHeader={'Cache-Control':'no-store','Accept-Ranges':'bytes'};
     if(action==='video'&&url.searchParams.get('download')==='1')
      sizeHeader['Content-Disposition']='attachment; filename="music-reel.mp4"';
     const ext=extname(file);
     sizeHeader['Content-Type']=ext==='.mov'?'video/quicktime':ext==='.webm'?'video/webm':ext==='.mkv'?'video/x-matroska':'video/mp4';
     if(req.headers.range){
      const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      const start=range?.[1]?Number(range[1]):range?.[2]?Math.max(0,size-Number(range[2])):NaN;
      const end=range?.[1]&&range[2]?Math.min(size-1,Number(range[2])):size-1;
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=size){
       res.writeHead(416,{'Content-Range':'bytes */'+size});res.end();return;
      }
      res.writeHead(206,{...sizeHeader,'Content-Range':'bytes '+start+'-'+end+'/'+size,'Content-Length':end-start+1});
      createReadStream(file,{start,end}).pipe(res);return;
     }
     res.writeHead(200,{...sizeHeader,'Content-Length':size});createReadStream(file).pipe(res);return;
    }
   }

   if(req.method==='POST'&&url.pathname==='/external-ideas'){
    const body=await json(req,8000);if(typeof body.projectId!=='string'||!/^[-a-zA-Z0-9_]{1,160}$/.test(body.projectId))fail('Project identity required');
    const now=Date.now();while(externalCalls.length&&now-externalCalls[0]>3600000)externalCalls.shift();
    if(externalBusy||externalCalls.length>=5)fail('Внешняя генерация занята или достигнут локальный предел 5 запросов в час');
    externalBusy=true;try{
     const status=externalIdeaStatus(config.apiEnv??process.env);if(!status[body.provider]?.configured)fail('API-ключ не настроен. Используйте «Вставить свой сценарий».');
     if(body.consent!==true)fail('Подтвердите платный текстовый запрос');externalCalls.push(now);
     respond(res,200,await generateExternalIdeas({provider:body.provider,theme:body.theme,consent:body.consent,env:config.apiEnv??process.env}));
    }finally{externalBusy=false}return;
   }
   if(req.method==='POST'&&url.pathname==='/carousel-research'){
    const body=await json(req,4000);
    if(body.consent!==true)fail('Нужно явное согласие на платное исследование');
    if(typeof body.theme!=='string'||body.theme.trim().length<6||body.theme.length>250)
     fail('Нужна конкретная тема до 250 символов');
    const env=config.apiEnv??process.env;
    if(!env.PERPLEXITY_API_KEY)fail('Perplexity не настроен в локальном Worker');
    const now=Date.now();while(externalCalls.length&&now-externalCalls[0]>3600000)externalCalls.shift();
    if(externalBusy||externalCalls.length>=5)fail('Предел 5 внешних запросов в час или Worker занят');
    externalBusy=true;externalCalls.push(now);
    try{
     respond(res,200,await (config.carouselResearch??generatePersonaCarouselResearch)(
      {theme:body.theme,consent:true,env}
     ));
    }finally{externalBusy=false}
    return;
   }
   if(req.method==='POST'&&url.pathname==='/script-draft'){
    const body=await json(req,5000);
    if(ideationBusy||directorPending||activeExport)fail('Local AI is busy');
    ideationBusy=true;
    try{
     const result=await (config.scriptDraft??generateLocalPersonaScriptDraft)({
      idea:body.idea,history:body.history,model:config.ollamaModel
     });
     // A mock may be injected in unit tests, but production calls real Ollama.
     if(result?.mode!=='ai'||!result.draft||!result.model)fail('Invalid local model result');
     respond(res,200,result);
    }finally{ideationBusy=false}
    return;
   }
   if(req.method==='POST'&&url.pathname==='/manual-script'){
    const body=await json(req,96000);if(ideationBusy||directorPending||activeExport||[...sessions.values()].some(j=>j.state==='running'))fail('Worker занят; повторите после текущей задачи');
    ideationBusy=true;try{respond(res,200,await parseManualScript({text:body.text,projectId:body.projectId,model:config.ollamaModel}));}finally{ideationBusy=false}return;
   }
   if(req.method==='POST'&&(url.pathname==='/ideas'||/^\/ideas\/[a-f0-9-]{36}\/select$/.test(url.pathname))){
    const body=await json(req);if(typeof body.projectId!=='string'||!/^[-a-zA-Z0-9_]{1,160}$/.test(body.projectId))fail('A local project identity is required');
    if(ideationBusy||directorPending||activeExport)fail('Local Qwen is busy; retry after the current task');
    ideationBusy=true;
    try{
     const servers=[{id:'ollama-local',baseUrl:'http://127.0.0.1:11434',model:config.ollamaModel}];
     if(url.pathname==='/ideas'){
      commercialPrompt(body.contentFormat,5);
      const id=randomUUID(),outputDir=join(config.outputRoot,'ideas-'+id);await mkdir(config.outputRoot,{recursive:true});
      const result=await proposePersonaIdeas({theme:body.theme,contentFormat:body.contentFormat,ideaCount:5,audit:true,style:body.contentFormat==='comedy'?'humor':'cinematic',outputDir,servers});
      const proposal=JSON.parse(await readFile(result.ideasPath,'utf8'));
      await writeFile(join(outputDir,'PROJECT.json'),JSON.stringify({projectId:body.projectId}),{flag:'wx'});
      // Full rejected drafts stay in local evidence; only winners and review
      // summaries enter the UI/project record.
      const {draftIdeas,modelResponse,...visible}=proposal;
      respond(res,200,{...visible,id});
     }else{
      const id=url.pathname.split('/')[2],proposalDir=join(config.outputRoot,'ideas-'+id);
      const owner=JSON.parse(await readFile(join(proposalDir,'PROJECT.json'),'utf8'));if(owner.projectId!==body.projectId)fail('Idea proposal belongs to another project');
      const stored=JSON.parse(await readFile(join(proposalDir,'IDEAS.json'),'utf8'));if(!stored.audit)fail('Idea proposal has no Generator-Critic audit; generate a reviewed batch first');
      const outputDir=join(config.outputRoot,'idea-plan-'+randomUUID());
      const result=await selectPersonaIdea({proposalPath:join(proposalDir,'IDEAS.json'),ideaId:body.ideaId,outputDir,servers});
      respond(res,200,{brief:JSON.parse(await readFile(result.brief,'utf8')),shootSheet:await readFile(join(outputDir,'SHOOT.md'),'utf8'),publicationApproved:false});
     }
    }finally{ideationBusy=false}return;
   }
   if(req.method==='POST'&&url.pathname==='/direct'){
    if(ideationBusy||activeExport)fail('Local Qwen is generating an idea or export; retry after it finishes');
    const body=await json(req);if(!validBrief(body?.brief))fail('AI Director requires a valid Production Brief');
    const fingerprint=briefHash(body.brief);
    if(directorPending&&directorPending.fingerprint!==fingerprint)fail('AI Director is busy with another brief; retry after the current analysis');
    if(!directorPending){
     const promise=Promise.resolve().then(()=>(config.directorSelector??selectCreativePreset)({text:body.brief.script.map(beat=>beat.line).join('\n'),model:config.ollamaModel}));
     directorPending={fingerprint,promise};
     // StrictMode, navigation and auto/manual toggles may resend an identical
     // request. Share that inference, with one bounded local model operation.
     promise.then(()=>{directorPending=null},()=>{directorPending=null});
    }
     const decision=await directorPending.promise;
     getVisualPreset(decision.selected_preset);
     const receipt={...decision,id:randomUUID(),briefSha256:briefHash(body.brief)};
     if(directorDecisions.size>=100)directorDecisions.delete(directorDecisions.keys().next().value);
     directorDecisions.set(receipt.id,receipt);respond(res,200,receipt);
    return;
   }
   if(req.method==='POST'&&url.pathname==='/session'){
    const body=await json(req);if((body?.masterAsset!==undefined&&typeof body.masterAsset!=='boolean')||!validBrief(body?.brief)||!variations.has(body?.variation)||!modelName.test(body?.model||config.ollamaModel)||(body.burnSubtitles!==undefined&&typeof body.burnSubtitles!=='boolean'))fail('invalid approved Reel brief, variation, subtitle option or local model');
    const subtitleStyle=subtitlePreset(body.subtitlePreset);
    if(body.brief.manualSource){validateManualSource(body.brief.manualSource,body.brief.script);if(createHash('sha256').update(body.brief.manualSource.sourceText).digest('hex')!==body.brief.manualSource.sourceSha256)fail('Manual source SHA mismatch');if(body.directionMode!=='manual')fail('Авторский сценарий не допускает автоматической творческой режиссуры');}
    const takeBindings=body.takeBindings===undefined?null:readTakeBindings(body.brief,body.takeBindings);
    if(takeBindings&&body.masterAsset)fail('Per-shot types require separate files');
    if(takeBindings&&body.takeCount!==takeBindings.length)fail('One typed file per frame required');
    let direction=null;
    if(body.directionMode==='auto'){
     const receipt=directorDecisions.get(body.directorDecisionId);
     if(!receipt||receipt.briefSha256!==briefHash(body.brief)||receipt.model!==config.ollamaModel||Date.now()-Date.parse(receipt.createdAt)>30*60*1000)fail('AI Director decision missing, stale or belongs to another brief');
     direction={...receipt,mode:'auto'};
    }else if(body.directionMode==='manual'){
     getVisualPreset(body.visualPreset);direction={mode:'manual',selected_preset:body.visualPreset,model:null,briefSha256:briefHash(body.brief)};
    }else if(body.directionMode!==undefined)fail('Invalid director mode');
    if(!Number.isInteger(body.takeCount)||body.takeCount<(body.masterAsset?1:2)||body.takeCount>12||body.masterAsset&&body.takeCount!==1)fail('choose 2–12 explicitly named takes');
    if(body.masterAsset&&body.brief.manualSource?.scenes.some(s=>s.kind==='visual'))fail('Для визуального авторского сценария назначьте отдельный короткий файл каждому кадру');
    await mkdir(config.outputRoot,{recursive:true});const id=randomUUID(),input=join(config.outputRoot,'.worker-staging-'+id),output=join(config.outputRoot,'ai-reel-'+id);await mkdir(input,{recursive:false});
    const production=await ProductionJob.create(join(input,'production'),{title:'Persona AI Media Worker'});
    await production.markReady();
    // The established runner owns output creation and rejects a pre-existing
    // directory. The approved brief is worker-owned staging input instead.
    const briefPath=join(input,'approved-production-brief.json');await writeFile(briefPath,JSON.stringify(body.brief,null,2)+'\n',{flag:'wx'});
    if(direction)await writeFile(join(input,'AI-DIRECTOR.json'),JSON.stringify(direction,null,2)+'\n',{flag:'wx'});
    const s={id,input,output,production,takeBindings,brief:body.brief,briefPath,direction,visualPreset:direction?.selected_preset??null,variation:direction?getVisualPreset(direction.selected_preset).editorialVariation:body.variation,model:body.model||config.ollamaModel,burnSubtitles:body.burnSubtitles===true,subtitlePreset:subtitleStyle,masterAsset:body.masterAsset===true,expected:Number(body.takeCount),uploaded:new Set(),total:0,state:'uploading',stage:'intake',files:new Set(),child:null,cancelled:false,error:null};
    if(!Number.isInteger(s.expected)||s.expected<(s.masterAsset?1:2)||s.expected>12||s.masterAsset&&s.expected!==1)fail('choose 2–12 explicitly named takes');
    await writeFile(join(input,'worker-session.json'),JSON.stringify({version:1,id,
     variation:s.variation,model:s.model,burnSubtitles:s.burnSubtitles,subtitlePreset:s.subtitlePreset,
     masterAsset:s.masterAsset,expected:s.expected,visualPreset:s.visualPreset,takeBindings:s.takeBindings})+'\n',{flag:'wx'});
    sessions.set(id,s);respond(res,201,{id,tokenRequired:true});return;
   }
   const match=url.pathname.match(/^\/session\/([a-f0-9-]+)(?:\/(take\/(\d+)|run|cancel|status|video|social-copy|exports|export-video\/(shorts|reels|vk|youtube)))?$/);const s=match&&(sessions.get(match[1])||await restoreSession(match[1]));if(!s){respond(res,404,{error:'unknown_session'});return}
   if(match[2]==='social-copy'&&req.method==='POST'){
    if(s.state!=='completed')fail('Сначала соберите MP4.');
    const title=typeof s.brief.title==='string'&&s.brief.title.trim()
     ?s.brief.title.trim().replace(/\s+/g,' ').slice(0,160):'Reels';
    await socialCopy(req,res,join(s.output,'ai-edited-reel.mp4'),title);return;
   }
   if(req.method==='DELETE'&&!match[2]){
    if(s.state!=='uploading'||s.child)fail('Only an unstarted upload can be discarded');
    if(dirname(s.input)!==resolve(config.outputRoot)||basename(s.input)!=='.worker-staging-'+s.id)fail('Invalid owned staging directory');
    await import('node:fs/promises').then(({rm})=>rm(s.input,{recursive:true,force:true}));sessions.delete(s.id);respond(res,200,{discarded:true,originalsChanged:false});return;
   }
   if(req.method==='POST'&&match[2]==='exports'){
    if(s.state!=='completed'||s.exports?.state==='running'||ideationBusy||directorPending||activeExport||[...sessions.values()].some(j=>j.state==='running'))fail('A completed local MP4 and idle worker are required');
    activeExport=true;
    const output=join(s.output,'platform-exports-'+randomUUID());
    s.exports={state:'running',stage:'starting',output};
    const child=spawn(process.execPath,[join(here,'persona-platform-edits.mjs'),join(s.output,'RESULT.json'),output,s.model,...(config.ffmpegDir?[config.ffmpegDir]:[])],{windowsHide:true,shell:false,env:envPath(config.ffmpegDir),stdio:['ignore','pipe','pipe']});
    s.exportChild=child;child.stdout.resume();let error='';child.stderr.on('data',b=>error=(error+b).slice(-3000));
    const timer=setInterval(()=>{readFile(join(output,'EXPORT-PROGRESS.json'),'utf8').then(raw=>{if(s.exports?.state==='running')s.exports={...s.exports,...JSON.parse(raw)}}).catch(()=>{})},1000).unref();
    child.once('error',e=>{activeExport=false;s.exports={state:'failed',error:e.message,output}});
    child.once('close',async code=>{clearInterval(timer);s.exportChild=null;activeExport=false;try{if(code!==0)throw Error(error||'Platform export process failed');const report=JSON.parse(await readFile(join(output,'EXPORTS.json'),'utf8'));if(report.distributionAllowed!==false||!Array.isArray(report.exports))throw Error('Invalid export report');s.exports={state:'completed',stage:'completed',output,reportPath:join(output,'EXPORTS.json'),report}}catch(e){s.exports={state:'failed',error:e.message,output}}});
    respond(res,202,s.exports);return;
   }
   if(req.method==='GET'&&match[2]?.startsWith('export-video/')){
    const entry=s.exports?.state==='completed'&&s.exports.report?.exports.find(e=>e.platform===match[4]&&e.status==='awaiting-author-review');
    if(!entry||!entry.videoPath?.startsWith(s.exports.output+String.fromCharCode(process.platform==='win32'?92:47)))fail('Verified platform video unavailable');
    if(await fileHash(entry.videoPath)!==entry.sha256)fail('Platform MP4 changed after QA');
    const size=(await stat(entry.videoPath)).size;res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':size,'Content-Disposition':'attachment; filename="'+match[4]+'.mp4"','Cache-Control':'no-store'});createReadStream(entry.videoPath).pipe(res);return;
   }
   if(req.method==='GET'&&match[2]==='status'){scan(s);respond(res,200,await sessionView(s));return}
   if(req.method==='PUT'&&match[2]?.startsWith('take/')){
    const index=Number(match[3]),name=req.headers['x-persona-file-name'];const length=Number(req.headers['content-length']);if(s.state!=='uploading'||!Number.isInteger(index)||index<0||index>=s.expected||s.uploaded.has(index)||!safeFile(name)||!Number.isSafeInteger(length)||length<1024||length>maxFile||s.total+length>maxTotal)fail('invalid explicit take upload');
    if(s.takeBindings&&Number(/^S(\d{2})_take01\./i.exec(name)?.[1])!==s.takeBindings[index]?.sceneOrder)fail('File does not match its declared frame');
    const sourceName=originalName(req.headers['x-persona-original-name'],name);
    const path=join(s.input,name);let ownsPartial=false;const sink=createWriteStream(path,{flags:'wx'});sink.once('open',()=>{ownsPartial=true});try{await pipeline(req,sink);if((await stat(path)).size!==length)fail('upload size mismatch');const media=await inspectUploadedTake(path,config);const durationSec=Number(media.duration);
     const sceneNumber=Number(/^S(\d{2})_take/i.exec(name)?.[1]);const planned=s.masterAsset?900:s.brief.script[sceneNumber-1]?.durationSec??20;
     const limit=s.masterAsset?900:Math.min(60,Math.max(15,Number(planned)*3));
     if(!Number.isFinite(durationSec)||durationSec<.25||durationSec>limit)fail('Длительность '+sourceName+': '+durationSec.toFixed(2)+' с. Для этого кадра допустимо до '+limit+' с; выберите короткий дубль.');
     const intake={version:1,durationSec,media,...(s.takeBindings?{binding:s.takeBindings[index]}:{}),originalName:sourceName,stagedName:name,bytes:length,sha256:await fileHash(path)};await writeFile(join(s.input,'source-'+index+'.json'),JSON.stringify(intake,null,2)+'\n',{flag:'wx'});s.uploaded.add(index);s.total+=length;respond(res,200,{ok:true,index,sha256:intake.sha256,durationSec:intake.durationSec});}catch(error){if(ownsPartial)await import('node:fs/promises').then(({rm})=>rm(path,{force:true}));throw error}return;
   }
   if(req.method==='POST'&&match[2]==='run'){
    if(config.musicLut&&!await exists(config.musicLut))
     fail('Humble LUT не найден в luts/. Проверьте PERSONA_MEDIA_ROOT в .env.local.');
    if(activeExport||ideationBusy||directorPending||[...sessions.values()].some(j=>j!==s&&j.state==='running'))fail('Worker is busy; retry after the current task');
    if(s.takeBindings){
     const frozen=[];for(let i=0;i<s.expected;i++){const intake=JSON.parse(await readFile(join(s.input,'source-'+i+'.json'),'utf8'));frozen.push({...s.takeBindings[i],sha256:intake.sha256})}
     const checked=readTakeBindings(s.brief,frozen,true);s.takeBindingsPath=join(s.input,'take-bindings.json');await writeFile(s.takeBindingsPath,JSON.stringify(checked,null,2),{flag:'wx'});
    }
    if(s.masterAsset){
     if(s.uploaded.size!==1||s.state!=='uploading')fail('One uploaded master asset required');
     const intake=JSON.parse(await readFile(join(s.input,'source-0.json'),'utf8'));if(!safeFile(intake.stagedName))fail('Invalid staged master name');
     s.sourceManifest=join(s.input,'master-sources.json');
     await writeFile(s.sourceManifest,JSON.stringify({version:1,sources:[{id:'master',path:intake.stagedName}]}),{flag:'wx'});
    }
    if(s.state!=='uploading'||s.uploaded.size!==s.expected)fail('all selected takes must finish uploading');const intake=JSON.parse(await readFile(join(s.input,'source-0.json'),'utf8'));
    await s.production.transition('ANALYZING',{reason:'Verified media received for local render',
     asset:{name:intake.stagedName,sha256:intake.sha256,durationSec:intake.durationSec}});
    s.state='running';s.stage='intake';
    try{runProcess(s,config)}catch(error){await s.production.markFailed(String(error.message||error));s.state='failed';throw error}
    respond(res,202,await sessionView(s));return;
   }
   if(req.method==='POST'&&match[2]==='cancel'){
    if(s.state!=='running'||!s.child)fail('no active worker job');s.cancelled=true;s.child.kill();respond(res,202,{ok:true,notice:'Cancellation requested; partial artifacts remain for inspection.'});return;
   }
   if(req.method==='GET'&&match[2]==='video'){
    if(s.state!=='completed')fail('final MP4 not ready');const video=join(s.output,'ai-edited-reel.mp4'),size=(await stat(video)).size;res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':size,'Content-Disposition':'inline; filename="ai-edited-reel.mp4"','Cache-Control':'no-store'});createReadStream(video).pipe(res);return;
   }
   respond(res,404,{error:'unknown_route'});
  }catch(error){respond(res,400,{error:String(error.message||error).slice(0,3000)})}
 });
 return {server,token,config,start:()=>new Promise((resolveStart,reject)=>{
  server.once('error',reject);
  server.listen(config.port,host,()=>{server.off('error',reject);resolveStart(server.address().port);});
 })};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{if(await exists(resolve('.env.local'))){if(typeof process.loadEnvFile!=='function')fail('Use Node22+ to load .env.local');process.loadEnvFile(resolve('.env.local'));}const worker=createPersonaMediaWorker();
try{const seed=await seedCarousels(worker.config.quickRenderRoot||quickRenderRoot());
 process.stdout.write('Persona carousel seeds: '+seed.count+' projects, '+seed.created+' new, '+seed.existing+' existing.\n');}
catch(error){process.stderr.write('CAROUSEL_SEED_WARNING: '+String(error.message||error)+'\n');}
const port=await worker.start();process.stdout.write('Persona AI Media Worker: http://127.0.0.1:'+port+'\n')}catch(error){process.stderr.write(String(error.message||error)+'\n');process.exitCode=1}}

