/** Temporal evidence for private reference videos. Reuses the production QA and
 * offline ASR paths; never changes sources or claims music/semantic understanding. */
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile,writeFile,rename,unlink,open,mkdir,realpath,stat,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute,sep,delimiter} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {FOLDERS} from './persona-yandex-library.mjs';
import {analyzePersonaVideoQuality} from './persona-video-quality.mjs';
import {transcribe,parseWhisperJson} from './persona-semantic-autoselect.mjs';
const VERSION='reference-video-v1',MAX_DURATION=900,MAX_LOG=8*1024*1024;
const validHash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const round=n=>Math.round(n*1000)/1000;
const dirFor=cache=>join(resolve(cache),'catalogs',FOLDERS[1]);
const hash=async path=>{const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex')};
const cleanError=e=>String(e?.message??e).replace(/https?:\/\/\S+/g,'[URL omitted]').slice(0,300);
function run(bin,args,{ffmpegDir,timeoutMs=180000}={}){
 const env={...process.env},key=Object.keys(env).find(k=>k.toLowerCase()==='path')||'PATH';
 if(ffmpegDir)env[key]=resolve(ffmpegDir)+delimiter+(env[key]||'');
 return new Promise((ok,bad)=>{
  const p=spawn(bin,args,{env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',finished=false,bytes=0;
  const finish=(e)=>{if(finished)return;finished=true;clearTimeout(timer);e?bad(e):ok({stdout,stderr})};
  const timer=setTimeout(()=>{p.kill();finish(Error(bin+' timeout'))},timeoutMs);
  for(const [stream,name] of [[p.stdout,'stdout'],[p.stderr,'stderr']])stream.on('data',b=>{
   bytes+=b.length;if(bytes>MAX_LOG){p.kill();finish(Error(bin+' output limit'));return}
   if(name==='stdout')stdout+=b;else stderr+=b;
  });
  p.on('error',finish);p.on('close',code=>finish(code===0?null:Error(bin+' exited '+code)));
 });
}
/** FFmpeg scene scores detect abrupt content changes, not editorial cuts with certainty. */
export function summarizeSceneCandidates(times,durationSec,{threshold=.30,minGap=.25}={}){
 if(!Number.isFinite(durationSec)||durationSec<=0||durationSec>MAX_DURATION||!Array.isArray(times))throw Error('Invalid temporal bounds');
 const cuts=[];
 for(const t of [...times].filter(t=>Number.isFinite(t)&&t>=minGap&&t<=durationSec-minGap).sort((a,b)=>a-b)){
  if(!cuts.length||t-cuts.at(-1)>=minGap)cuts.push(t);
 }
 const bounds=[0,...cuts,durationSec],shots=bounds.slice(1).map((endSec,i)=>({startSec:round(bounds[i]),endSec:round(endSec),durationSec:round(endSec-bounds[i])}));
 const durations=shots.map(s=>s.durationSec).sort((a,b)=>a-b),mid=Math.floor(durations.length/2);
 return {method:'ffmpeg-select-scene',threshold,minGap,confidence:'heuristic',candidateCuts:cuts.map(round),shots,meanShotSec:round(durationSec/shots.length),medianShotSec:round(durations.length%2?durations[mid]:(durations[mid-1]+durations[mid])/2),cutsPerMinute:round(cuts.length*60/durationSec),openingCuts:cuts.filter(t=>t<=3).length};
}
export async function detectReferenceCuts(path,durationSec,{ffmpegDir}={}){
 const {stderr}=await run('ffmpeg',['-hide_banner','-nostdin','-loglevel','info','-i',path,'-map','0:v:0','-vf',"scale=320:-2,select='gt(scene,0.30)',showinfo",'-an','-f','null','-'],{ffmpegDir,timeoutMs:Math.max(180000,Math.ceil(durationSec*3000))});
 const times=[...stderr.matchAll(/\bpts_time:([0-9.eE+-]+)/g)].map(m=>Number(m[1]));
 return summarizeSceneCandidates(times,durationSec);
}
async function extractSpeech(path,durationSec,{ffmpegDir,whisperCli,whisperModel}={}){
 if(!whisperCli||!whisperModel)return {status:'NOT_CONFIGURED',segments:[]};
 const scratch=await mkdtemp(join(tmpdir(),'persona-ref-asr-'));
 try{
  const audioPath=join(scratch,'speech.wav');
  await run('ffmpeg',['-hide_banner','-nostdin','-v','error','-i',path,'-map','0:a:0','-ac','1','-ar','16000','-c:a','pcm_s16le',audioPath],{ffmpegDir});
  const analysisPath=join(scratch,'analysis.json');
  await writeFile(analysisPath,JSON.stringify({version:1,kind:'persona-evidence-v1',sources:[{id:'reference',hasAudio:true,audioPath,durationSec}]}));
  await transcribe(analysisPath,whisperCli,whisperModel);
  const segments=parseWhisperJson(JSON.parse(await readFile(join(scratch,'reference-whisper.json'),'utf8')),durationSec);
  return {status:'ASR_ESTIMATE',segments,limitations:'Speech estimate, not verified verbatim; no music recognition or source separation.'};
 }finally{await rm(scratch,{recursive:true,force:true})}
}
export async function analyzeReferenceVideo(path,expectedSha,{ffmpegDir,whisperCli,whisperModel}={}){
 if(!validHash(expectedSha)||await hash(path)!==expectedSha)throw Error('Reference source hash mismatch');
 const probe=JSON.parse((await run('ffprobe',['-v','error','-show_entries','format=duration','-of','json',path],{ffmpegDir,timeoutMs:30000})).stdout);
 const seconds=Number(probe.format?.duration);
 if(!Number.isFinite(seconds)||seconds<=0||seconds>MAX_DURATION)throw Error('Reference duration outside supported range');
 const quality=await analyzePersonaVideoQuality({videoPath:path,ffmpegDir});
 const durationSec=quality.video.durationSec;
 if(durationSec>MAX_DURATION||quality.video.sha256!==expectedSha)throw Error('Reference duration or hash mismatch');
 const finding=id=>quality.findings.find(f=>f.id===id)??null;
 const decode=finding('decode_integrity');
 if(decode?.status==='warning')throw Error('Video decode requires review');
 let montage,speech;
 try{montage={status:'HEURISTIC',...await detectReferenceCuts(path,durationSec,{ffmpegDir})}}catch(e){montage={status:'NOT_MEASURED',error:cleanError(e)}}
 if(!quality.video.audioCodec)speech={status:'NO_AUDIO',segments:[]};
 else try{speech=await extractSpeech(path,durationSec,{ffmpegDir,whisperCli,whisperModel})}catch(e){speech={status:'ERROR',segments:[],error:cleanError(e)}}
 if(await hash(path)!==expectedSha)throw Error('Reference changed during analysis');
 const {path:privatePath,...technical}=quality.video;
 return {version:VERSION,assetSha256:expectedSha,technical,montage,speech,
  sound:{loudness:finding('audio_loudness'),silence:finding('audio_silence'),changes:finding('audio_loudness_jumps'),musicIdentity:'NOT_MEASURED',soundDesign:'NOT_MEASURED'},
  color:finding('visual_metrics'),preference:'unconfirmed',narrative:'NOT_MEASURED',
  status:montage.status==='HEURISTIC'&&['ASR_ESTIMATE','NO_AUDIO'].includes(speech.status)?'MEASURED_WITH_LIMITATIONS':'PARTIAL',
  limitations:['Cut candidates may include flashes, motion and missed transitions.','Audio measurements describe mixed track; no stem separation or music identification.','ASR is an estimate; narrative and aesthetic preferences are not established.']};
}
async function atomic(path,data){const tmp=path+'.'+randomUUID()+'.tmp';try{await writeFile(tmp,JSON.stringify(data,null,2)+'\n',{flag:'wx'});await rename(tmp,path)}finally{await unlink(tmp).catch(()=>{})}}
export async function indexReferenceVideos({cache,limit=1,ffmpegDir,whisperCli,whisperModel,analyze=analyzeReferenceVideo}={}){
 if(!cache||!Number.isInteger(limit)||limit<1||limit>5)throw Error('Invalid video index batch');
 const dir=dirFor(cache),out=join(dir,'video-evidence');await mkdir(out,{recursive:true});
 const lockPath=join(dir,'reference-video.lock'),lock=await open(lockPath,'wx');
 try{
  const catalog=JSON.parse(await readFile(join(dir,'persona-assets-v1.json'),'utf8'));
  if(catalog.kind!=='persona-local-library-v1'||!Array.isArray(catalog.assets))throw Error('Invalid catalog');
  const root=await realpath(join(resolve(cache),'sources',FOLDERS[1]));
  const assets=[...new Map(catalog.assets.filter(a=>a.availability==='local'&&a.kind==='video'&&validHash(a.sha256)).map(a=>[a.sha256,a])).values()];
  let analyzed=0,reused=0,remaining=0,blocked=0,attempted=0;const errors=[];
  for(const a of assets){
   const file=join(out,a.sha256+'.json');
   let previous=null;
   try{previous=JSON.parse(await readFile(file,'utf8'));if(previous.version!==VERSION||previous.assetSha256!==a.sha256||!['MEASURED_WITH_LIMITATIONS','PARTIAL','ERROR'].includes(previous.status))throw Error('Invalid prior video evidence')}
   catch(e){if(e.code!=='ENOENT')throw e}
   if(previous&&previous.status!=='ERROR'&&(!whisperCli||!whisperModel||previous.speech?.status==='ASR_ESTIMATE'||previous.speech?.status==='NO_AUDIO')){reused++;continue}
   if(previous?.attempts>=2){blocked++;continue}
   if(attempted>=limit){remaining++;continue}attempted++;
   try{
    if(!Number.isFinite(a.metadata?.durationSec)||a.metadata.durationSec<=0||a.metadata.durationSec>MAX_DURATION)throw Error('Missing duration or video exceeds 15 minute limit');
    const source=await realpath(a.sourcePath),rel=relative(root,source),s=await stat(source);
    if(!rel||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)||!s.isFile())throw Error('Source outside reference cache');
    const report=await analyze(source,a.sha256,{ffmpegDir,whisperCli,whisperModel});
    if(report.assetSha256!==a.sha256||report.version!==VERSION||!['MEASURED_WITH_LIMITATIONS','PARTIAL'].includes(report.status))throw Error('Invalid analyzer result');
    await atomic(file,{...report,attempts:(previous?.attempts??0)+1});analyzed++;
   }catch(e){
    const error=cleanError(e);errors.push({assetSha256:a.sha256,error});
    // Retain successful partial evidence if a later ASR attempt fails.
    await atomic(file,{...(previous?.status==='PARTIAL'?previous:{version:VERSION,assetSha256:a.sha256,status:'ERROR'}),attempts:(previous?.attempts??0)+1,lastError:error});
   }
  }
  const report={version:VERSION,status:errors.length||blocked||remaining?'PARTIAL':'INDEXED_WITH_LIMITATIONS',total:assets.length,analyzed,reused,remaining,blocked,errors};
  await atomic(join(dir,'reference-video-progress.json'),report);return report;
 }finally{await lock.close();await unlink(lockPath)}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const [cache]=process.argv.slice(2);
  const report=await indexReferenceVideos({cache,ffmpegDir:process.env.PERSONA_FFMPEG_DIR,whisperCli:process.env.PERSONA_MEDIA_WHISPER_CLI,whisperModel:process.env.PERSONA_MEDIA_WHISPER_MODEL});console.log(JSON.stringify(report,null,2));
 }catch(e){console.error(cleanError(e));process.exitCode=1}
}
