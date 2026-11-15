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
function fail(message){throw new Error('ProductionJob: '+message)}
function safeDir(p){if(typeof p!=='string'||!p.trim()) fail('Job path required');return resolve(p)}
function validState(s){return STATES.includes(s)}
function validFileName(n){return typeof n==='string' && n===basename(n) && !/[\\/\x00-\x1f:]/.test(n) && VIDEO_EXT.has(extname(n).toLowerCase()) && n.length<=240 && !n.startsWith('.');}
async function probeVideo(p){
  return new Promise((ok,no)=>{
    const child=spawn('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',p],
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
  async transition(to,{reason='',asset=null}={}){
    if(!validState(to))fail('Unknown stage '+to);
    const lock=this.path+'.lock';let handle;
    try{handle=await open(lock,'wx');}catch(e){if(e.code==='EEXIST')fail('Job locked by another worker; investigate stale lock before recovery');throw e}
    try{
      const data=await this.read();
      if(NEXT.get(data.status)!==to)fail('Illegal transition '+data.status+' -> '+to);
      if(typeof reason!=='string'||reason.length>1000)fail('Invalid transition reason');
      if(to==='ANALYZING' && (!asset || !validFileName(asset.name)||!Number.isFinite(asset.durationSec)||
          !/^[a-f0-9]{64}$/.test(asset.sha256)))fail('Analysis requires verified input file evidence');
      const now=new Date().toISOString();
      const update={...data,status:to,revision:data.revision+1,updatedAt:now,
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
}
async function cli(){
  const [action,rawDir,target]=process.argv.slice(2);
  if(!['init','ready','status','watch','advance'].includes(action)||!rawDir)fail('Usage: init|ready|status|watch|advance JOB_DIR [NEXT_STAGE]');
  if(action==='init'){const job=await ProductionJob.create(rawDir);console.log(JSON.stringify(await job.read(),null,2));return}
  const job=new ProductionJob(rawDir);
  if(action==='ready'){console.log(JSON.stringify(await job.markReady(),null,2));return}
  if(action==='status'){console.log(JSON.stringify(await job.read(),null,2));return}
  if(action==='advance'){
    if(!['EDITING','QUALITY_CHECK','AWAITING_APPROVAL'].includes(target))fail('Invalid manual stage');
    console.log(JSON.stringify(await job.transition(target,{reason:'explicit operator stage completion'}),null,2));return;
  }
  await job.watchForFootage({onEvent:r=>{if(r.changed||r.warning)console.log(JSON.stringify(r))}});
}
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  cli().catch(e=>{console.error(e.message);process.exitCode=1});
}
