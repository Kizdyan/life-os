#!/usr/bin/env node
// Transport + durable queue only. V1.1 performs all heavy work on desktop.
import http from 'node:http';
import https from 'node:https';
import {readFile,writeFile,rename,mkdir,readdir,stat,copyFile,open,rm} from 'node:fs/promises';
import {createWriteStream,createReadStream} from 'node:fs';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve,join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {createRequest,newJob,markInputReady,transition,retry,canClaim,publicJob,sameRequest} from '../packages/core/src/persona-processing-contract.mjs';

const exec=promisify(execFile),root=resolve(process.env.PERSONA_BRIDGE_DATA||'.persona-processing');
const jobsDir=join(root,'jobs'),host=process.env.PERSONA_BRIDGE_HOST||'127.0.0.1';
const port=Number(process.env.PERSONA_BRIDGE_PORT||8787),bearer=process.env.PERSONA_BRIDGE_TOKEN||'';
const origin=process.env.PERSONA_BRIDGE_ORIGIN||'';
const cert=process.env.PERSONA_TLS_CERT,key=process.env.PERSONA_TLS_KEY;
const PIN='646f0708508c0fc603a43c555b771efe1176ee14';
if(bearer.length<32||!origin.startsWith('https://')||!Number.isInteger(port)||port<1||port>65535)
 throw Error('Configure long PERSONA_BRIDGE_TOKEN, exact HTTPS PERSONA_BRIDGE_ORIGIN, valid port');
if(Boolean(cert)!==Boolean(key)||(!cert&&!['127.0.0.1','::1','localhost'].includes(host)))
 throw Error('LAN bridge requires Safari-trusted TLS certificate and key');
const locks=new Map(),uploads=new Set();let pumping=false;
const safeId=id=>/^job-[a-f0-9]{32}$/.test(id);
const dir=id=>join(jobsDir,id),jsonPath=id=>join(dir(id),'job.json');
const inputPath=id=>join(dir(id),'input.media'),outputDir=id=>join(dir(id),'outputs');
const outputPath=id=>join(outputDir(id),'instagram.mp4');
function equal(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&timingSafeEqual(x,y);}
function error(code,message){return Object.assign(new Error(message),{status:code});}
function send(res,code,body){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
function fail(res,e){const code=e.status||500;if(code===500)console.error(e);send(res,code,{error:code===500?'worker_error':e.message});}
async function readJob(id){
 if(!safeId(id))throw error(400,'invalid_job_id');
 try{return JSON.parse(await readFile(jsonPath(id),'utf8'));}
 catch(e){if(e.code==='ENOENT')throw error(404,'job_not_found');throw e;}
}
async function save(job){
 await mkdir(dir(job.id),{recursive:true});
 const temp=join(dir(job.id),'job.'+randomBytes(8).toString('hex')+'.tmp');
 await writeFile(temp,JSON.stringify(job),{mode:0o600});await rename(temp,jsonPath(job.id));
}
async function lock(id,fn){
 const prev=locks.get(id)||Promise.resolve(),task=prev.catch(()=>{}).then(fn);
 const settled=task.then(()=>{},()=>{});locks.set(id,settled);
 try{return await task;}finally{if(locks.get(id)===settled)locks.delete(id);}
}
async function parseJson(req){
 let data='';for await(const b of req){data+=b;if(data.length>16000)throw error(413,'json_too_large');}
 try{return JSON.parse(data);}catch{throw error(400,'invalid_json');}
}
function publicView(job){
 const view=publicJob(job);
 if(view.outputAvailable&&job.outputToken)
  view.outputUrl='/v1/jobs/'+job.id+'/output?token='+encodeURIComponent(job.outputToken);
 return view;
}
async function receive(req,id){
 if(uploads.has(id))throw error(409,'upload_in_progress');uploads.add(id);
 try{
  const job=await readJob(id);
  if(job.status!=='queued')throw error(409,'job_already_processing');
  if(job.inputReady){req.resume();return publicView(job);}
  const size=Number(req.headers['content-length']);
  if(!Number.isSafeInteger(size)||size!==job.request.bytes)throw error(422,'media_size_mismatch');
  const temp=join(dir(id),'upload.'+randomBytes(8).toString('hex')+'.tmp');let count=0;
  try{
   await pipeline(req,new Transform({transform(chunk,encoding,cb){
    count+=chunk.length;cb(count>size?error(413,'media_too_large'):null,chunk);
   }}),createWriteStream(temp,{flags:'wx',mode:0o600}));
   if(count!==size)throw error(422,'media_incomplete');
   const file=await open(temp,'r');try{await file.sync();}finally{await file.close();}
   await rename(temp,inputPath(id));
   const updated=await lock(id,async()=>{
    const current=await readJob(id);
    if(current.status!=='queued')throw error(409,'job_already_processing');
    const next=markInputReady(current,size);await save(next);return next;
   });
   setImmediate(()=>void pump());return publicView(updated);
  }catch(e){await rm(temp,{force:true}).catch(()=>{});throw e;}
 }finally{uploads.delete(id);}
}
async function runPinnedEngine(job){
 const worktree=process.env.PERSONA_V11_WORKTREE;
 const adapter=process.env.PERSONA_V11_ADAPTER;
 if(!worktree||!adapter||!isAbsolute(worktree)||!isAbsolute(adapter))
  throw Error('v11_local_adapter_not_configured');
 const {stdout}=await exec('git',['-C',worktree,'rev-parse','HEAD'],{timeout:8000});
 if(stdout.trim()!==PIN)throw Error('v11_commit_mismatch');
 const runner=await import(pathToFileURL(adapter).href);
 if(typeof runner.process!=='function')throw Error('v11_adapter_invalid');
 // Stage each attempt separately. The published output appears only after
 // completed V1.1 processing and an atomic rename, never as a partial MP4.
 const runDir=join(outputDir(job.id),'run-'+job.attempt);
 await mkdir(runDir,{recursive:true});
 const result=await runner.process({inputPath:inputPath(job.id),outputDir:runDir,request:job.request});
 if(!result||typeof result.instagramPath!=='string'||!isAbsolute(result.instagramPath))
  throw Error('v11_no_instagram_output');
 const file=resolve(result.instagramPath),details=await stat(file);
 if(!details.isFile()||details.size<1000)throw Error('v11_output_invalid');
 // Acceptance is a real, decodable 9:16-ish H.264 MP4, not an arbitrary path.
 const inspected=await exec('ffprobe',['-v','error','-select_streams','v:0',
  '-show_entries','stream=codec_name,width,height','-of','json',file],{timeout:15000});
 const stream=JSON.parse(inspected.stdout).streams?.[0];
 const ratio=Number(stream?.height)/Number(stream?.width);
 if(stream?.codec_name!=='h264'||!Number.isFinite(ratio)||ratio<1.7||ratio>1.85)
  throw Error('v11_instagram_output_not_valid_vertical_h264');
 const temp=join(outputDir(job.id),'publish-'+randomBytes(8).toString('hex')+'.tmp');
 try{
  await copyFile(file,temp);
  const fd=await open(temp,'r');try{await fd.sync();}finally{await fd.close();}
  await rename(temp,outputPath(job.id));
 }catch(e){await rm(temp,{force:true}).catch(()=>{});throw e;}
 return 'instagram.mp4';
}
async function pump(){
 if(pumping)return;pumping=true;
 try{
  for(const id of (await readdir(jobsDir)).filter(safeId).sort()){
   if(uploads.has(id))continue;
   const current=await readJob(id);if(!canClaim(current))continue;
   const claimed=await lock(id,async()=>{
    const job=await readJob(id);if(!canClaim(job))return null;
    const next=transition(job,'processing');await save(next);return next;
   });
   if(!claimed)continue;
   try{
    const instagramFile=await runPinnedEngine(claimed);
    await lock(id,async()=>{
     const job=await readJob(id),next=transition(job,'review',{instagramFile});
     next.outputToken=randomBytes(32).toString('hex');await save(next);
    });
   }catch(e){
    await lock(id,async()=>{
     const job=await readJob(id);
     if(job.status==='processing')await save(transition(job,'failed',{error:String(e.message||e)}));
    });
   }
  }
 }catch(e){console.error('Persona queue error',e);}
 finally{pumping=false;}
}
async function serveVideo(req,res,id,url){
 const job=await readJob(id);
 if(!['review','ready'].includes(job.status)||!job.outputToken||!equal(job.outputToken,url.searchParams.get('token')))
  throw error(403,'video_access_denied');
 const file=outputPath(id),details=await stat(file),size=details.size;
 res.setHeader('Content-Type','video/mp4');res.setHeader('Accept-Ranges','bytes');
 res.setHeader('Cache-Control','private,no-store');res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Disposition','inline; filename="instagram.mp4"');res.setHeader('Referrer-Policy','no-referrer');
 let start=0,end=size-1;
 if(req.headers.range){
  const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
  if(!match)throw error(416,'invalid_range');
  start=Number(match[1]);end=match[2]?Number(match[2]):end;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||end>=size)throw error(416,'invalid_range');
  res.statusCode=206;res.setHeader('Content-Range','bytes '+start+'-'+end+'/'+size);
 }
 res.setHeader('Content-Length',end-start+1);
 createReadStream(file,{start,end}).pipe(res);
}
async function serve(req,res){
 try{
  if(req.headers.origin&&req.headers.origin!==origin)throw error(403,'origin_denied');
  if(req.headers.origin===origin){
   res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
   res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,OPTIONS');
   res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');
   if(req.headers['access-control-request-private-network']==='true')
    res.setHeader('Access-Control-Allow-Private-Network','true');
  }
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  const url=new URL(req.url,'https://localhost');
  const match=/^\/v1\/jobs\/(job-[a-f0-9]{32})(?:\/(input|retry|approve|output))?$/.exec(url.pathname);
  if(match?.[2]==='output'&&req.method==='GET'){await serveVideo(req,res,match[1],url);return;}
  const presented=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!equal(presented,bearer))throw error(401,'invalid_worker_token');
  if(url.pathname==='/v1/jobs'&&req.method==='POST'){
   const request=createRequest(await parseJson(req));
   const job=await lock(request.id,async()=>{
    let old;try{old=await readJob(request.id);}catch(e){if(e.status!==404)throw e;}
    if(old){if(!sameRequest(old.request,request))throw error(409,'immutable_request_conflict');return old;}
    const next=newJob(request);await save(next);return next;
   });
   send(res,200,publicView(job));return;
  }
  if(match&&req.method==='GET'&&!match[2]){send(res,200,publicView(await readJob(match[1])));return;}
  if(match?.[2]==='input'&&req.method==='PUT'){send(res,200,await receive(req,match[1]));return;}
  if(match?.[2]==='retry'&&req.method==='POST'){
   const job=await lock(match[1],async()=>{const x=retry(await readJob(match[1]));await save(x);return x;});
   setImmediate(()=>void pump());send(res,200,publicView(job));return;
  }
  if(match?.[2]==='approve'&&req.method==='POST'){
   const job=await lock(match[1],async()=>{
    const x=await readJob(match[1]);if(x.status!=='review')throw error(409,'review_not_ready');
    const next=transition(x,'ready');await save(next);return next;
   });
   send(res,200,publicView(job));return;
  }
  throw error(404,'route_not_found');
 }catch(e){fail(res,e);}
}
await mkdir(jobsDir,{recursive:true});
for(const id of (await readdir(jobsDir)).filter(safeId)){
 await lock(id,async()=>{
  const job=await readJob(id);
  if(job.status==='processing'){
   // Crash after final atomic output promotion must not re-run the engine.
   // Recover the existing single result instead of generating a duplicate.
   let finished=false;
   try{const result=await stat(outputPath(id));finished=result.isFile()&&result.size>1000;}
   catch{}
   if(finished){
    const next=transition(job,'review',{instagramFile:'instagram.mp4'});
    next.outputToken=randomBytes(32).toString('hex');await save(next);
   }else await save(transition(job,'failed',{error:'desktop_interrupted_retry_required'}));
  }
 });
}
const server=cert?https.createServer({cert:await readFile(cert),key:await readFile(key)},(req,res)=>void serve(req,res)):
 http.createServer((req,res)=>void serve(req,res));
server.requestTimeout=15*60*1000;
server.listen(port,host,()=>console.log('Persona local desktop bridge on '+host+':'+port));
setImmediate(()=>void pump());
