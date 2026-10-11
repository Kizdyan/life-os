// Node-only transport test; no V1.1 mock and no artificial "engine PASS".
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';

async function freePort(){
 return new Promise((accept,reject)=>{
  const s=createServer();s.once('error',reject);
  s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>accept(p));});
 });
}
const fixture={
 assetId:'b'.repeat(32),projectId:'persona:owner:project:v1',
 contentItemId:'content:idea',ideaId:'idea',ideaVersion:2,
 sessionId:'shoot:one',mime:'video/mp4',filename:'sample.mp4',bytes:3200,
};
test('desktop bridge persists real bytes, refuses unsigned requests and fails closed without exact engine',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-processing-'));
 const port=await freePort(),base='http://127.0.0.1:'+port;
 const mp4=join(dir,'real-transport-fixture.mp4');
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi',
  '-i','color=c=blue:s=64x96:r=4','-t','1','-an','-c:v','libx264',
  '-pix_fmt','yuv420p','-movflags','+faststart',mp4],{timeout:30000});
 const bytes=await readFile(mp4);
 assert(bytes.length>1000&&bytes.toString('ascii',4,8)==='ftyp','not a real MP4');
 const probe=JSON.parse(execFileSync('ffprobe',['-v','quiet','-print_format','json',
  '-show_streams',mp4],{encoding:'utf8',timeout:30000}));
 assert(probe.streams.some(s=>s.codec_name==='h264'&&s.width===64&&s.height===96));
 fixture.bytes=bytes.length;
 const token='a'.repeat(64),env={
  ...process.env,PERSONA_BRIDGE_HOST:'127.0.0.1',PERSONA_BRIDGE_PORT:String(port),
  PERSONA_BRIDGE_DATA:dir,PERSONA_BRIDGE_ORIGIN:'https://persona.example',
  PERSONA_BRIDGE_TOKEN:token,
  PERSONA_V11_ADAPTER:'',PERSONA_V11_WORKTREE:'',
 };
 let proc=spawn(process.execPath,[resolve('scripts/persona-video-desktop-worker.mjs')],{env,stdio:'ignore'});
 async function call(path,method='GET',body){
  const data=body instanceof Uint8Array?body:body?JSON.stringify(body):undefined;
  const response=await fetch(base+path,{
   method,headers:{Authorization:'Bearer '+token,
    ...(data&&! (data instanceof Uint8Array)?{'Content-Type':'application/json'}:{})},
   body:data});
  return {status:response.status,data:await response.json()};
 }
 try{
  let online=false;
  for(let n=0;n<45;n++){if(proc.exitCode!==null)throw Error('worker exited');
   try{const r=await fetch(base+'/v1/jobs',{method:'POST',
    headers:{Authorization:'Bearer invalid','Content-Type':'application/json'},body:'{}'});
    if(r.status===401){online=true;break;}}
   catch{}await delay(100);
  }
  assert(online,'local worker did not start');
  // A second worker, even on a different port, must not claim the same data.
  const competing=spawn(process.execPath,[resolve('scripts/persona-video-desktop-worker.mjs')],
   {env:{...env,PERSONA_BRIDGE_PORT:String(await freePort())},stdio:'ignore'});
  const competingResult=await Promise.race([
   new Promise(resolve=>competing.once('exit',(code)=>resolve({code}))),
   delay(3000).then(()=>({timeout:true}))
  ]);
  if(competingResult.timeout){competing.kill();throw Error('two desktop workers shared a job folder');}
  assert.notEqual(competingResult.code,0,'second worker should fail ownership');
  const denied=await fetch(base+'/v1/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal(denied.status,401);
  const wrongOrigin=await fetch(base+'/v1/jobs',{method:'GET',headers:{
   Authorization:'Bearer '+token,Origin:'https://wrong.example'}});
  assert.equal(wrongOrigin.status,403);
  const preflight=await fetch(base+'/v1/jobs',{method:'OPTIONS',headers:{
   Origin:'https://persona.example','Access-Control-Request-Method':'PUT',
   'Access-Control-Request-Private-Network':'true'}});
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('access-control-allow-private-network'),'true');
  const first=await call('/v1/jobs','POST',fixture);
  assert.equal(first.status,200);
  const jobId=first.data.id;
  assert.equal(jobId,'job-'+fixture.assetId);
  const [again,race1,race2]=await Promise.all([
   call('/v1/jobs','POST',fixture),call('/v1/jobs','POST',fixture),
   call('/v1/jobs','POST',fixture)]);
  assert.equal(again.data.id,jobId);
  assert.equal(race1.data.id,jobId);assert.equal(race2.data.id,jobId);
  assert.equal(again.data.inputReady,false);
  const bad=await call('/v1/jobs/'+jobId+'/input','PUT',bytes.subarray(0,500));
  assert.equal(bad.status,422);
  const saved=await call('/v1/jobs/'+jobId+'/input','PUT',bytes);
  assert.equal(saved.status,200);assert.equal(saved.data.inputReady,true);
  let failed;
  for(let n=0;n<70;n++){const response=await call('/v1/jobs/'+jobId);failed=response.data;
   if(failed.status==='failed')break;await delay(100);
  }
  assert.equal(failed.status,'failed');
  assert.match(failed.error,/v11_local_adapter_not_configured/);
  const persisted=await readFile(join(dir,'jobs',jobId,'input.media'));
  assert.deepEqual(persisted,bytes);
  // Restart desktop server; the failed processing record and original bytes
  // must survive even though the browser tab does not stay open.
  const stopped=new Promise(resolve=>proc.once('exit',resolve));
  proc.kill();await Promise.race([stopped,delay(3000)]);
  proc=spawn(process.execPath,[resolve('scripts/persona-video-desktop-worker.mjs')],{env,stdio:'ignore'});
  let resumed=false;
  for(let n=0;n<40;n++){try{
   const status=await call('/v1/jobs/'+jobId);
   if(status.status===200&&status.data.status==='failed'){resumed=true;break;}
  }catch{}await delay(100);}
  assert(resumed,'worker restart lost failed job');
  const repeat=await call('/v1/jobs/'+jobId+'/retry','POST');
  assert.equal(repeat.status,200);assert.equal(repeat.data.id,jobId);
  assert.equal(repeat.data.attempt,1);

  // A second, larger transfer uses bounded chunks, is resumable and retains ID.
  const largeBytes=Buffer.concat([bytes,Buffer.alloc(2*1024*1024+19-bytes.length)]);
  const large={...fixture,assetId:'c'.repeat(32),bytes:largeBytes.length};
  const largeJob=(await call('/v1/jobs','POST',large)).data;
  const status=(await call('/v1/jobs/'+largeJob.id+'/transfer')).data;
  assert.equal(status.totalParts,2);
  assert.deepEqual(status.received,[]);
  assert.equal((await call('/v1/jobs/'+largeJob.id+'/commit','POST')).status,409);
  async function putPart(index,block,hash){
   const response=await fetch(base+'/v1/jobs/'+largeJob.id+'/chunks/'+index,{
    method:'PUT',headers:{Authorization:'Bearer '+token,
     'X-Chunk-SHA256':hash||createHash('sha256').update(block).digest('hex')},
    body:block});
   return {status:response.status,data:await response.json()};
  }
  const firstChunk=largeBytes.subarray(0,2*1024*1024);
  const lastChunk=largeBytes.subarray(2*1024*1024);
  assert.equal((await putPart(0,firstChunk,'0'.repeat(64))).status,422);
  assert.equal((await putPart(0,firstChunk)).status,200);
  assert.equal((await putPart(0,firstChunk)).data.alreadyReceived,true);
  assert.equal((await putPart(0,Buffer.alloc(firstChunk.length,1))).status,409);
  assert.deepEqual((await call('/v1/jobs/'+largeJob.id+'/transfer')).data.received,[0]);
  // Force desktop restart after an interrupted partial transfer. Its receipt
  // must remain durably resumable, without re-creating the job.
  const shutdown=new Promise(resolve=>proc.once('exit',resolve));
  proc.kill();await Promise.race([shutdown,delay(3000)]);
  proc=spawn(process.execPath,[resolve('scripts/persona-video-desktop-worker.mjs')],{env,stdio:'ignore'});
  let reconnected=false;
  for(let n=0;n<45;n++){
   try{const p=await call('/v1/jobs/'+largeJob.id+'/transfer');
    if(p.status===200&&p.data.received.join(',')==='0'){reconnected=true;break;}}
   catch{}await delay(100);
  }
  assert(reconnected,'chunk receipt lost on restart');
  assert.equal((await putPart(1,lastChunk)).status,200);
  // Deliberately corrupt a committed part on disk; commit must not publish it.
  await writeFile(join(dir,'jobs',largeJob.id,'transfer','1.chunk'),Buffer.alloc(lastChunk.length,255));
  assert.equal((await call('/v1/jobs/'+largeJob.id+'/commit','POST')).status,422);
  assert.deepEqual((await call('/v1/jobs/'+largeJob.id+'/transfer')).data.received,[0]);
  assert.equal((await putPart(1,lastChunk)).status,200);
  const committed=(await call('/v1/jobs/'+largeJob.id+'/commit','POST'));
  assert.equal(committed.status,200);
  assert.equal(committed.data.inputReady,true);
  assert.deepEqual(await readFile(join(dir,'jobs',largeJob.id,'input.media')),largeBytes);
  const future={...fixture,assetId:'e'.repeat(32),bytes:5*1024*1024*1024};
  const futureJob=await call('/v1/jobs','POST',future);
  assert.equal(futureJob.status,200);
  const futureTransfer=await call('/v1/jobs/'+futureJob.data.id+'/transfer');
  assert.equal(futureTransfer.data.totalParts,2560);
  const mismatch=await call('/v1/jobs','POST',{...fixture,ideaVersion:3});
  assert.equal(mismatch.status,409);
  assert.equal((await call('/v1/jobs/'+jobId+'/approve','POST')).status,409);
 }finally{
  if(proc.exitCode===null&&!proc.killed){
   const exited=new Promise(resolve=>proc.once('exit',resolve));
   proc.kill();await Promise.race([exited,delay(3000)]);
  }
  await rm(dir,{recursive:true,force:true});
 }
});
