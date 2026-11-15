#!/usr/bin/env node
import {createHash, randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {open, readFile, writeFile, mkdir, rename, readdir, lstat, stat, unlink} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {basename, dirname, extname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const STATES = Object.freeze([
  'PREPARING','WAITING_FOR_FOOTAGE','ANALYZING','EDITING','QUALITY_CHECK','AWAITING_APPROVAL'
]);
const NEXT = new Map(STATES.slice(0,-1).map((s,i)=>[s,STATES[i+1]]));
const VIDEO_EXT = new Set(['.mp4','.mov','.m4v','.mkv','.webm']);
const PROBE_TIMEOUT_MS = 15_000;
const MAX_SECONDS = 900;
const MIN_SECONDS = .25;
const batchAdapter = fileURLToPath(new URL('./beatsync_adapter.py', import.meta.url));
const batchPython = fileURLToPath(new URL(process.platform==='win32' ?
  '../.venv-beats/Scripts/python.exe' : '../.venv-beats/bin/python', import.meta.url));
function fail(message){throw new Error('ProductionJob: '+message)}
function safeDir(p){if(typeof p!=='string'||!p.trim()) fail('Job path required');return resolve(p)}
function validState(s){return STATES.includes(s)}
function validFileName(n){return typeof n==='string' && n===basename(n) && !/[\\/\x00-\x1f:]/.test(n) && VIDEO_EXT.has(extname(n).toLowerCase()) && n.length<=240 && !n.startsWith('.');}
async function probeVideo(p){
  return new Promise((ok,no)=>{
    const folder=process.env.PERSONA_MEDIA_FFMPEG_DIR;
    const ffprobe=folder ? join(folder,process.platform==='win32'?'ffprobe.exe':'ffprobe') : 'ffprobe';
    const child=spawn(ffprobe,['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',p],
      {shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let out='',err='',settled=false;
    const finish=(e,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(e)no(e);else ok(value)};
    const timer=setTimeout(()=>{child.kill();finish(new Error('ffprobe timeout'))},PROBE_TIMEOUT_MS);
    child.stdout.on('data',chunk=>{out+=String(chunk);if(out.length>256_000){child.kill();finish(new Error('ffprobe output too large'))}});
    child.stderr.on('data',chunk=>{err=(err+String(chunk)).slice(-1000)});
    child.once('error',e=>finish(e));
    child.once('close',code=>{
      if(code!==0)return finish(new Error('ffprobe failed: '+err));
      try{
        const data=JSON.parse(out),duration=Number(data.format?.duration);
        if(!Number.isFinite(duration)||duration<MIN_SECONDS||duration>MAX_SECONDS ||
           !data.streams?.some(x=>x.codec_type==='video'))throw Error('Unsupported video or duration');
        finish(null,{durationSec:duration});
      }catch(e){finish(e)}
    });
  });
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
  static async create(directory,{title='Persona production'}={}){
    const dir=safeDir(directory);await mkdir(dir,{recursive:false});
    await mkdir(join(dir,'input'));await mkdir(join(dir,'output'));
    const job=new ProductionJob(dir),now=new Date().toISOString();
    await writeFile(job.path,JSON.stringify({version:1,id:randomUUID(),title,status:'PREPARING',revision:0,
      createdAt:now,updatedAt:now,assets:[],history:[]},null,2)+'\n',{flag:'wx'});
    return job;
  }
  async read(){
    const data=JSON.parse(await readFile(this.path,'utf8'));
    if(data.version!==1||!validState(data.status)||!Number.isSafeInteger(data.revision)||
       !Array.isArray(data.history)||!Array.isArray(data.assets)||typeof data.id!=='string')fail('Corrupt job state');
    return data;
  }
  async transition(to,{reason='',asset=null,batchToken=null,batch=null}={}){
    if(!validState(to))fail('Unknown stage '+to);
    const lock=this.path+'.lock';let handle;
    try{handle=await open(lock,'wx');}catch(e){if(e.code==='EEXIST')fail('Job locked by another worker; investigate stale lock before recovery');throw e}
    try{
      const owner=await readFile(this.path+'.batch.lock','utf8').catch(error=>{
        if(error.code!=='ENOENT')throw error;
        return null;
      });
      if(owner!==null&&owner!==batchToken)fail('Cinematic Calm batch has reserved this job');
      const data=await this.read();
      if(NEXT.get(data.status)!==to)fail('Illegal transition '+data.status+' -> '+to);
      if(typeof reason!=='string'||reason.length>1000)fail('Invalid transition reason');
      if(to==='ANALYZING' && (!asset || !validFileName(asset.name)||!Number.isFinite(asset.durationSec)||
          !/^[a-f0-9]{64}$/.test(asset.sha256)))fail('Analysis requires verified input file evidence');
      const now=new Date().toISOString();
      const update={...data,status:to,revision:data.revision+1,updatedAt:now,
        ...(batch?{batch}:{}),
        assets:asset?[...data.assets,asset]:data.assets,
        history:[...data.history,{from:data.status,to,at:now,reason:reason||'normal progression'}]};
      const tmp=this.path+'.'+randomUUID()+'.tmp';
      try{await writeFile(tmp,JSON.stringify(update,null,2)+'\n',{flag:'wx'});await rename(tmp,this.path)}
      finally{await unlink(tmp).catch(()=>{})}
      return update;
    }finally{await handle.close();await unlink(lock)}
  }
  async markReady(){return this.transition('WAITING_FOR_FOOTAGE',{reason:'approved shooting brief is ready'})}
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
  async runBatch({count=4,protectedFile,stylepackFile}={}){
    if(!Number.isInteger(count)||count<3||count>5)fail('Batch count must be 3, 4 or 5');
    if((await this.read()).status==='WAITING_FOR_FOOTAGE')await this.watchForFootage();
    const path=this.path+'.batch.lock', token=randomUUID();
    let lock;
    try{lock=await open(path,'wx');}catch(error){
      if(error.code==='EEXIST')fail('Cinematic Calm batch is already running');
      throw error;
    }
    let output;
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
      await runBatchPhase('render-batch',source,output,
        stylepackFile?['--stylepack',resolve(stylepackFile)]:[],1_200_000);
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
      const batch={folder,count,manifestSha256:await fingerprint(manifest)};
      await this.transition('QUALITY_CHECK',{reason:'All batch MP4s passed decode, duration and audio QA',batchToken:token,batch});
      await this.transition('AWAITING_APPROVAL',{reason:'Batch package ready for author review',batchToken:token});
      return {output, ...result};
    }catch(error){
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
  if(!['init','ready','status','watch','advance','batch'].includes(action)||!rawDir)
    fail('Usage: init|ready|status|watch|advance|batch JOB_DIR [NEXT_STAGE or batch options]');
  if(action==='init'){const job=await ProductionJob.create(rawDir);console.log(JSON.stringify(await job.read(),null,2));return}
  const job=new ProductionJob(rawDir);
  if(action==='ready'){console.log(JSON.stringify(await job.markReady(),null,2));return}
  if(action==='status'){console.log(JSON.stringify(await job.read(),null,2));return}
  if(action==='batch'){
    const options={};
    const names={'--count':'count','--protected':'protectedFile','--stylepack':'stylepackFile'};
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
