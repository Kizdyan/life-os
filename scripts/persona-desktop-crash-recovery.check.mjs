// Test recovery from actual on-disk crash snapshots. MP4 is a test fixture,
// not a replacement for the original Persona Video Engine V1.1.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {setTimeout as sleep} from 'node:timers/promises';
import {createRequest,newJob,markInputReady,transition} from '../packages/core/src/persona-processing-contract.mjs';
import {makeProcessedAsset} from '../packages/core/src/persona-processed-asset.mjs';

async function freePort(){return await new Promise((resolvePort,reject)=>{
 const server=createServer();server.once('error',reject);
 server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolvePort(port));});
});}
function jobFor(id,sha){
 const request=createRequest({assetId:id.repeat(32),projectId:'project',
  contentItemId:'content',ideaId:'idea',ideaVersion:2,sessionId:'shoot-one',
  mime:'video/mp4',filename:'sample.mp4',bytes:2048});
 const job=transition(markInputReady(newJob(request),2048),'processing');
 job.sourceSha256=sha;
 return job;
}
test('restart recovers only fully committed, hash-verified results without invoking V1.1',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-crash-recovery-'));
 const mp4=join(root,'video-fixture.mp4');
 execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i',
  'color=c=black:s=360x640:r=4','-t','1','-an','-c:v','libx264',
  '-pix_fmt','yuv420p','-movflags','+faststart',mp4],{timeout:30000});
 const video=await readFile(mp4);
 assert(video.length>1000);
 const outputSha=createHash('sha256').update(video).digest('hex');
 const port=await freePort(),endpoint='http://127.0.0.1:'+port;
 const token=randomBytes(32).toString('hex');
 const env={...process.env,PERSONA_BRIDGE_HOST:'127.0.0.1',PERSONA_BRIDGE_PORT:String(port),
  PERSONA_BRIDGE_DATA:root,PERSONA_BRIDGE_TOKEN:token,
  PERSONA_BRIDGE_ORIGIN:'https://persona.example',
  PERSONA_V11_ADAPTER:'',PERSONA_V11_WORKTREE:''};
 async function seed(letter,condition){
  const job=jobFor(letter,'a'.repeat(64));
  const dir=join(root,'jobs',job.id),out=join(dir,'outputs');
  await mkdir(out,{recursive:true});
  await writeFile(join(dir,'job.json'),JSON.stringify(job));
  await writeFile(join(out,'instagram.mp4'),video);
  if(condition!=='output_only'){
   const meta=makeProcessedAsset(job,{bytes:video.length,sha256:outputSha,
    width:360,height:640,codec:'h264',durationSec:1});
   await writeFile(join(out,'result.json'),JSON.stringify(condition==='stale'?{...meta,attempt:5}:meta));
  }
  return job;
 }
 const committed=await seed('d','valid');
 const incomplete=await seed('e','output_only');
 const stale=await seed('f','stale');
 let worker;
 const request=async(path,method='GET')=>{
  const response=await fetch(endpoint+path,{method,
   headers:{Authorization:'Bearer '+token}});
  const body=await response.json();
  return {status:response.status,body};
 };
 try{
  worker=spawn(process.execPath,[resolve('scripts/persona-video-desktop-worker.mjs')],{env,stdio:'ignore'});
  let restored;
  for(let i=0;i<50;i++){
   try{restored=await request('/v1/jobs/'+committed.id);
    if(restored.body.status==='review')break;
   }catch{}await sleep(100);
  }
  assert.equal(restored?.body.status,'review');
  assert.equal(restored.body.processedAsset.sourceAssetId,committed.request.assetId);
  assert.equal((await request('/v1/jobs/'+incomplete.id)).body.status,'failed');
  assert.equal((await request('/v1/jobs/'+stale.id)).body.status,'failed');
  const approved=await request('/v1/jobs/'+committed.id+'/approve','POST');
  assert.equal(approved.body.status,'ready');
  const oldOutput=approved.body.outputUrl;
  assert(oldOutput?.startsWith('/v1/jobs/'));
  const videoResponse=await fetch(endpoint+oldOutput,{headers:{Range:'bytes=0-99'}});
  assert.equal(videoResponse.status,206);assert.equal((await videoResponse.arrayBuffer()).byteLength,100);
  const renewed=await request('/v1/jobs/'+committed.id+'/output-access','POST');
  assert.equal(renewed.body.status,'ready');
  assert.notEqual(renewed.body.outputUrl,oldOutput);
  assert.equal((await fetch(endpoint+oldOutput)).status,403);
  // No adapter is configured; a fake output never authorizes another request.
  assert.equal((await request('/v1/jobs/'+incomplete.id+'/approve','POST')).status,409);
 }finally{
  if(worker&&!worker.killed){
   const stopped=new Promise(done=>worker.once('exit',done));
   worker.kill();await Promise.race([stopped,sleep(3000)]);
  }
  await rm(root,{recursive:true,force:true});
 }
});
