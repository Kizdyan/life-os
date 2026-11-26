import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile,readFile,copyFile,stat} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {request as httpRequest} from 'node:http';
import {createHash} from 'node:crypto';
import {ProductionJob} from './persona_orchestrator.mjs';
import * as workerModule from './persona-media-worker.mjs';
const {createPersonaMediaWorker}=workerModule;
import {findFfmpegDir} from './persona-preflight.mjs';
import {createPersonaQuickRenderService} from './persona-quick-render.mjs';
const ffmpegDir=findFfmpegDir();
const hasFfmpeg=Boolean(ffmpegDir)||['ffmpeg','ffprobe'].every(bin=>spawnSync(bin,['-version'],{stdio:'ignore',windowsHide:true}).status===0);
const digest=async p=>createHash('sha256').update(await readFile(p)).digest('hex');
const schedule=(format,date,sources,stages=['local-media'])=>({slotId:`persona:${date}:${format}`,contentId:`acceptance-${format}`,format,
 productionAt:'2026-11-22T00:00:00.000Z',publicationAt:date+'T00:00:00.000Z',stages,sources,
 budget:{paidCalls:0,maxAttempts:2,maxInputBytes:20000000,maxStageMs:60000}});
async function request(worker,path,body){const response=await fetch(worker.base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Persona-Worker-Token':worker.token},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};}
async function start(root,extra={}){const worker=createPersonaMediaWorker({port:0,outputRoot:root,ffmpegDir,apiEnv:{},
 productionQueue:{enabled:true,root,intervalMs:60000,maxJobsPerTick:3},...extra});
 worker.base='http://127.0.0.1:'+await worker.start();return worker;}
const close=worker=>new Promise(done=>worker.server.close(done));
async function waitIdle(worker){for(let i=0;i<200;i++){if(!(await request(worker,'/production-queue')).body.busy)return;await new Promise(done=>setTimeout(done,10))}throw Error('Worker did not become idle within bounded test wait');}

test('existing media engine exposes a direct bounded runner path without starting its CLI',async()=>{
 const engine=await import('./persona-media-engine.mjs');
 assert.equal(typeof engine.renderPersonaMedia,'function');
 assert.equal(typeof engine.probePersonaMedia,'function');
});

test('queue-owned direct local processor terminates at its deadline before retry',async t=>{
 assert.equal(typeof workerModule.runScheduledLocalProcess,'function');
 const root=await mkdtemp(join(tmpdir(),'persona-queue-timeout-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const marker=join(root,'child.txt');
 await writeFile(marker,'');
 const processor=`setInterval(()=>require('fs').appendFileSync(process.argv[1],'.'),20);`;
 await assert.rejects(workerModule.runScheduledLocalProcess(process.execPath,['-e',processor,marker],{timeoutMs:400}),/timed out/i);
 const before=(await readFile(marker)).length;await new Promise(done=>setTimeout(done,120));assert.equal((await readFile(marker)).length,before);
});

test('Worker queue is opt-in, requires existing local token, and rejects arbitrary paths',async t=>{
 const root=await mkdtemp(join(tmpdir(),'persona-queue-auth-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const worker=await start(root);t.after(()=>close(worker));
 assert.equal((await fetch(worker.base+'/production-queue')).status,401);
 assert.equal((await request(worker,'/production-queue')).status,200);
 assert.equal((await request(worker,'/production-queue/schedule',{directory:'../../',schedule:schedule('reel','2026-12-01',[])})).status,400);
 await waitIdle(worker);
 const existing=await ProductionJob.create(join(root,'production-existing'));
 const script=`import {lockProductionSchedule} from ${JSON.stringify(new URL('./persona_orchestrator.mjs',import.meta.url).href)};await lockProductionSchedule(process.argv[1]);`;
 const exited=spawnSync(process.execPath,['--input-type=module','-e',script,join(root,'.production-schedule.lock')],{encoding:'utf8',windowsHide:true});assert.equal(exited.status,0,exited.stderr);
 const scheduled=await request(worker,'/production-queue/schedule',{jobId:(await existing.read()).id,schedule:schedule('reel','2026-12-01',[],['research'])});
 assert.equal(scheduled.status,200,JSON.stringify(scheduled.body));
 const off=await start(root,{productionQueue:undefined});t.after(()=>close(off));
 assert.equal((await request(off,'/production-queue/tick',{})).status,400);
});

test('actual unavailable local processor retries only twice across Worker restart and retains source',async t=>{
 const root=await mkdtemp(join(tmpdir(),'persona-queue-retry-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const job=await ProductionJob.create(join(root,'production-retry'));
 const source=join(job.directory,'input','photo.png');await writeFile(source,Buffer.alloc(2048,1));
 const original=await digest(source),input=[{name:'photo.png',sha256:original,bytes:2048}];
 const plan=schedule('photo','2026-12-05',input);plan.budget.maxStageMs=1000;await job.scheduleProduction(plan);
 let worker=await start(root,{ffmpegDir:join(root,'missing-local-processor')});
 try{
  // Startup tick performs the first real unavailable-executable attempt.
  for(let wait=0;wait<300&&['running','pending'].includes((await job.read()).productionSchedule.stages[0].status);wait++)await new Promise(done=>setTimeout(done,10));
  assert.equal((await job.read()).productionSchedule.stages[0].status,'retry_wait');
  await close(worker);worker=await start(root,{ffmpegDir:join(root,'missing-local-processor')});
  await waitIdle(worker);
  assert.equal((await job.read()).productionSchedule.stages[0].attempts,1);
  await job.updateProductionSchedule(data=>{data.productionSchedule.stages[0].nextAttemptAt=new Date(0).toISOString();return data});
  const second=await request(worker,'/production-queue/tick',{});assert.equal(second.status,200);
  assert.equal((await job.read()).productionSchedule.stages[0].attempts,2);
  assert.equal((await job.read()).productionSchedule.stages[0].status,'exhausted');
  assert.equal((await request(worker,'/production-queue/tick',{})).body.executed,0);
  assert.equal(await digest(source),original);assert.notEqual((await job.read()).status,'AWAITING_APPROVAL');
 }finally{await close(worker)}
});

test('admitted manual request blocks queue before its asynchronous body has arrived',async t=>{
 const root=await mkdtemp(join(tmpdir(),'persona-queue-admission-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const worker=await start(root);let manual;try{
  await waitIdle(worker);
  let complete;
  const finished=new Promise(done=>{complete=done});
  manual=httpRequest(worker.base+'/quick-render',{method:'POST',headers:{'Content-Type':'application/json','X-Persona-Worker-Token':worker.token,'Transfer-Encoding':'chunked'}},response=>{response.resume();response.on('end',complete)});
  manual.on('error',complete);manual.flushHeaders();manual.write('{');
  for(let i=0;i<100&&(await request(worker,'/production-queue')).body.admittedManualRequests!==1;i++)await new Promise(done=>setTimeout(done,10));
  assert.equal((await request(worker,'/production-queue')).body.admittedManualRequests,1);
  const tick=await request(worker,'/production-queue/tick',{});assert.equal(tick.body.executed,0);assert.match(tick.body.reason,/BUSY/);
  manual.end('}');await finished;
  assert.equal((await request(worker,'/production-queue')).body.admittedManualRequests,0);
 }finally{manual?.destroy();worker.server.closeAllConnections();await close(worker)}
});

test('actual 901-second input is blocked before rendering; selected originals are preserved',{skip:!hasFfmpeg},async t=>{
 const root=await mkdtemp(join(tmpdir(),'persona-queue-duration-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const job=await ProductionJob.create(join(root,'production-long')),path=join(job.directory,'input','long.mp4');
 const binary=ffmpegDir?join(ffmpegDir,'ffmpeg'+(process.platform==='win32'?'.exe':'')):'ffmpeg';
 const made=spawnSync(binary,['-v','error','-nostdin','-f','lavfi','-i','color=red:s=16x16:r=1:d=901','-c:v','libx264','-pix_fmt','yuv420p',path],{encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(made.status,0,made.stderr);
 const sha256=await digest(path);await job.scheduleProduction(schedule('reel','2026-12-01',[{name:'long.mp4',sha256,bytes:(await stat(path)).size}]));
 const worker=await start(root);try{
  for(let count=0;count<100&&(await job.read()).productionSchedule.stages[0].status!=='blocked';count++)await new Promise(done=>setTimeout(done,10));
  const state=await job.read();assert.equal(state.productionSchedule.stages[0].status,'blocked');assert.match(state.productionSchedule.stages[0].error,/900/);
  assert.equal(state.status,'PREPARING');assert.equal(await digest(path),sha256);
 }finally{await close(worker)}
});

test('Quick Render restart leaves scheduled job recovery to ProductionJob and retains legacy failure behavior',async t=>{
 const root=await mkdtemp(join(tmpdir(),'persona-queue-quick-restart-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const service=createPersonaQuickRenderService({quickRenderRoot:root});
 const ids=[];
 for(const scheduled of [true,false]){
  const card=await service.create({prompt:'Restart state fixture',consent:true,files:[{kind:'video',name:'take.mp4',size:1024}]});
  const job=new ProductionJob(join(root,'quick-'+card.id));
  if(scheduled)await job.scheduleProduction(schedule('reel','2026-12-01',[],['research']));
  await job.transition('ANALYZING',{asset:{name:'video-01.mp4',sha256:'a'.repeat(64),durationSec:1}});ids.push(card.id);
 }
 const restarted=createPersonaQuickRenderService({quickRenderRoot:root});
 await restarted.get(ids[0]);await restarted.get(ids[1]);
 assert.equal((await new ProductionJob(join(root,'quick-'+ids[0])).read()).status,'ANALYZING');
 assert.equal((await new ProductionJob(join(root,'quick-'+ids[1])).read()).status,'FAILED');
 assert.equal(restarted.isBusy(),false);
});

test('real scheduled Reel/carousel/photo use existing FFmpeg tools; restart and repeated ticks preserve verified results', {skip:!hasFfmpeg},async t=>{
 const root=process.env.PERSONA_QUEUE_ACCEPTANCE_ROOT??await mkdtemp(join(tmpdir(),'persona-queue-real-'));
 await mkdir(root,{recursive:true});if(!process.env.PERSONA_QUEUE_ACCEPTANCE_ROOT)t.after(()=>rm(root,{recursive:true,force:true}));
 const jobs=[];
 const realReel=process.env.PERSONA_QUEUE_REAL_REEL,realPhotos=process.env.PERSONA_QUEUE_REAL_PHOTOS?.split(';');
 if(realReel||realPhotos)assert.ok(realReel&&realPhotos?.length===2,'Actual-media acceptance requires one Reel and two existing photos');
 const origins=[];
 for(const [format,date] of [['reel','2026-12-01'],['carousel','2026-12-03'],['photo','2026-12-05']]){
  const job=await ProductionJob.create(join(root,'production-'+format),{title:'Real scheduled '+format,contentType:format==='reel'?'video':'photo-carousel'});
  const selected=realReel?(format==='reel'?[realReel]:format==='carousel'?realPhotos:[realPhotos[0]]):null;
  const names=selected?selected.map((path,index)=>'archive-'+(index+1)+extname(path).toLowerCase()):format==='reel'?['take.mp4']:format==='carousel'?['a.png','b.png']:['photo.png'];
  const sources=[];
  for(const [index,name] of names.entries()){
   const path=join(job.directory,'input',name),video=format==='reel';
   if(selected){await copyFile(selected[index],path,1);origins.push({format,path:selected[index],sha256:await digest(selected[index]),stagedName:name})}
   else{
    const args=video?['-f','lavfi','-i','testsrc2=s=160x240:r=12:d=0.7','-c:v','libx264','-pix_fmt','yuv420p']:['-f','lavfi','-i',`color=c=${index?'navy':'tan'}:s=160x200`,'-frames:v','1','-update','1'];
    const made=spawnSync(ffmpegDir?join(ffmpegDir,'ffmpeg'+(process.platform==='win32'?'.exe':'')):'ffmpeg',['-v','error','-nostdin',...args,path],{windowsHide:true,encoding:'utf8',timeout:15000});
    assert.equal(made.status,0,made.stderr);
   }
   sources.push({name,sha256:await digest(path),bytes:(await stat(path)).size});
  }
  jobs.push({job,schedule:schedule(format,date,sources,format==='carousel'?['research','local-media','images']:['local-media'])});
 }
 let worker=await start(root);
 try{
  for(const item of jobs){const response=await request(worker,'/production-queue/schedule',{jobId:(await item.job.read()).id,schedule:item.schedule});assert.equal(response.status,200,JSON.stringify(response.body));}
  for(let tick=0;tick<3;tick++){const response=await request(worker,'/production-queue/tick',{});assert.equal(response.status,200,JSON.stringify(response.body));}
  const before=await request(worker,'/production-queue');assert.equal(before.status,200);
  assert.equal(before.body.jobs.length,3);assert.equal(before.body.jobs.filter(j=>j.readyForReview).length,2);
  const carousel=before.body.jobs.find(j=>j.format==='carousel');assert.equal(carousel.stages.find(s=>s.name==='research').status,'blocked');
  assert.equal(carousel.stages.find(s=>s.name==='images').status,'blocked');assert.equal(carousel.stages.find(s=>s.name==='local-media').status,'completed');
  await close(worker);worker=await start(root);
  const repeat=await request(worker,'/production-queue/tick',{});assert.equal(repeat.body.executed,0);
  const after=await request(worker,'/production-queue');assert.deepEqual(after.body.jobs.map(j=>[j.id,j.stages]),before.body.jobs.map(j=>[j.id,j.stages]));
  for(const item of jobs){await item.job.verifyProductionReceipts();for(const source of item.schedule.sources)assert.equal(await digest(join(item.job.directory,'input',source.name)),source.sha256);}
  for(const origin of origins)assert.equal(await digest(origin.path),origin.sha256);
  if(process.env.PERSONA_QUEUE_ACCEPTANCE_ROOT)await writeFile(join(root,'ACCEPTANCE.json'),JSON.stringify({kind:realReel?'actual-author-media-and-existing-Codex-archive-derivatives':'real-local-ffmpeg-technical-fixtures',
   limitations:'Technical queue/QA only: archive photo derivatives are not new authored posts; Reel preserves existing quiet audio without boosting noise. No research, new image generation, ASR or artistic approval.',
   origins,restart:true,duplicateExecutions:repeat.body.executed,originalHashesUnchanged:true,paidCalls:0,publicationApproved:false,queue:after.body},null,2));
  const ready=after.body.jobs.find(j=>j.format==='photo'),photoJob=jobs.find(item=>item.schedule.format==='photo').job;
  const artifact=ready.stages[0].artifacts.find(item=>item.path.endsWith('.png'));
  const artifactPath=join(photoJob.directory,artifact.path),original=await readFile(artifactPath);
  await writeFile(artifactPath,'tampered');
  const tampered=await request(worker,'/production-queue');
  assert.equal(tampered.body.jobs.find(j=>j.id===ready.id).readyForReview,false);
  assert.match(tampered.body.jobs.find(j=>j.id===ready.id).error,/receipt|changed/i);
  await writeFile(artifactPath,original);await photoJob.verifyProductionReceipts();
 }finally{await close(worker)}
});

test('runtime status is authenticated and does not expose cache path or configured secret',async t=>{
 const root=await mkdtemp(join(tmpdir(),'persona-runtime-auth-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const privateCache=join(root,'private-cache');
 const worker=await start(root,{productionQueue:undefined,apiEnv:{PERSONA_YANDEX_CACHE_DIR:privateCache,PERPLEXITY_API_KEY:'private-test-token'}});
 t.after(()=>close(worker));
 assert.equal((await fetch(worker.base+'/runtime-status')).status,401);
 const response=await request(worker,'/runtime-status');
 assert.equal(response.status,200);assert.equal(response.body.version,1);
 assert.equal(response.body.cache,'CONFIGURED');assert.equal(response.body.personal.status,'MISSING');
 assert.equal(response.body.publicationApproved,false);
 assert.ok(!JSON.stringify(response.body).includes('private-cache'));assert.ok(!JSON.stringify(response.body).includes('private-test-token'));
 const health=await fetch(worker.base+'/health').then(r=>r.json());assert.equal(health.runtimeProtocol,1);
});
