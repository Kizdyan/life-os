#!/usr/bin/env node
/**
 * Local Persona AI Media Worker. This is intentionally a loopback-only bridge
 * from an explicit browser file selection to the existing AI reel CLI.
 * It accepts bytes, never client file paths or commands; originals are staged
 * as copies and every persistent result lives in a new worker-owned folder.
 */
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {createWriteStream,createReadStream} from 'node:fs';
import {access,mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {join,resolve,basename,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {selectCreativePreset,getVisualPreset} from './persona-creative-director.mjs';
import {proposePersonaIdeas,selectPersonaIdea} from './persona-idea-selection.mjs';
import {commercialPrompt} from './persona-commercial-prompt.mjs';

const here=resolve(fileURLToPath(new URL('.',import.meta.url)));
const host='127.0.0.1';
const maxFile=2*1024*1024*1024, maxTotal=4*1024*1024*1024;
const takeName=/^(?:S(?:0[1-9]|[12]\d|30)_take(?:0[1-9]|[1-9]\d)|(?:A|B)0[1-4]_[a-z0-9_-]+_take(?:0[1-9]|[1-9]\d))\.(?:mp4|mov|mkv|webm|m4v)$/i;
const modelName=/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,119}$/;
const variations=new Set(['cinematic','humor','intimate','unexpected']);
const sessions=new Map();
function fail(message){throw Error('Persona Media Worker: '+message)}
function respond(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data))}
function envPath(bin){const copy={...process.env};const key=Object.keys(copy).find(k=>k.toLowerCase()==='path')||'PATH';if(bin)copy[key]=resolve(bin)+(process.platform==='win32'?';':':')+(copy[key]||'');return copy}
function parseArgs(args){
 const value=(flag,required=true)=>{const i=args.indexOf(flag);const v=i<0?undefined:args[i+1];if(required&&(!v||v.startsWith('--')))fail('missing '+flag);return v};
 const unknown=args.filter((item,i)=>item.startsWith('--')&&!['--port','--output-root','--ffmpeg-dir','--whisper-cli','--whisper-model','--ollama-model'].includes(item)&&!(i&&args[i-1].startsWith('--')));if(unknown.length)fail('unknown argument '+unknown[0]);
 const port=Number(value('--port',false)||process.env.PERSONA_MEDIA_WORKER_PORT||47832);
 if(!Number.isInteger(port)||(port!==0&&(port<1024||port>65535)))fail('invalid port');
 return {port,outputRoot:resolve(value('--output-root')||process.env.PERSONA_MEDIA_OUTPUT_ROOT||join(tmpdir(),'persona-ai-media-results')),
  ffmpegDir:value('--ffmpeg-dir',false)||process.env.PERSONA_MEDIA_FFMPEG_DIR,
  whisperCli:resolve(value('--whisper-cli')||process.env.PERSONA_MEDIA_WHISPER_CLI||''),
  whisperModel:resolve(value('--whisper-model')||process.env.PERSONA_MEDIA_WHISPER_MODEL||''),
  ollamaModel:value('--ollama-model',false)||process.env.PERSONA_MEDIA_OLLAMA_MODEL||'qwen3:4b-instruct'};
}
function validBrief(value){return value&&typeof value==='object'&&!Array.isArray(value)&&(value.preEditPlanNeedsReview===undefined||value.preEditPlanNeedsReview===false)&&value.version===1&&value.sourceFormat==='reel'&&Array.isArray(value.script)&&value.script.length>=2&&value.script.length<=30&&Array.isArray(value.shots)&&value.shots.length===value.script.length&&value.script.every((b,i)=>b&&b.order===i+1&&typeof b.line==='string'&&b.line.trim())&&value.shots.every((s,i)=>s&&s.order===i+1)}
async function json(req,limit=512*1024){let bytes=0,parts=[];for await(const part of req){bytes+=part.length;if(bytes>limit)fail('request too large');parts.push(part)}try{return JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{fail('invalid JSON')}}
async function exists(file){try{await access(file);return true}catch{return false}}
function permittedOrigin(origin){return /^http:\/\/(?:localhost|127\.0\.0\.1):(5173|5174|5175|4173)$/.test(origin||'')}
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
function sessionView(s){
 const evidence=join(s.output,'evidence','analysis.json'), decisions=join(s.output,'decisions.ai.json'), timeline=join(s.output,'timeline.json'), finished=join(s.output,'ai-edited-reel.mp4');
 let stage=s.stage;
 if(s.state==='running')stage=s.files.has('result')?'technical_qa':s.files.has('finished')?'color_render':s.files.has('timeline')?'ffmpeg_timeline':s.files.has('decisions')?'ollama_selection':s.files.has('evidence')?'whisper_asr':'intake';
 return {id:s.id,state:s.state,stage,uploaded:s.uploaded.size,expected:s.expected,totalBytes:s.total,error:s.error??null,
  outputPath:s.state==='completed'?s.output:null,videoPath:s.state==='completed'?finished:null,
  resultPath:s.state==='completed'?join(s.output,'RESULT.json'):null,qaPath:s.state==='completed'?join(s.output,'ai-edited-qa.json'):null,
  result:s.resultSummary??null,
  exports:s.exports??null,
  artifacts:{evidence:s.files.has('evidence'),decisions:s.files.has('decisions'),timeline:s.files.has('timeline'),finished:s.files.has('finished')}};
}
function scan(s){for(const [name,file] of Object.entries({evidence:join(s.output,'evidence','analysis.json'),decisions:join(s.output,'decisions.ai.json'),timeline:join(s.output,'timeline.json'),finished:join(s.output,'ai-edited-reel.mp4'),result:join(s.output,'RESULT.json')}))if(s.files.has(name)===false){stat(file).then(()=>s.files.add(name),()=>{})}}
function runProcess(s,config){
 const args=[join(here,'persona-ai-reel.mjs'),'--takes',s.sourceManifest??s.input,'--brief',s.briefPath,'--out',s.output,'--whisper-cli',config.whisperCli,'--whisper-model',config.whisperModel,'--ollama-model',s.model,'--variation',s.variation];
 if(config.ffmpegDir)args.push('--ffmpeg-dir',config.ffmpegDir);
 if(s.burnSubtitles)args.push('--burn-subtitles','true');
 if(s.visualPreset)args.push('--visual-preset',s.visualPreset);
 s.child=spawn(process.execPath,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],env:envPath(config.ffmpegDir)});
 let stderr='';s.child.stderr.on('data',b=>stderr=(stderr+String(b)).slice(-6000));s.child.stdout.on('data',()=>scan(s));
 s.timer=setInterval(()=>scan(s),750).unref();
 s.child.on('error',error=>{s.state='failed';s.error=String(error.message||error)});
 s.child.on('close',async code=>{clearInterval(s.timer);s.child=null;scan(s);if(s.cancelled){s.state='cancelled';s.error='Cancelled by the author; originals were not changed.';return}
  if(code!==0){s.state='failed';s.error=(stderr||'AI reel process exited '+code).slice(-3000);return}
  try{const result=JSON.parse(await readFile(join(s.output,'RESULT.json'),'utf8'));if(result.status!=='awaiting-author-review'||result.distributionAllowed!==false||typeof result.aiFinishedVideo!=='string')fail('runner did not provide a verified unpublished AI MP4');s.resultSummary={status:result.status,briefFingerprintSha256:result.briefFingerprintSha256,sourceSelection:result.sourceSelection,aiEditorial:result.aiEditorial,output:result.output,aiFinishedVideo:result.aiFinishedVideo,aiColorPackage:result.aiColorPackage,aiFinishedQaPath:result.aiFinishedQaPath,creativeDirection:s.direction??null,subtitleBurnIn:result.subtitleBurnIn??null,technicalChecks:result.technicalChecks,distributionAllowed:false};s.state='completed';s.stage='awaiting_author_review';}
  catch(error){s.state='failed';s.error=String(error.message||error)}
 });
}
export function createPersonaMediaWorker(config=parseArgs(process.argv.slice(2))){
 const token=randomUUID();
 const directorDecisions=new Map();let directorPending=null,ideationBusy=false,activeExport=false;
 const briefHash=brief=>createHash('sha256').update(JSON.stringify(brief)).digest('hex');
 const server=createServer(async(req,res)=>{
  const origin=req.headers.origin;if(origin&&!permittedOrigin(origin)){respond(res,403,{error:'origin_not_allowed'});return}
  const expected=new Set(['127.0.0.1:'+server.address().port,'localhost:'+server.address().port]);if(!expected.has(req.headers.host||'')){respond(res,403,{error:'host_not_allowed'});return}
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin')}
  if(req.method==='OPTIONS'&&origin){res.writeHead(204,{'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,X-Persona-Worker-Token,X-Persona-File-Name,X-Persona-Original-Name'});res.end();return}
  const url=new URL(req.url||'/','http://127.0.0.1');
  try{
   if(req.method==='GET'&&url.pathname==='/health'){
    const status=await health(config);
    respond(res,200,{...status,service:'persona-media-worker',creativeDirector:true,token,model:config.ollamaModel,ffmpegDir:config.ffmpegDir?true:false});return;
   }
   const videoToken=req.method==='GET'&&(url.pathname.endsWith('/video')||/\/export-video\/(shorts|reels|vk|youtube)$/.test(url.pathname))?url.searchParams.get('token'):null;
   if(req.headers['x-persona-worker-token']!==token&&videoToken!==token){respond(res,401,{error:'invalid_local_worker_token'});return}
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
    let direction=null;
    if(body.directionMode==='auto'){
     const receipt=directorDecisions.get(body.directorDecisionId);
     if(!receipt||receipt.briefSha256!==briefHash(body.brief)||receipt.model!==config.ollamaModel||Date.now()-Date.parse(receipt.createdAt)>30*60*1000)fail('AI Director decision missing, stale or belongs to another brief');
     direction={...receipt,mode:'auto'};
    }else if(body.directionMode==='manual'){
     getVisualPreset(body.visualPreset);direction={mode:'manual',selected_preset:body.visualPreset,model:null,briefSha256:briefHash(body.brief)};
    }else if(body.directionMode!==undefined)fail('Invalid director mode');
    await mkdir(config.outputRoot,{recursive:true});const id=randomUUID(),input=join(config.outputRoot,'.worker-staging-'+id),output=join(config.outputRoot,'ai-reel-'+id);await mkdir(input,{recursive:false});
    // The established runner owns output creation and rejects a pre-existing
    // directory. The approved brief is worker-owned staging input instead.
    const briefPath=join(input,'approved-production-brief.json');await writeFile(briefPath,JSON.stringify(body.brief,null,2)+'\n',{flag:'wx'});
    if(direction)await writeFile(join(input,'AI-DIRECTOR.json'),JSON.stringify(direction,null,2)+'\n',{flag:'wx'});
    const s={id,input,output,briefPath,direction,visualPreset:direction?.selected_preset??null,variation:direction?getVisualPreset(direction.selected_preset).editorialVariation:body.variation,model:body.model||config.ollamaModel,burnSubtitles:body.burnSubtitles===true,masterAsset:body.masterAsset===true,expected:Number(body.takeCount),uploaded:new Set(),total:0,state:'uploading',stage:'intake',files:new Set(),child:null,cancelled:false,error:null};
    if(!Number.isInteger(s.expected)||s.expected<(s.masterAsset?1:2)||s.expected>12||s.masterAsset&&s.expected!==1)fail('choose 2–12 explicitly named takes');sessions.set(id,s);respond(res,201,{id,tokenRequired:true});return;
   }
   const match=url.pathname.match(/^\/session\/([a-f0-9-]+)(?:\/(take\/(\d+)|run|cancel|status|video|exports|export-video\/(shorts|reels|vk|youtube)))?$/);const s=match&&sessions.get(match[1]);if(!s){respond(res,404,{error:'unknown_session'});return}
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
   if(req.method==='GET'&&match[2]==='status'){scan(s);respond(res,200,sessionView(s));return}
   if(req.method==='PUT'&&match[2]?.startsWith('take/')){
    const index=Number(match[3]),name=req.headers['x-persona-file-name'];const length=Number(req.headers['content-length']);if(s.state!=='uploading'||!Number.isInteger(index)||index<0||index>=s.expected||s.uploaded.has(index)||!safeFile(name)||!Number.isSafeInteger(length)||length<1024||length>maxFile||s.total+length>maxTotal)fail('invalid explicit take upload');
    const sourceName=originalName(req.headers['x-persona-original-name'],name);
    const path=join(s.input,name);let ownsPartial=false;const sink=createWriteStream(path,{flags:'wx'});sink.once('open',()=>{ownsPartial=true});try{await pipeline(req,sink);if((await stat(path)).size!==length)fail('upload size mismatch');const intake={version:1,originalName:sourceName,stagedName:name,bytes:length,sha256:await fileHash(path)};await writeFile(join(s.input,'source-'+index+'.json'),JSON.stringify(intake,null,2)+'\n',{flag:'wx'});s.uploaded.add(index);s.total+=length;respond(res,200,{ok:true,index,sha256:intake.sha256});}catch(error){if(ownsPartial)await import('node:fs/promises').then(({rm})=>rm(path,{force:true}));throw error}return;
   }
   if(req.method==='POST'&&match[2]==='run'){
    if(activeExport||ideationBusy||directorPending||[...sessions.values()].some(j=>j!==s&&j.state==='running'))fail('Worker is busy; retry after the current task');
    if(s.masterAsset){
     if(s.uploaded.size!==1||s.state!=='uploading')fail('One uploaded master asset required');
     const intake=JSON.parse(await readFile(join(s.input,'source-0.json'),'utf8'));if(!safeFile(intake.stagedName))fail('Invalid staged master name');
     s.sourceManifest=join(s.input,'master-sources.json');
     await writeFile(s.sourceManifest,JSON.stringify({version:1,sources:[{id:'master',path:intake.stagedName}]}),{flag:'wx'});
    }
    if(s.state!=='uploading'||s.uploaded.size!==s.expected)fail('all selected takes must finish uploading');s.state='running';s.stage='intake';runProcess(s,config);respond(res,202,sessionView(s));return;
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
 return {server,token,config,start:()=>new Promise(resolveStart=>server.listen(config.port,host,()=>resolveStart(server.address().port)))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{const worker=createPersonaMediaWorker();const port=await worker.start();process.stdout.write('Persona AI Media Worker: http://127.0.0.1:'+port+'\n')}catch(error){process.stderr.write(String(error.message||error)+'\n');process.exitCode=1}}

