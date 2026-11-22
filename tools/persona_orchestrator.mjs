#!/usr/bin/env node
import {createHash, randomUUID} from 'node:crypto';
import {isPersonaStrategy} from '../packages/core/src/persona-strategy.mjs';
import {createReadStream} from 'node:fs';
import {open, readFile, writeFile, mkdir, rename, readdir, lstat, stat, unlink} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {basename, dirname, extname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {cachedFfprobe} from './persona-stage-cache.mjs';
import {coverageGate,approvedCandidates,styleGate,economicsCommand} from './persona-p3-adapter.mjs';
import {renderApprovedBroll} from './persona-approved-broll.mjs';
import {proposeIntercuts,applyReviewedZoomFallback} from './persona-intercut-planner.mjs';
import {WEEKLY_SLOTS} from '../packages/core/src/persona-editorial-calendar.mjs';
export const STATES = Object.freeze([
  'PREPARING','WAITING_FOR_FOOTAGE','ANALYZING','EDITING','QUALITY_CHECK','AWAITING_APPROVAL','FAILED'
]);
const NEXT = new Map(STATES.slice(0,-2).map((s,i)=>[s,STATES[i+1]]));
const VIDEO_EXT = new Set(['.mp4','.mov','.m4v','.mkv','.webm']);
const PHOTO_EXT = new Set(['.jpg','.jpeg','.png']);
const validPhotoSourceName=n=>typeof n==='string'&&n===basename(n)&&n.length<=240&&!n.startsWith('.')&&!/[/\\\x00-\x1f:]/.test(n)&&PHOTO_EXT.has(extname(n).toLowerCase());
const PROBE_TIMEOUT_MS = 15_000;
const MAX_SECONDS = 900;
const MIN_SECONDS = .25;
const batchAdapter = fileURLToPath(new URL('./beatsync_adapter.py', import.meta.url));
const batchPython = fileURLToPath(new URL(process.platform==='win32' ?
  '../.venv-beats/Scripts/python.exe' : '../.venv-beats/bin/python', import.meta.url));
function fail(message){throw new Error('ProductionJob: '+message)}
const productionStages=new Set(['local-media','research','images']);
const safeRelative=p=>typeof p==='string'&&p.length<=300&&p.startsWith('output/')&&p.split('/').every(x=>/^[\w.-]+$/.test(x)&&x!=='.'&&x!=='..');
const isAlive=pid=>{try{process.kill(pid,0);return true}catch(error){return error.code!=='ESRCH'}};
function productionPlan(input){
  if(!input||!['reel','carousel','photo'].includes(input.format)||typeof input.contentId!=='string'||
     !/^[\w:-]{1,120}$/.test(input.contentId))fail('Invalid scheduled content ID/format');
  const due=Date.parse(input.productionAt),publication=Date.parse(input.publicationAt);
  if(!Number.isFinite(due)||!Number.isFinite(publication)||(publication-due)/86400000<7||
     (publication-due)/86400000>14)fail('Production buffer must be 7–14 days');
  const date=new Date(publication).toISOString().slice(0,10);
  if(input.slotId!==`persona:${date}:${input.format}`||
     WEEKLY_SLOTS.find(x=>x.format===input.format)?.weekday!==new Date(publication).getUTCDay())fail('Invalid editorial calendar slot');
  const b=input.budget;
  if(!b||b.paidCalls!==0||!Number.isInteger(b.maxAttempts)||b.maxAttempts<1||b.maxAttempts>2||
     !Number.isSafeInteger(b.maxInputBytes)||b.maxInputBytes<1||b.maxInputBytes>500*1024*1024||
     !Number.isInteger(b.maxStageMs)||b.maxStageMs<1000||b.maxStageMs>120000)fail('Invalid zero-paid production resource budget');
  if(!Array.isArray(input.stages)||!input.stages.length||input.stages.length>3||
     new Set(input.stages).size!==input.stages.length||input.stages.some(s=>!productionStages.has(s)))fail('Invalid production stages');
  if(!Array.isArray(input.sources)||input.sources.length>12||input.sources.some(s=>!s||
     !/^[\w.-]{1,180}$/.test(s.name)||s.name.startsWith('.')||!(/\.(mp4|mov|m4v|mkv|webm|png|jpe?g)$/i.test(s.name))||
     !/^[a-f0-9]{64}$/.test(s.sha256)||!Number.isSafeInteger(s.bytes)||s.bytes<1)||
     new Set(input.sources.map(s=>s.name)).size!==input.sources.length||
     input.sources.reduce((n,s)=>n+s.bytes,0)>b.maxInputBytes)fail('Invalid scheduled input sources');
  return {slotId:input.slotId,contentId:input.contentId,format:input.format,
    productionAt:new Date(due).toISOString(),publicationAt:new Date(publication).toISOString(),
    stages:[...input.stages],sources:input.sources.map(({name,sha256,bytes})=>({name,sha256,bytes})),budget:{...b,paidCalls:0}};
}
async function verifyScheduledArtifact(directory,artifact){
  if(!safeRelative(artifact?.path)||!/^[a-f0-9]{64}$/.test(artifact?.sha256))fail('Invalid production receipt');
  let current=directory;
  for(const part of artifact.path.split('/')){current=join(current,part);if((await lstat(current)).isSymbolicLink())fail('Production receipt symlink refused')}
  if(!(await lstat(current)).isFile()||await fingerprint(current)!==artifact.sha256)fail('Production receipt changed');
}
export async function lockProductionSchedule(path){
  const metadata=JSON.stringify({kind:'persona-production-schedule-lock',pid:process.pid,token:randomUUID()});
  const recoveryPath=path+'.recovery';let handle;
  try{await lstat(recoveryPath);fail('Job locked by mutex recovery; retained for inspection')}
  catch(error){if(error.code!=='ENOENT')throw error}
  try{handle=await open(path,'wx')}
  catch(error){
    if(error.code!=='EEXIST')throw error;
    // A second guard serializes stale-lock recovery. Unknown/legacy locks are
    // never stolen; a crash inside this tiny recovery window requires inspection.
    let recovery;
    try{recovery=await open(recoveryPath,'wx')}catch{fail('Job locked by another recovery')}
    try{
      await recovery.writeFile(metadata);
      const raw=await readFile(path,'utf8');let owner;
      try{owner=JSON.parse(raw)}catch{fail('Job locked by unknown or legacy owner')}
      if(owner.kind!=='persona-production-schedule-lock'||!Number.isSafeInteger(owner.pid)||owner.pid<1||
         typeof owner.token!=='string'||!owner.token||isAlive(owner.pid))fail('Job locked by live or unknown owner');
      if(await readFile(path,'utf8')!==raw)fail('Job lock changed during recovery');
      await unlink(path);
      try{handle=await open(path,'wx')}catch{fail('Job lock changed before recovery claim')}
    }finally{await recovery.close();await unlink(recoveryPath)}
  }
  try{await handle.writeFile(metadata);return handle}
  catch(error){await handle.close();await unlink(path).catch(()=>{});throw error}
}
function safeDir(p){if(typeof p!=='string'||!p.trim()) fail('Job path required');return resolve(p)}
function validState(s){return STATES.includes(s)}
function validFileName(n){return typeof n==='string' && n===basename(n) && !/[\\/\x00-\x1f:]/.test(n) && VIDEO_EXT.has(extname(n).toLowerCase()) && n.length<=240 && !n.startsWith('.');}
async function probeVideo(p){
  const folder=process.env.PERSONA_MEDIA_FFMPEG_DIR;
  const binary=folder ? join(folder,process.platform==='win32'?'ffprobe.exe':'ffprobe') : 'ffprobe';
  const args=['-v','error','-show_entries','format=duration:stream=codec_type','-of','json'];
  const data=await cachedFfprobe(p,{binary,args,run:(command,options)=>new Promise((ok,no)=>{
    const child=spawn(command,options,
      {shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let out='',err='',settled=false;
    const finish=(e,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(e)no(e);else ok(value)};
    const timer=setTimeout(()=>{child.kill();finish(new Error('ffprobe timeout'))},PROBE_TIMEOUT_MS);
    child.stdout.on('data',chunk=>{out+=String(chunk);if(out.length>256_000){child.kill();finish(new Error('ffprobe output too large'))}});
    child.stderr.on('data',chunk=>{err=(err+String(chunk)).slice(-1000)});
    child.once('error',e=>finish(e));
    child.once('close',code=>{
      if(code!==0)return finish(new Error('ffprobe failed: '+err));
      finish(null,out);
    });
  })});
  const durationSec=Number(data.format?.duration);
  if(!Number.isFinite(durationSec)||durationSec<MIN_SECONDS||durationSec>MAX_SECONDS ||
     !data.streams?.some(x=>x.codec_type==='video'))throw Error('Unsupported video or duration');
  return {durationSec};
}
async function fingerprint(path){
  const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');
}
function runBatchPhase(phase, source, output, options, timeout) {
  return new Promise((ok,no)=>{
    const child=spawn(batchPython,['-E','-B','-X','utf8',batchAdapter,phase,source,output,...options],
      {shell:false,windowsHide:true,stdio:['ignore','ignore','pipe']});
    let stderr='',timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;child.kill();},timeout);
    child.stderr.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-2400);});
    child.once('error',error=>{
      clearTimeout(timer);
      no(Error(error.code==='ENOENT'?'Install the pinned beat-synced-edit in .venv-beats first':error.message));
    });
    child.once('close',code=>{
      clearTimeout(timer);
      if(timedOut)no(Error('Cinematic Calm '+phase+' timed out'));
      else if(code!==0)no(Error(stderr.trim()||'Cinematic Calm '+phase+' failed'));
      else ok();
    });
  });
}
export class ProductionJob {
  constructor(directory){this.directory=safeDir(directory);this.path=join(this.directory,'job.json');}
  static async create(directory,{title='Persona production',strategy,contentType=null}={}){
    if(contentType!==null&&!['video','photo-carousel','photo-slideshow'].includes(contentType))fail('Invalid production content type');
    if(strategy!==undefined&&!isPersonaStrategy(strategy))fail('Invalid project strategy');
    const dir=safeDir(directory);await mkdir(dir,{recursive:false});
    await mkdir(join(dir,'input'));await mkdir(join(dir,'output'));
    const job=new ProductionJob(dir),now=new Date().toISOString();
    await writeFile(job.path,JSON.stringify({version:1,id:randomUUID(),title,status:'PREPARING',revision:0,
      createdAt:now,updatedAt:now,assets:[],history:[],...(strategy?{strategy}:{}),
      ...(contentType?{contentType}:{})},null,2)+'\n',{flag:'wx'});
    return job;
  }
  async read(){
    const data=JSON.parse(await readFile(this.path,'utf8'));
    if((data.fullRender!==undefined&&(!['RENDERING','COMPLETED','FAILED'].includes(data.fullRender?.status)||
       data.status!=='AWAITING_APPROVAL'))||
       (data.contentType!==undefined&&!['video','photo-carousel','photo-slideshow'].includes(data.contentType))||
       (data.strategy!==undefined&&!isPersonaStrategy(data.strategy))||data.version!==1||!validState(data.status)||!Number.isSafeInteger(data.revision)||
       !Array.isArray(data.history)||!Array.isArray(data.assets)||typeof data.id!=='string')fail('Corrupt job state');
    if(data.productionSchedule!==undefined){
      const q=data.productionSchedule;
      if(q?.version!==1||q.publicationApproved!==false||q.distributionAllowed!==false||
         !Array.isArray(q.stages)||q.stages.some(s=>!productionStages.has(s?.name)||
         !['pending','running','completed','blocked','exhausted','retry_wait'].includes(s.status)||
         !Number.isInteger(s.attempts)||s.attempts<0||s.attempts>2))fail('Corrupt production schedule');
      productionPlan({...q,stages:q.stages.map(s=>s.name)});
    }
    return data;
  }
  /** Schedule/checkpoints share the existing job.json lock and lifecycle authority. */
  async updateProductionSchedule(mutate){
    const lock=this.path+'.lock',handle=await lockProductionSchedule(lock);
    let temp;
    try{
      const data=await this.read(),next=await mutate(structuredClone(data));
      if(!next)return data;
      next.revision=data.revision+1;next.updatedAt=new Date().toISOString();
      temp=this.path+'.'+randomUUID()+'.tmp';
      await writeFile(temp,JSON.stringify(next,null,2)+'\n',{flag:'wx'});await rename(temp,this.path);temp=null;
      return next;
    }finally{if(temp)await unlink(temp).catch(()=>{});await handle.close();await unlink(lock)}
  }
  async scheduleProduction(input){
    const plan=productionPlan(input),planSha256=createHash('sha256').update(JSON.stringify(plan)).digest('hex');
    for(const source of plan.sources){
      const directory=join(this.directory,'input'),path=join(directory,source.name),info=await lstat(path);
      if((await lstat(directory)).isSymbolicLink()||info.isSymbolicLink()||!info.isFile()||
         info.size!==source.bytes||await fingerprint(path)!==source.sha256)fail('Scheduled original does not verify');
    }
    return this.updateProductionSchedule(data=>{
      if(data.productionSchedule){if(data.productionSchedule.planSha256!==planSha256)fail('Refuse overwrite with different production schedule');return null}
      if(!['PREPARING','WAITING_FOR_FOOTAGE'].includes(data.status))fail('Schedule requires an unrendered existing job');
      data.productionSchedule={...plan,version:1,planSha256,publicationApproved:false,distributionAllowed:false,
        stages:plan.stages.map(name=>({name,status:'pending',attempts:0,artifacts:[]})),events:[]};
      return data;
    });
  }
  async verifyProductionReceipts(){
    const data=await this.read();
    for(const stage of data.productionSchedule?.stages??[])if(stage.status==='completed'){
      if(!stage.artifacts?.length)fail('Missing production receipt');
      for(const artifact of stage.artifacts)await verifyScheduledArtifact(this.directory,artifact);
    }
    return data;
  }
  async claimProductionStage({owner,now=new Date().toISOString()}={}){
    if(typeof owner!=='string'||!/^[\w-]{1,80}$/.test(owner)||!Number.isFinite(Date.parse(now)))fail('Invalid production claim');
    let claim=null;
    await this.updateProductionSchedule(async data=>{
      const q=data.productionSchedule;if(!q||data.status==='FAILED'||Date.parse(now)<Date.parse(q.productionAt))return null;
      for(const s of q.stages)if(s.status==='completed')for(const a of s.artifacts)await verifyScheduledArtifact(this.directory,a);
      const running=q.stages.find(s=>s.status==='running');
      if(running){
        if(!running.lease||isAlive(running.lease.pid))return null;
        running.status=running.attempts>=q.budget.maxAttempts?'exhausted':'retry_wait';
        running.error='Previous Worker stopped; retained attempt artifacts';running.nextAttemptAt=now;delete running.lease;
        q.events.push({stage:running.name,event:'dead-owner-recovery',at:now});
      }
      const s=q.stages.find(s=>['pending','retry_wait'].includes(s.status)&&s.attempts<q.budget.maxAttempts&&
        (!s.nextAttemptAt||Date.parse(now)>=Date.parse(s.nextAttemptAt)));
      if(s){
        const token=randomUUID();s.status='running';s.attempts++;
        s.lease={owner,pid:process.pid,token,startedAt:now,expiresAt:new Date(Date.parse(now)+q.budget.maxStageMs+30000).toISOString()};
        claim={stage:s.name,attempt:s.attempts,token,schedule:structuredClone(q)};
        q.events.push({stage:s.name,event:'claimed',attempt:s.attempts,at:now});
      }
      return running||s?data:null;
    });return claim;
  }
  async settleProductionStage({token,artifacts,blocked,error,now=new Date().toISOString()}={}){
    if(typeof token!=='string'||!Number.isFinite(Date.parse(now)))fail('Invalid production settlement');
    return this.updateProductionSchedule(async data=>{
      const q=data.productionSchedule,s=q?.stages.find(s=>s.status==='running'&&s.lease?.token===token);
      if(!s)fail('Production lease changed');
      if(blocked){s.status='blocked';s.attempts--;s.error=String(blocked).slice(0,500)}
      else if(error){s.status=s.attempts>=q.budget.maxAttempts?'exhausted':'retry_wait';
        s.error=String(error).slice(0,500);s.nextAttemptAt=new Date(Date.parse(now)+30000).toISOString()}
      else{
        if(!Array.isArray(artifacts)||!artifacts.length||artifacts.length>20)fail('Verified artifacts required');
        for(const a of artifacts)await verifyScheduledArtifact(this.directory,a);
        s.status='completed';s.artifacts=artifacts.map(({path,sha256})=>({path,sha256}));delete s.error;
      }
      delete s.lease;q.events.push({stage:s.name,event:s.status,at:now});return data;
    });
  }
  async transition(to,{reason='',asset=null,batchToken=null,batch=null}={}){
    if(!validState(to))fail('Unknown stage '+to);
    const lock=this.path+'.lock',handle=await lockProductionSchedule(lock);
    try{
      const owner=await readFile(this.path+'.batch.lock','utf8').catch(error=>{
        if(error.code!=='ENOENT')throw error;
        return null;
      });
      if(owner!==null&&owner!==batchToken)fail('Cinematic Calm batch has reserved this job');
      const data=await this.read();
      if(to==='FAILED'?['AWAITING_APPROVAL','FAILED'].includes(data.status):NEXT.get(data.status)!==to)fail('Illegal transition '+data.status+' -> '+to);
      if(typeof reason!=='string'||reason.length>1000)fail('Invalid transition reason');
      if(to==='ANALYZING' && (!asset || !(validFileName(asset.name)||validPhotoSourceName(asset.name))||!Number.isFinite(asset.durationSec)||
          !/^[a-f0-9]{64}$/.test(asset.sha256)))fail('Analysis requires verified input file evidence');
      const now=new Date().toISOString();
      const update={...data,status:to,revision:data.revision+1,updatedAt:now,
        ...(to==='FAILED'?{failure:{message:reason||'Производственная задача завершилась с ошибкой',at:now}}:{}),
        ...(batch?{batch}:{}),
        assets:asset?[...data.assets,asset]:data.assets,
        history:[...data.history,{from:data.status,to,at:now,reason:reason||'normal progression'}]};
      const tmp=this.path+'.'+randomUUID()+'.tmp';
      try{await writeFile(tmp,JSON.stringify(update,null,2)+'\n',{flag:'wx'});await rename(tmp,this.path)}
      finally{await unlink(tmp).catch(()=>{})}
      return update;
    }finally{await handle.close();await unlink(lock)}
  }
  /** CAS + exclusive lock: enrich an old seeded job without resetting its status or media. */
  async attachStrategy(strategy,expectedRevision){
    if(!isPersonaStrategy(strategy))fail('Invalid strategy');
    const lock=this.path+'.lock';let handle;
    try{handle=await open(lock,'wx')}catch(error){if(error.code==='EEXIST')fail('Job locked; retry migration later');throw error}
    try{
      const data=await this.read();
      if(data.strategy!==undefined){
        if(JSON.stringify(data.strategy)!==JSON.stringify(strategy))fail('Author strategy differs: refuse overwrite');
        return data;
      }
      if(data.revision!==expectedRevision)fail('Job changed before strategy migration');
      const next={...data,strategy,revision:data.revision+1,updatedAt:new Date().toISOString()};
      const temp=this.path+'.'+randomUUID()+'.tmp';
      try{await writeFile(temp,JSON.stringify(next,null,2)+'\n',{flag:'wx'});await rename(temp,this.path)}
      finally{await unlink(temp).catch(()=>{})}
      return next;
    }finally{await handle.close();await unlink(lock)}
  }
  async markReady(){return this.transition('WAITING_FOR_FOOTAGE',{reason:'approved shooting brief is ready'})}
  /** Durable terminal failure for Worker and quick-render; the job.json transition is authoritative. */
  async markFailed(message){
    if(typeof message!=='string'||!message.trim())fail('Failure explanation required');
    return this.transition('FAILED',{reason:message.trim().slice(0,1000)});
  }
  /** High-resolution derivative of an approved draft; job.json remains the only lifecycle authority.
   * The verified 720p draft stays downloadable even when this optional derivative fails.
   */
  async updateFullRender(to,{reason='',videoName=null,sha256=null,bytes=null}={}){
    if(!['RENDERING','COMPLETED','FAILED'].includes(to))fail('Unknown full-render phase');
    if(typeof reason!=='string'||reason.length>1000)fail('Invalid full-render reason');
    const lock=this.path+'.lock';let handle;
    try{handle=await open(lock,'wx')}
    catch(error){if(error.code==='EEXIST')fail('Job locked by another worker');throw error}
    try{
      const data=await this.read();
      if(data.status!=='AWAITING_APPROVAL')fail('Full render requires verified draft');
      const old=data.fullRender?.status??null;
      if(to==='RENDERING'?old!==null&&old!=='FAILED':old!=='RENDERING')
        fail('Illegal full-render transition '+old+' -> '+to);
      if(to==='COMPLETED'&&(!['full-edited.mp4','full-ready.mp4'].includes(videoName)||
         !/^[a-f0-9]{64}$/.test(sha256)||!Number.isSafeInteger(bytes)||bytes<1024))
        fail('Full render requires a verified MP4 receipt');
      const now=new Date().toISOString();
      const event={from:old,to,at:now,reason:reason||'high-resolution render'};
      const fullRender={status:to,attempt:(data.fullRender?.attempt??0)+(to==='RENDERING'?1:0),
        history:[...(data.fullRender?.history??[]),event],
        startedAt:to==='RENDERING'?now:data.fullRender?.startedAt,
        ...(to==='COMPLETED'?{videoName,sha256,bytes,finishedAt:now}:{}),
        ...(to==='FAILED'?{error:reason||'Полный рендер завершился ошибкой',finishedAt:now}:{}),
      };
      const update={...data,revision:data.revision+1,updatedAt:now,fullRender};
      const tmp=this.path+'.'+randomUUID()+'.tmp';
      try{await writeFile(tmp,JSON.stringify(update,null,2)+'\n',{flag:'wx'});await rename(tmp,this.path)}
      finally{await unlink(tmp).catch(()=>{})}
      return update;
    }finally{await handle.close();await unlink(lock)}
  }
  /** Gate editing on verified source-bound, reviewed shot coverage. */
  async inspectCoverage({brief,bindings,approvalSha256}={}){
    if((await this.read()).status!=='ANALYZING')fail('P3 coverage requires ANALYZING');
    if(!brief||!bindings||!approvalSha256)fail('P3 requires approved brief, bindings, and approved SHA');
    const output=join(this.directory,'output','coverage-'+randomUUID()+'.json');
    const result=await coverageGate({brief,bindings,approvalSha256,input:join(this.directory,'input'),output});
    if(result.status==='PASS')await this.transition('EDITING',{reason:'P3 shot coverage and author evidence verified'});
    return {status:result.status,reportPath:output,summary:result.report.summary};
  }
  /** Return candidates, not a replacement for author selection. */
  async suggestApprovedMoments({file,database,kind,minScore=4}={}){
    const state=await this.read();
    if(state.status!=='EDITING')fail('Moment lookup requires EDITING');
    if(!validFileName(file))fail('Invalid source filename');
    const asset=state.assets.find(a=>a.name===file);
    if(!asset)fail('Source is not a verified job asset');
    const video=join(this.directory,'input',file);
    if((await lstat(video)).isSymbolicLink()||asset.sha256!==await fingerprint(video))
      fail('Moment source has changed');
    return approvedCandidates({database:database?resolve(database):join(this.directory,'approved-moments.sqlite3'),video,kind,minScore});
  }
  /** Apply the style contract to final, complete effective render intent. */
  async checkStyle({plan,contract}={}){
    if((await this.read()).status!=='EDITING')fail('Style gate requires EDITING');
    if(!plan)fail('Resolved render intent required');
    return styleGate({plan,...(contract?{contract}:{})});
  }
  /** Separate accounting; never automatically mark human work complete. */
  async economics({command,args=[]}={}){
    return economicsCommand({database:join(this.directory,'economics.sqlite3'),command,args});
  }
  /** Generate metadata-based cut-risk proposals. This does not approve or insert footage. */
  async prepareIntercuts({timelinePath}={}){
    if((await this.read()).status!=='EDITING')fail('Intercut planning requires EDITING');
    if(typeof timelinePath!=='string'||!timelinePath.trim())fail('Existing EditPlan required');
    const source=await readFile(resolve(timelinePath),'utf8');
    const timeline=JSON.parse(source);
    const plan={...proposeIntercuts(timeline),timelineSha256:createHash('sha256').update(source).digest('hex')};
    const output=join(this.directory,'output','intercut-'+randomUUID()+'.json');
    await writeFile(output,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
    return {status:'AWAITING_INTERCUT_REVIEW',path:output,suggestions:plan.suggestions};
  }
  /** Apply only reviewed slow push-in choices to an exact, hash-matched EditPlan. */
  async applyIntercutZoom({timelinePath,intercutPath,reviewedAfterClips=[]}={}){
    if((await this.read()).status!=='EDITING')fail('Intercut changes require EDITING');
    const source=await readFile(resolve(timelinePath),'utf8');
    const timeline=JSON.parse(source),plan=JSON.parse(await readFile(resolve(intercutPath),'utf8'));
    if(plan.timelineSha256!==createHash('sha256').update(source).digest('hex'))fail('Stale intercut plan');
    const output=join(this.directory,'output','intercut-reviewed-'+randomUUID()+'.json');
    const edited=applyReviewedZoomFallback(timeline,plan,{reviewedAfterClips});
    await writeFile(output,JSON.stringify(edited,null,2)+'\n',{flag:'wx'});
    return {status:'REVIEWED_EDIT_PLAN_READY',path:output,publicationApproved:false};
  }
  /** Reuse existing SHA/rights-reviewed B-roll renderer, never select media without approval. */
  async renderReviewedBroll({timelinePath,matchesPath,catalogPath,captionsPath,selectionPath}={}){
    if((await this.read()).status!=='EDITING')fail('B-roll render requires EDITING');
    if(![timelinePath,matchesPath,catalogPath,captionsPath,selectionPath].every(x=>typeof x==='string'&&x.trim()))
      fail('Reviewed B-roll needs five explicit source files');
    const outputDir=join(this.directory,'output','reviewed-broll-'+randomUUID());
    const result=await renderApprovedBroll({timelinePath,matchesPath,catalogPath,captionsPath,selectionPath,outputDir});
    if(result.status!=='AWAITING_AUTHOR_REVIEW'||result.publicationApproved!==false||result.distributionAllowed!==false)
      fail('B-roll result did not pass safe review contract');
    await this.transition('QUALITY_CHECK',{reason:'Approved B-roll was rendered and technical QA completed'});
    await this.transition('AWAITING_APPROVAL',{reason:'B-roll montage requires author review'});
    return result;
  }
  async scanForFootage(stability){
    const state=await this.read();if(state.status!=='WAITING_FOR_FOOTAGE')return {changed:false,status:state.status};
    const dir=join(this.directory,'input');
    if(!(await lstat(dir)).isDirectory())fail('Input directory is not a real directory');
    const entries=(await readdir(dir)).filter(validFileName).sort();
    for(const name of entries){
      const file=join(dir,name),info=await lstat(file);
      if(!info.isFile()||info.size<1024){stability.delete(name);continue}
      const signature=String(info.size)+':'+String(info.mtimeMs);
      const previous=stability.get(name);
      const repeated=previous?.signature===signature?(previous.count+1):1;
      stability.set(name,{signature,count:repeated});
      if(repeated<3 || Date.now()-info.mtimeMs<2500)continue;
      let probe;
      try{probe=await probeVideo(file)}catch{return {changed:false,status:state.status,warning:'input not yet readable'};}
      const before=await stat(file);let digest;
      try{digest=await fingerprint(file)}catch{continue}
      const after=await stat(file);
      if(before.size!==after.size||before.mtimeMs!==after.mtimeMs){stability.delete(name);continue}
      const asset={name,sha256:digest,bytes:after.size,durationSec:probe.durationSec};
      const next=await this.transition('ANALYZING',{reason:'verified footage arrived',asset});
      return {changed:true,status:next.status,asset};
    }
    return {changed:false,status:state.status};
  }
  async watchForFootage({pollMs=1000,onEvent=()=>{}}={}){
    if(!Number.isInteger(pollMs)||pollMs<250)fail('pollMs must be >=250');
    const stability=new Map();let stopped=false;
    while(!stopped){
      const result=await this.scanForFootage(stability);onEvent(result);
      if(result.changed || result.status!=='WAITING_FOR_FOOTAGE')return result;
      await new Promise(resolve=>setTimeout(resolve,pollMs));
    }
  }
  async runBatch({count=4,protectedFile,stylepackFile,styleIntentFile}={}){
    if(!Number.isInteger(count)||count<3||count>5)fail('Batch count must be 3, 4 or 5');
    if((await this.read()).status==='WAITING_FOR_FOOTAGE')await this.watchForFootage();
    const path=this.path+'.batch.lock', token=randomUUID();
    let lock;
    try{lock=await open(path,'wx');}catch(error){
      if(error.code==='EEXIST')fail('Cinematic Calm batch is already running');
      throw error;
    }
    let output, economicStageId=null, economicJobId=null;
    const economicsDb=join(this.directory,'economics.sqlite3');
    try{
      await lock.writeFile(token);
      const state=await this.read();
      if(!['ANALYZING','EDITING'].includes(state.status)||state.assets.length!==1)
        fail('Batch requires one verified source at ANALYZING or EDITING');
      const asset=state.assets[0];
      if(!validFileName(asset.name)||asset.durationSec>MAX_SECONDS||asset.durationSec<count*18)
        fail('Batch needs enough verified footage, up to 15 minutes');
      const input=join(this.directory,'input'), root=join(this.directory,'output'), source=join(input,asset.name);
      if(!(await lstat(input)).isDirectory()||!(await lstat(root)).isDirectory()
          ||!(await lstat(source)).isFile()||asset.sha256!==await fingerprint(source))
        fail('A verified input or production directory changed');
      const folder='batch-'+randomUUID();
      output=join(root,folder);
      await mkdir(output);
      await runBatchPhase('plan-batch',source,output,['--count',String(count),
        ...(protectedFile?['--protected',resolve(protectedFile)]:[])],600_000);
      if(state.status==='ANALYZING')await this.transition('EDITING',
        {reason:'Cinematic Calm phrase plan created',batchToken:token});
      if(styleIntentFile){
        const gate=await styleGate({plan:resolve(styleIntentFile)});
        await writeFile(join(output,'P3-STYLE-GATE.json'),JSON.stringify(gate.result,null,2)+'\n',{flag:'wx'});
        if(gate.status!=='PASS')fail('P3 creative style contract blocked this batch');
      }else if(process.env.PERSONA_P3_REQUIRE_STYLE==='1')fail('P3 style contract requires --style-intent');
      if(process.env.PERSONA_P3_ECONOMICS==='1'){
        economicJobId='batch-'+folder;
        await economicsCommand({database:economicsDb,command:'create',args:[economicJobId]});
        const started=await economicsCommand({database:economicsDb,command:'start',args:[economicJobId,'EDITING']});
        economicStageId=started.stageId;
      }
      await runBatchPhase('render-batch',source,output,
        stylepackFile?['--stylepack',resolve(stylepackFile)]:[],1_200_000);
      if(economicStageId){
        await economicsCommand({database:economicsDb,command:'finish',args:[economicStageId]});
        economicStageId=null;
      }
      const manifest=join(output,'BATCH-RESULT.json');
      const result=JSON.parse(await readFile(manifest,'utf8'));
      if(result.version!==1||result.sourceSha256!==asset.sha256||await fingerprint(source)!==asset.sha256
          ||result.publicationApproved!==false||result.distributionAllowed!==false||result.reels?.length!==count)
        fail('Batch result did not verify against the original source');
      for(const [i,reel] of result.reels.entries()){
        const expected='reel-'+String(i+1).padStart(2,'0')+'/studio.mp4';
        if(reel.path!==expected||reel.sha256!==await fingerprint(join(output,expected)))
          fail('A batch render is missing or changed');
      }
      if(economicJobId){
        const started=await economicsCommand({database:economicsDb,command:'start',args:[economicJobId,'QUALITY_CHECK']});
        await economicsCommand({database:economicsDb,command:'finish',args:[started.stageId]});
        const report=await economicsCommand({database:economicsDb,command:'report',args:[economicJobId]});
        await writeFile(join(output,'P3-ECONOMICS.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
      }
      const batch={folder,count,manifestSha256:await fingerprint(manifest)};
      await this.transition('QUALITY_CHECK',{reason:'All batch MP4s passed decode, duration and audio QA',batchToken:token,batch});
      await this.transition('AWAITING_APPROVAL',{reason:'Batch package ready for author review',batchToken:token});
      return {output, ...result};
    }catch(error){
      if(economicStageId)await economicsCommand({database:economicsDb,command:'finish',args:[economicStageId,'--failed']}).catch(()=>{});
      if(output)await writeFile(join(output,'BATCH-ERROR.json'),
        JSON.stringify({status:'failed',error:error.message})+'\n',{flag:'wx'}).catch(()=>{});
      throw error;
    }finally{
      await lock.close();
      await unlink(path);
    }
  }
}
async function cli(){
  const [action,rawDir,...args]=process.argv.slice(2),target=args[0];
  if(!['init','ready','status','watch','advance','batch','coverage','moments','style','economics','broll','intercut','zoom'].includes(action)||!rawDir)
    fail('Usage: init|ready|status|watch|advance|batch|coverage|moments|style|economics|broll|intercut|zoom JOB_DIR [options]');
  if(action==='init'){const job=await ProductionJob.create(rawDir);console.log(JSON.stringify(await job.read(),null,2));return}
  const job=new ProductionJob(rawDir);
  if(action==='ready'){console.log(JSON.stringify(await job.markReady(),null,2));return}
  if(action==='status'){console.log(JSON.stringify(await job.read(),null,2));return}
  if(action==='coverage'){
    const opts={};
    for(let i=0;i<args.length;i+=2){if(!['--brief','--bindings','--approval-sha256'].includes(args[i])||!args[i+1])fail('Invalid coverage option');opts[args[i]]=args[i+1]}
    console.log(JSON.stringify(await job.inspectCoverage({brief:opts['--brief'],bindings:opts['--bindings'],approvalSha256:opts['--approval-sha256']}),null,2));return;
  }
  if(action==='moments'){
    const opts={};
    for(let i=0;i<args.length;i+=2){if(!['--file','--db','--kind','--min-score'].includes(args[i])||!args[i+1])fail('Invalid moments option');opts[args[i]]=args[i+1]}
    console.log(JSON.stringify(await job.suggestApprovedMoments({file:opts['--file'],database:opts['--db'],kind:opts['--kind'],minScore:opts['--min-score']?Number(opts['--min-score']):4}),null,2));return;
  }
  if(action==='style'){
    const opts={};
    for(let i=0;i<args.length;i+=2){if(!['--plan','--contract'].includes(args[i])||!args[i+1])fail('Invalid style option');opts[args[i]]=args[i+1]}
    console.log(JSON.stringify(await job.checkStyle({plan:opts['--plan'],contract:opts['--contract']}),null,2));return;
  }
  if(action==='intercut'){
    if(args.length!==2||args[0]!=='--timeline')fail('Intercut usage: intercut JOB_DIR --timeline PATH');
    console.log(JSON.stringify(await job.prepareIntercuts({timelinePath:args[1]}),null,2));return;
  }
  if(action==='zoom'){
    const opts={};
    for(let i=0;i<args.length;i+=2){
      if(!['--timeline','--intercut-plan','--reviewed-after'].includes(args[i])||!args[i+1])fail('Invalid zoom option');
      opts[args[i]]=args[i+1];
    }
    const reviewedAfterClips=opts['--reviewed-after']?.split(',').map(Number)??[];
    console.log(JSON.stringify(await job.applyIntercutZoom({timelinePath:opts['--timeline'],intercutPath:opts['--intercut-plan'],reviewedAfterClips}),null,2));return;
  }
  if(action==='broll'){
    const opts={};
    for(let i=0;i<args.length;i+=2){
      if(!['--timeline','--matches','--catalog','--captions','--selection'].includes(args[i])||!args[i+1])fail('Invalid B-roll option');
      opts[args[i]]=args[i+1];
    }
    console.log(JSON.stringify(await job.renderReviewedBroll({timelinePath:opts['--timeline'],matchesPath:opts['--matches'],catalogPath:opts['--catalog'],captionsPath:opts['--captions'],selectionPath:opts['--selection']}),null,2));return;
  }
  if(action==='economics'){
    const [economicAction,...economicArgs]=args;
    console.log(JSON.stringify(await job.economics({command:economicAction,args:economicArgs}),null,2));return;
  }
  if(action==='batch'){
    const options={};
    const names={'--count':'count','--protected':'protectedFile','--stylepack':'stylepackFile','--style-intent':'styleIntentFile'};
    for(let i=0;i<args.length;i+=2){
      const name=names[args[i]],value=args[i+1];
      if(!name||!value||value.startsWith('--')||Object.hasOwn(options,name))fail('Invalid batch option');
      options[name]=name==='count'?Number(value):value;
    }
    console.log(JSON.stringify(await job.runBatch(options),null,2));return;
  }
  if(action==='advance'){
    if(!['EDITING','QUALITY_CHECK','AWAITING_APPROVAL'].includes(target))fail('Invalid manual stage');
    console.log(JSON.stringify(await job.transition(target,{reason:'explicit operator stage completion'}),null,2));return;
  }
  await job.watchForFootage({onEvent:r=>{if(r.changed||r.warning)console.log(JSON.stringify(r))}});
}
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  cli().catch(e=>{console.error(e.message);process.exitCode=1});
}
