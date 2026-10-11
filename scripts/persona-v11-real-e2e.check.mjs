import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const engine=process.env.PERSONA_V11_WORKTREE;
const ffmpeg=process.env.FFMPEG_PATH||'ffmpeg';
const ffprobe=process.env.FFPROBE_PATH||'ffprobe';
const fixtureFfmpeg=process.env.PERSONA_FIXTURE_FFMPEG_PATH||ffmpeg;
const expectToolFailure=process.env.PERSONA_EXPECT_TOOL_FAILURE==='1';

async function freePort(){return await new Promise((accept,reject)=>{
 const server=createServer();server.once('error',reject);
 server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>accept(port));});
});}
async function stop(proc){
 if(!proc||proc.exitCode!==null)return;
 const exited=new Promise(done=>proc.once('exit',done));proc.kill();await Promise.race([exited,delay(5000)]);
}

test('real immutable MediaAsset reaches ready through the exact original V1.1 engine',
 {skip:!engine},async()=>{
 const root=await mkdtemp(join(resolve(process.env.PERSONA_E2E_ROOT||tmpdir()),'persona-v11-real-e2e-'));
 const source=join(root,'real-source.mp4');
 execFileSync(fixtureFfmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i',
  'testsrc2=size=640x360:rate=30:duration=3','-f','lavfi','-i',
  'sine=frequency=440:sample_rate=48000:duration=3','-c:v','libx264','-pix_fmt','yuv420p',
  '-c:a','aac','-shortest','-movflags','+faststart',source],{timeout:60000});
 const bytes=await readFile(source),assetId='9'.repeat(32),token=randomBytes(32).toString('hex');
 const request={assetId,projectId:'persona:owner:project:v1',contentItemId:'content:real-v11',
  ideaId:'idea:real-v11',ideaVersion:7,sessionId:'shoot:real-v11',mime:'video/mp4',
  filename:'real-source.mp4',bytes:bytes.length};
 const jobId='job-'+assetId,port=await freePort(),base='http://127.0.0.1:'+port;
 const env={...process.env,PERSONA_BRIDGE_HOST:'127.0.0.1',PERSONA_BRIDGE_PORT:String(port),
  PERSONA_BRIDGE_DATA:root,PERSONA_BRIDGE_ORIGIN:'https://persona.example',
  PERSONA_BRIDGE_TOKEN:token,PERSONA_V11_WORKTREE:resolve(engine),
  PERSONA_V11_ADAPTER:resolve('scripts/persona-v11-original-engine-adapter.mjs'),
  WHISPER_CPP_PATH:'',WHISPER_MODEL_PATH:'',FFMPEG_PATH:ffmpeg,FFPROBE_PATH:ffprobe};
 let worker;let workerErrors='';
 const start=()=>{
  const proc=spawn(process.execPath,[resolve('scripts/persona-video-desktop-worker.mjs')],
   {env,stdio:['ignore','ignore','pipe']});
  proc.stderr.on('data',chunk=>{workerErrors=(workerErrors+chunk).slice(-4000)});return proc;
 };
 const call=async(path,method='GET',body)=>{
  const data=body instanceof Uint8Array?body:body?JSON.stringify(body):undefined;
  const response=await fetch(base+path,{method,headers:{Authorization:'Bearer '+token,
   ...(data&&!(data instanceof Uint8Array)?{'Content-Type':'application/json'}:{})},body:data});
  return {status:response.status,data:await response.json()};
 };
 try{
  worker=start();
  for(let i=0;i<80;i++){try{if((await call('/v1/jobs','POST',request)).status===200)break;}catch{}
   if(i===79)throw Error('worker_start_timeout:'+workerErrors);await delay(100);}
  const created=await call('/v1/jobs/'+jobId);assert.equal(created.data.status,'queued');
  assert.equal(created.data.request.assetId,assetId);assert.equal(created.data.request.ideaVersion,7);
  assert.equal(created.data.request.sessionId,'shoot:real-v11');
  const uploaded=await call('/v1/jobs/'+jobId+'/input','PUT',bytes);
  assert.equal(uploaded.status,200);assert.equal(uploaded.data.inputReady,true);
  const states=[];
  for(let i=0;i<120;i++){
   const current=(await call('/v1/jobs/'+jobId)).data;
   if(states.at(-1)!==current.status)states.push(current.status);
   if(current.status==='processing')break;
   await delay(100);
  }
  assert(states.includes('processing'),'worker never exposed durable processing state');
  const ownerDir=join(root,'jobs',jobId,'outputs','.v11-engine-owner');
  const ownerPath=join(ownerDir,'running.json');
  for(let i=0;i<50;i++){try{await stat(ownerPath);break;}catch{await delay(20);}}
  const owner=JSON.parse(await readFile(ownerPath,'utf8'));
  assert(Number.isInteger(owner.pid)&&owner.pid>0,'engine ownership was not persisted');
  await stop(worker);worker=start();
  let interrupted;
  for(let i=0;i<300;i++){try{const response=await call('/v1/jobs/'+jobId);interrupted=response.data;
    if(interrupted.status==='failed')break;}catch{}await delay(100);}
  assert.equal(interrupted?.status,'failed','restart did not wait for and recover the orphan engine');
  await assert.rejects(stat(ownerDir),error=>error.code==='ENOENT');
  const retried=await call('/v1/jobs/'+jobId+'/retry','POST');assert.equal(retried.status,200);
  let completed;
  for(let i=0;i<600;i++){
   const current=(await call('/v1/jobs/'+jobId)).data;
   if(current.status==='review'||current.status==='failed'){completed=current;break;}
   await delay(500);
  }
  if(expectToolFailure){
   assert.equal(completed?.status,'failed','invalid configured tool must fail closed');
   assert.equal(completed?.error,'processing_failed');
   assert(!JSON.stringify(completed).includes(ffmpeg)&&!JSON.stringify(completed).includes(ffprobe),
    'public diagnostics exposed a configured executable path');
   return;
  }
  assert.equal(completed?.status,'review','real V1.1 failed: '+JSON.stringify(completed)+' '+workerErrors);
  const manifestPath=join(root,'jobs',jobId,'outputs','result.json');
  const outputPath=join(root,'jobs',jobId,'outputs','instagram.mp4');
  const manifest=JSON.parse(await readFile(manifestPath,'utf8')),output=await readFile(outputPath);
  assert.equal(manifest.processingRequestId,jobId);assert.equal(manifest.sourceAssetId,assetId);
  assert.equal(manifest.ideaVersion,7);assert.equal(manifest.sessionId,'shoot:real-v11');
  assert.equal(manifest.attempt,1);
  assert.equal(manifest.engineCommit,'646f0708508c0fc603a43c555b771efe1176ee14');
  assert.equal(manifest.sha256,createHash('sha256').update(output).digest('hex'));
  const probe=JSON.parse(execFileSync(ffprobe,['-v','error','-select_streams','v:0',
   '-show_entries','stream=codec_name,width,height:format=duration','-of','json',outputPath],
   {encoding:'utf8',timeout:30000}));
  assert.equal(probe.streams[0].codec_name,'h264');assert(probe.streams[0].height>probe.streams[0].width);
  assert(Number(probe.format.duration)>0.1);
  execFileSync(ffmpeg,['-v','error','-xerror','-i',outputPath,'-f','null','-'],{timeout:180000});
  const ready=await call('/v1/jobs/'+jobId+'/approve','POST');assert.equal(ready.data.status,'ready');
  await stop(worker);worker=start();
  let restored;
  for(let i=0;i<80;i++){try{restored=(await call('/v1/jobs/'+jobId)).data;if(restored.status==='ready')break;}catch{}
   await delay(100);}
  assert.equal(restored?.status,'ready');assert.equal(restored.processedAsset.sha256,manifest.sha256);
 }finally{await stop(worker);await rm(root,{recursive:true,force:true});}
});
