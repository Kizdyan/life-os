import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createPersonaMediaWorker} from './persona-media-worker.mjs';
import {ProductionJob} from './persona_orchestrator.mjs';
import {offlineEditPlan} from './persona-quick-render.mjs';

const mediaAvailable=['ffmpeg','ffprobe'].every(bin=>spawnSync(bin,['-version'],{stdio:'ignore'}).status===0);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const close=worker=>new Promise(resolve=>worker.server.close(resolve));
const brief={version:1,sourceFormat:'reel',script:[{order:1,line:'Первый дубль'},{order:2,line:'Второй дубль'}],shots:[{order:1},{order:2}]};
const mkVideo=path=>{
 const generated=spawnSync('ffmpeg',['-hide_banner','-nostdin','-v','error','-f','lavfi','-i',
  'testsrc2=s=160x284:r=12:d=9','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-y',path],{timeout:50000});
 assert.equal(generated.status,0,generated.stderr?.toString());
};
test('offline planner uses only verified intervals and never reports inferred emotions',()=>{
 const p=offlineEditPlan([{durationSec:4,sha256:'a'.repeat(64)}]);
 assert.equal(p.choices.length,2);
 assert.equal(p.mediaEvidence,'ffprobe-verified-offline-intervals');
 assert.ok(p.choices.every(x=>x.sourceSha256==='a'.repeat(64)));
 assert.equal(p.publicationApproved,false);
});
test('launcher removes mandatory OpenRouter check and keeps offline updates nonblocking',async()=>{
 const bat=await readFile(new URL('../START_AUTO_RENDER.bat',import.meta.url),'utf8');
 const ps=await readFile(new URL('./persona-launcher-supervisor.ps1',import.meta.url),'utf8');
 assert.doesNotMatch(bat,/if\s*\(-not\s*\(Has-OpenRouterKey\)\)\s*\{\s*throw/i);
 assert.doesNotMatch(ps,/if\s*\(-not\s*\(Has-OpenRouterKey\)\)\s*\{\s*throw/i);
 assert.match(bat,/catch\{\[IO\.File\]::WriteAllText\(\(Join-Path \$settings 'last-update-warning\.txt'\)/);
});
test('no OpenRouter key: Worker health, local one-click MP4, canonical state and card survive restart',{skip:!mediaAvailable,timeout:170000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-offline-s1-'));
 const video=join(root,'original.mp4');mkVideo(video);
 const bytes=await readFile(video);
 const settings={port:0,outputRoot:join(root,'worker'),quickRenderRoot:join(root,'quick'),musicLut:null,
  apiEnv:{OPENROUTER_API_KEY:'',OPENAI_API_KEY:''},pythonBin:'persona-python-unavailable'};
 let worker=createPersonaMediaWorker(settings),second=null;const port=await worker.start();
 try{
  const base='http://127.0.0.1:'+port;
  const health=await(await fetch(base+'/health')).json();
  assert.equal(health.service,'persona-media-worker');
  assert.equal(health.quickRender,true);
  assert.equal(health.quickRenderConfigured,false);
  const headers={'X-Persona-Worker-Token':health.token};
  const create=await fetch(base+'/quick-render',{method:'POST',headers:{...headers,'Content-Type':'application/json'},
   body:JSON.stringify({prompt:'Собери тестовый MP4 без облачных сервисов',consent:true,
    styleChoice:'cinematic',colorPreset:'DetailCinematic',fastDraft:true,
    files:[{kind:'video',name:'original.mp4',size:bytes.length}]})});
  assert.equal(create.status,201,await create.clone().text());
  const job=(await(await fetch(base+'/quick-render',{headers})).json()).jobs[0];
  const sent=await fetch(base+'/quick-render/'+job.id+'/upload/0',{method:'PUT',
   headers:{...headers,'X-Persona-Original-Name':'original.mp4'},body:bytes});
  assert.equal(sent.status,200,await sent.text());
  const started=await fetch(base+'/quick-render/'+job.id+'/run',{method:'POST',headers});
  assert.equal(started.status,202,await started.text());
  let latest;for(let n=0;n<280;n++){
   latest=await(await fetch(base+'/quick-render/'+job.id+'/status',{headers})).json();
   if(['completed','failed'].includes(latest.state))break;
   await pause(400);
  }
  assert.equal(latest.state,'completed',latest.error||latest.stage);
  assert.match(latest.notice,/Офлайн/);
  const jobRoot=join(root,'quick','quick-'+job.id);
  const persisted=await new ProductionJob(jobRoot).read();
  assert.equal(persisted.status,'AWAITING_APPROVAL');
  const result=JSON.parse(await readFile(join(jobRoot,'output','RESULT.json'),'utf8'));
  const plan=JSON.parse(await readFile(join(jobRoot,'output','edit-plan.json'),'utf8'));
  assert.equal(plan.provenance.provider,'none');
  assert.equal(plan.provenance.visionAvailable,false);
  assert.equal(plan.appearance.colorPreset,'DetailCinematic');
  assert.equal(result.visualPreset,'DetailCinematic');
  assert.equal(result.stylePack,'Cinematic');
  assert.equal(result.submittedToModel,'none','no key must never claim sampled Vision was used');
  assert.equal(result.fastDraft,true);
  assert.equal(result.renderProfile,'fast-draft');
  assert.equal(result.performance.visionFrames,0);
  assert.equal(result.distributionAllowed,false);
  const timelineReport=JSON.parse(await readFile(join(jobRoot,'output','edited.mp4.persona.json'),'utf8'));
  assert.equal(timelineReport.settings.visualPreset,'DetailCinematic');
  assert.ok((await stat(join(jobRoot,'output',result.videoName))).size>1000);
  const fullStart=await fetch(base+'/quick-render/'+job.id+'/render-full',{method:'POST',headers});
  assert.equal(fullStart.status,202,await fullStart.clone().text());
  let derivative;
  for(let n=0;n<400;n++){
   derivative=await(await fetch(base+'/quick-render/'+job.id+'/status',{headers})).json();
   if(['COMPLETED','FAILED'].includes(derivative.fullRenderStatus))break;
   await pause(350);
  }
  assert.equal(derivative.fullRenderStatus,'COMPLETED',derivative.fullRenderError);
  assert.equal(derivative.state,'completed','the original draft must remain playable');
  const fullReceipt=JSON.parse(await readFile(join(jobRoot,'output','RESULT-FULL.json'),'utf8'));
  assert.equal(fullReceipt.width,1080);assert.equal(fullReceipt.height,1920);
  assert.equal(fullReceipt.visionRequests,0);assert.equal(fullReceipt.cloudCalls,0);
  assert.equal(fullReceipt.reusedEditPlanSha256,result.editPlanSha256);
  const fullManifest=JSON.parse(await readFile(join(jobRoot,'output','full-edited.mp4.persona.json'),'utf8'));
  assert.equal(fullManifest.settings.width,1080);
  assert.equal(fullManifest.settings.height,1920);
  assert.equal(fullManifest.settings.renderProfile,'full-quality');
  const fullDownload=await fetch(base+'/quick-render/'+job.id+'/video-full?token='+health.token);
  assert.equal(fullDownload.status,200,await fullDownload.clone().text());
  const render1080=Buffer.from(await fullDownload.arrayBuffer());
  assert.ok(render1080.length>1000);
  const productionAfterFull=await new ProductionJob(jobRoot).read();
  assert.equal(productionAfterFull.status,'AWAITING_APPROVAL');
  assert.equal(productionAfterFull.fullRender.status,'COMPLETED');

  const meta=JSON.parse(await readFile(join(jobRoot,'quick-state.json'),'utf8'));
  assert.equal(meta.state,undefined);
  assert.equal(meta.error,undefined);
  await close(worker);
  second=createPersonaMediaWorker(settings);
  const resumed='http://127.0.0.1:'+await second.start();
  const token=(await(await fetch(resumed+'/health')).json()).token;
  const after=await(await fetch(resumed+'/quick-render',{headers:{'X-Persona-Worker-Token':token}})).json();
  assert.equal(after.jobs[0].id,job.id);
  assert.equal(after.jobs[0].state,'completed');
  assert.equal(after.jobs[0].fullRenderStatus,'COMPLETED');
 }finally{
  if(second)await close(second);
  else if(worker.server.listening)await close(worker);
  await rm(root,{recursive:true,force:true});
 }
});
test('failed Quick Render: canonical FAILED persists and dashboard displays error',{skip:!mediaAvailable,timeout:80000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-fail-s1-')),video=join(root,'original.mp4');mkVideo(video);
 const bytes=await readFile(video);
 const worker=createPersonaMediaWorker({port:0,outputRoot:join(root,'worker'),quickRenderRoot:join(root,'quick'),musicLut:null,
  apiEnv:{OPENROUTER_API_KEY:'',OPENAI_API_KEY:''},
  quickStrategy:async()=>{throw Error('Injected render failure TEST_RED')},
  quickLighting:async()=>({}),quickPlanner:async()=>({})});
 const base='http://127.0.0.1:'+await worker.start(),head={'X-Persona-Worker-Token':worker.token};
 try{
  const created=await fetch(base+'/quick-render',{method:'POST',headers:{...head,'Content-Type':'application/json'},body:JSON.stringify({
   prompt:'Проверь отказ рендера',consent:true,files:[{kind:'video',name:'original.mp4',size:bytes.length}]})});
  assert.equal(created.status,201);
  const id=(await created.json()).id;
  assert.equal((await fetch(base+'/quick-render/'+id+'/upload/0',{method:'PUT',
   headers:{...head,'X-Persona-Original-Name':'original.mp4'},body:bytes})).status,200);
  assert.equal((await fetch(base+'/quick-render/'+id+'/run',{method:'POST',headers:head})).status,202);
  let card;for(let n=0;n<120;n++){
   card=await(await fetch(base+'/quick-render/'+id+'/status',{headers:head})).json();
   if(card.state==='failed')break;
   await pause(150);
  }
  assert.equal(card.state,'failed');
  assert.match(card.error,/TEST_RED/);
  const record=await new ProductionJob(join(root,'quick','quick-'+id)).read();
  assert.equal(record.status,'FAILED');assert.match(record.failure.message,/TEST_RED/);
  assert.equal(record.history.at(-1).to,'FAILED');
 }finally{await close(worker);await rm(root,{recursive:true,force:true})}
});
test('Worker subprocess failure writes FAILED and survives a fresh Worker instance',{skip:!mediaAvailable,timeout:85000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-worker-fail-s1-')),video=join(root,'original.mp4');mkVideo(video);
 const bytes=await readFile(video);
 const settings={port:0,outputRoot:join(root,'worker'),musicLut:null,ffmpegDir:null,
  whisperCli:'missing-whisper.exe',whisperModel:'missing-whisper-model.bin',ollamaModel:'missing-local-model'};
 let worker=createPersonaMediaWorker(settings),next=null;
 const base='http://127.0.0.1:'+await worker.start(),head={'X-Persona-Worker-Token':worker.token};
 try{
  const create=await fetch(base+'/session',{method:'POST',headers:{...head,'Content-Type':'application/json'},
   body:JSON.stringify({brief,variation:'cinematic',takeCount:2})});
  assert.equal(create.status,201,await create.clone().text());
  const id=(await create.json()).id;
  for(let i=0;i<2;i++){
   const sent=await fetch(base+'/session/'+id+'/take/'+i,{method:'PUT',
    headers:{...head,'X-Persona-File-Name':'S0'+(i+1)+'_take01.mp4'},body:bytes});
   assert.equal(sent.status,200,await sent.text());
  }
  const run=await fetch(base+'/session/'+id+'/run',{method:'POST',headers:head});
  assert.equal(run.status,202,await run.clone().text());
  let state;for(let n=0;n<160;n++){
   state=await(await fetch(base+'/session/'+id+'/status',{headers:head})).json();
   if(state.state==='failed')break;
   await pause(200);
  }
  assert.equal(state.state,'failed',JSON.stringify(state));
  assert.ok(state.error);
  const p=join(root,'worker','.worker-staging-'+id,'production');
  const canonical=await new ProductionJob(p).read();
  assert.equal(canonical.status,'FAILED');
  assert.equal(canonical.failure.message,state.error);
  await close(worker);
  next=createPersonaMediaWorker(settings);
  const newBase='http://127.0.0.1:'+await next.start();
  const recovered=await fetch(newBase+'/session/'+id+'/status',{headers:{'X-Persona-Worker-Token':next.token}});
  assert.equal(recovered.status,200);
  const view=await recovered.json();
  assert.equal(view.state,'failed');
  assert.equal(view.error,canonical.failure.message);
 }finally{
  if(next)await close(next);
  else if(worker.server.listening)await close(worker);
  await rm(root,{recursive:true,force:true});
 }
});
