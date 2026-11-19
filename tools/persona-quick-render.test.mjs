import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,stat,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {QUICK_RELOCATION_KIND,validateQuickRelocation,rebindQuickTimeline} from './persona-quick-relocation.mjs';
import {createPersonaMediaWorker} from './persona-media-worker.mjs';
import {ProductionJob} from './persona_orchestrator.mjs';
import {quickRenderAppearance} from './persona-quick-render.mjs';
import {backupPersonaQuickJob,verifyPersonaQuickJobBackup,restorePersonaQuickJob} from './persona-quick-job-backup.mjs';

const available=['ffmpeg','ffprobe'].every(bin=>spawnSync(bin,['-version'],{stdio:'ignore'}).status===0);
const sha=data=>createHash('sha256').update(data).digest('hex');

test('relocation: rebind only verified video/audio paths; reject path substitution and forged provenance',()=>{
 const id=randomUUID(),original=join(tmpdir(),'old-root','quick-'+id),
  restored=join(tmpdir(),'new-root','quick-'+id);
 const receiptSha256='e'.repeat(64),sourceSha='a'.repeat(64),musicSha='b'.repeat(64);
 const files=[
  {index:0,kind:'video',name:'video-01.mp4',sha256:sourceSha},
  {index:1,kind:'audio',name:'audio-02.wav',sha256:musicSha},
 ];
 const plan={choices:[
  {fileIndex:0,sourceSha256:sourceSha,startSec:0,durationSec:3},
  {fileIndex:0,sourceSha256:sourceSha,startSec:3,durationSec:3},
 ]};
 const timeline={width:720,height:1280,clips:[
  {path:join(original,'input','video-01.mp4'),startSec:0,durationSec:3},
  {path:join(original,'input','video-01.mp4'),startSec:3,durationSec:3},
 ],soundtrack:{path:join(original,'input','audio-02.wav'),volume:.38}};
 const saved=JSON.stringify(timeline),record={
  kind:QUICK_RELOCATION_KIND,version:1,id,originalJobDir:original,
  restoredJobDir:restored,receiptSha256};
 assert.equal(validateQuickRelocation(record,{id,currentJobDir:restored,receiptSha256}),original);
 const rebound=rebindQuickTimeline({jobDir:restored,originalJobDir:original,files,plan,timeline});
 assert.equal(rebound.clips[0].path,join(restored,'input','video-01.mp4'));
 assert.equal(rebound.soundtrack.path,join(restored,'input','audio-02.wav'));
 assert.equal(JSON.stringify(timeline),saved,'approved source timeline must stay unchanged');
 assert.throws(()=>rebindQuickTimeline({jobDir:restored,originalJobDir:original,files,plan,
  timeline:{...timeline,clips:[{...timeline.clips[0],path:join(tmpdir(),'foreign.mp4')},timeline.clips[1]]}}),
  /no longer matches/);
 assert.throws(()=>rebindQuickTimeline({jobDir:restored,originalJobDir:original,files,plan,
  timeline:{...timeline,soundtrack:{...timeline.soundtrack,path:join(tmpdir(),'untrusted.wav')}}}),
  /soundtrack/);
 assert.throws(()=>validateQuickRelocation({...record,restoredJobDir:original},
  {id,currentJobDir:restored,receiptSha256}),/target|source/);
 assert.throws(()=>validateQuickRelocation(record,
  {id,currentJobDir:restored,receiptSha256:'f'.repeat(64)}),/receipt/);
});

test('ONE real-click API: staging -> strategy/light -> bounded EditPlan -> actual FFmpeg+subtitle MP4 -> persisted dashboard card',{skip:!available,timeout:210000},async t=>{
 const root=await mkdtemp(join(tmpdir(),'persona-one-click-e2e-'));
 const source=join(root,'user-original.mp4'),music=join(root,'user-music.wav');
 const video=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=192x320:rate=24:duration=14',
  '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=14',
  '-shortest','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-y',source],
  {timeout:65000,encoding:'utf8'});
 assert.equal(video.status,0,video.stderr);
 const audio=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=220:sample_rate=48000:duration=14',
  '-ac','1','-c:a','pcm_s16le','-y',music],{timeout:25000,encoding:'utf8'});
 assert.equal(audio.status,0,audio.stderr);
 const sourceBytes=await readFile(source),musicBytes=await readFile(music),sourceHash=sha(sourceBytes);
 let planned=0,audited=0,lit=0;
 const makeWorker=()=>createPersonaMediaWorker({
  port:0,outputRoot:join(root,'other-worker-data'),
  quickRenderRoot:join(root,'quick'),
  quickStrategy:async input=>{audited++;assert.ok(input.strategy.worldview);return {status:'WARNING',recommendation:'Оставить крупную актёрскую реакцию, а не только красивый монтаж'}},
  quickLighting:async prompt=>{lit++;return {style:'Quiet Luxury',scene:prompt,key:'45°',fill:'optional',back:'separate silhouette'}},
  quickStyleDirector:async()=>{throw Error('Manual style must not call Director Agent')},
  quickPlanner:async({candidates,frames,prompt})=>{
   planned++;
   assert.ok(candidates.length>=2);
   assert.equal(frames.length,candidates.length);
   assert.ok(frames.every(b=>b[0]===0xff&&b[1]===0xd8));
   assert.match(prompt,/кинематографично/);
   return {stylePack:'Cinematic',creativeIntent:'Контраст реакции и детали',
    choices:[{candidateId:candidates[0].id,role:'actor',caption:'НЕ ВСЁ СКАЗАНО'},
             {candidateId:candidates[1].id,role:'broll',caption:'ПАУЗА'}]};
  },
 });
 const worker=makeWorker();const port=await worker.start(),base='http://127.0.0.1:'+port;
 let restarted=null;
 try{
  const publicResponse=await fetch(base+'/quick-render');
  assert.equal(publicResponse.status,401);
  const token=(await(await fetch(base+'/health')).json()).token;
  const headers={'X-Persona-Worker-Token':token};
  const manifest={prompt:'Сделай кинематографично и добавь мою музыку',consent:true,
  styleChoice:'dynamic',colorPreset:'DetailCinematic',files:[
   {kind:'video',name:'user-original.mp4',size:sourceBytes.length},
   {kind:'audio',name:'user-music.wav',size:musicBytes.length},
  ]};
  const create=await fetch(base+'/quick-render',{method:'POST',
   headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(manifest)});
  assert.equal(create.status,201,await create.text());
  // Create an independent project, then upload exact bytes through the same browser API.
  const one=(await(await fetch(base+'/quick-render',{headers})).json()).jobs[0];
  assert.ok(one.id);assert.equal(one.state,'uploading');
  for(const [index,[name,bytes]] of [['user-original.mp4',sourceBytes],['user-music.wav',musicBytes]].entries()){
   const sent=await fetch(base+'/quick-render/'+one.id+'/upload/'+index,{
    method:'PUT',headers:{...headers,'X-Persona-Original-Name':encodeURIComponent(name)},body:bytes});
   assert.equal(sent.status,200,await sent.text());
  }
  const launched=await fetch(base+'/quick-render/'+one.id+'/run',{method:'POST',headers});
  assert.equal(launched.status,202,await launched.text());
  let final,attempt=0;
  do{
   await new Promise(resolve=>setTimeout(resolve,500));
   const status=await fetch(base+'/quick-render/'+one.id+'/status',{headers});
   assert.equal(status.status,200);
   final=await status.json();
   if(['completed','failed'].includes(final.state))break;
   attempt++;
  }while(attempt<320);
  assert.equal(final.state,'completed',final.error||'Timed out at '+final.stage);
  assert.equal(final.ready,true);
  assert.equal(final.strategyStatus,'WARNING');
  assert.equal(planned,1);assert.equal(audited,1);assert.equal(lit,1);
  const rootJob=join(root,'quick','quick-'+one.id);
  const sourceCopied=await readFile(join(rootJob,'input','video-01.mp4'));
  assert.equal(sha(sourceCopied),sourceHash);
  const production=await new ProductionJob(rootJob).read();
  assert.equal(production.status,'AWAITING_APPROVAL');
  const result=JSON.parse(await readFile(join(rootJob,'output','RESULT.json'),'utf8'));
  assert.equal(result.publicationApproved,false);
  assert.equal(result.distributionAllowed,false);
  assert.equal(result.submittedToModel,'sampled_jpeg_frames_only');
  assert.equal(result.hasMusic,true);
  assert.equal(result.hasCaptions,true);
  assert.equal(result.styleChoice,'dynamic');
  assert.equal(result.subtitlePreset,'dynamic-interview');
  assert.equal(result.visualPreset,'DetailCinematic');
  assert.equal(result.strategy.status,'WARNING');
  assert.equal(result.technicalChecks.video,true);
  const edit=JSON.parse(await readFile(join(rootJob,'output','edit-plan.json'),'utf8'));
  assert.equal(edit.stylePack,'Dynamic','explicit author choice overrides model style');
  assert.equal(edit.appearance.styleChoice,'dynamic');
  assert.equal(edit.appearance.colorPreset,'DetailCinematic');
  assert.equal(edit.choices.length,2);
  assert.equal(edit.provenance.model,'test-only');
  assert.equal(edit.provenance.rightsConfirmed,false);
  const timelineReport=JSON.parse(await readFile(join(rootJob,'output','edited.mp4.persona.json'),'utf8'));
  assert.equal(timelineReport.settings.stylePack,'Dynamic');
  assert.equal(timelineReport.settings.visualPreset,'DetailCinematic');
  assert.equal(timelineReport.settings.visualIdentity,'persona-visual-identity-v1');
  assert.equal(timelineReport.verification.passed,true);
  const mp4=await fetch(base+'/quick-render/'+one.id+'/video?token='+token);
  assert.equal(mp4.status,200);
  assert.equal(mp4.headers.get('content-type'),'video/mp4');
  const rendered=Buffer.from(await mp4.arrayBuffer());
  assert.equal(sha(rendered),result.sha256);
  assert.ok(rendered.length>50000);
  const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',
   join(rootJob,'output',result.videoName)],{encoding:'utf8'});
  assert.equal(probe.status,0,probe.stderr);
  const inspected=JSON.parse(probe.stdout);
  assert.equal(inspected.streams.find(s=>s.codec_type==='video').width,720);
  assert.equal(inspected.streams.find(s=>s.codec_type==='video').height,1280);
  assert.ok(Number(inspected.format.duration)>7);
  assert.equal(sha(await readFile(source)),sourceHash,'original uploader file must remain untouched');
  const metadata=JSON.parse(await readFile(join(rootJob,'quick-state.json'),'utf8'));
  assert.equal(metadata.state,undefined,'quick-state.json must not duplicate the authoritative ProductionJob status');
  await new Promise(resolve=>worker.server.close(resolve));
  restarted=makeWorker();
  const secondBase='http://127.0.0.1:'+await restarted.start(),newToken=(await(await fetch(secondBase+'/health')).json()).token;
  const restored=await(await fetch(secondBase+'/quick-render',{headers:{'X-Persona-Worker-Token':newToken}})).json();
  assert.equal(restored.jobs[0].id,one.id);
  assert.equal(restored.jobs[0].ready,true);
 }finally{
  if(restarted)await new Promise(resolve=>restarted.server.close(resolve));
  else if(worker.server.listening)await new Promise(resolve=>worker.server.close(resolve));
  await rm(root,{recursive:true,force:true});
 }
});

test('opt-in finalization: reviewed 720p draft -> verified 1080p + platform files without another click or cloud calls',
 {skip:!available,timeout:450000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-one-click-final-package-'));
 const original=join(root,'source.mp4');
 let worker,recoveryWorker,finalRecoveryWorker;
 try{
  const generated=spawnSync('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i',
   'testsrc2=size=144x256:rate=12:duration=8.5',
   '-an','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-y',original],
   {timeout:45000,encoding:'utf8'});
  assert.equal(generated.status,0,generated.stderr);
  const bytes=await readFile(original),originalHash=sha(bytes);
  worker=createPersonaMediaWorker({port:0,outputRoot:join(root,'media'),
   quickRenderRoot:join(root,'quick'),apiEnv:{OPENROUTER_API_KEY:''}});
  let base='http://127.0.0.1:'+await worker.start();
  let token=(await(await fetch(base+'/health')).json()).token,headers={'X-Persona-Worker-Token':token};
  const start=await fetch(base+'/quick-render',{method:'POST',headers:{...headers,'Content-Type':'application/json'},
   body:JSON.stringify({prompt:'Собери локальный кинематографичный черновик',
    consent:true,fastDraft:true,autoStyle:false,textAccents:false,
    styleChoice:'cinematic',colorPreset:'SoftCinematic',
    files:[{kind:'video',name:'source.mp4',size:bytes.length}]})});
  assert.equal(start.status,201,await start.clone().text());
  const {id}=await start.json();
  const upload=await fetch(base+'/quick-render/'+id+'/upload/0',{method:'PUT',
   headers:{...headers,'X-Persona-Original-Name':encodeURIComponent('source.mp4')},body:bytes});
  assert.equal(upload.status,200,await upload.clone().text());
  const run=await fetch(base+'/quick-render/'+id+'/run',{method:'POST',headers});
  assert.equal(run.status,202,await run.clone().text());
  let status;
  for(let i=0;i<500;i++){
   status=await(await fetch(base+'/quick-render/'+id+'/status',{headers})).json();
   if(['completed','failed'].includes(status.state))break;
   await new Promise(ok=>setTimeout(ok,300));
  }
  assert.equal(status.state,'completed',status.error||status.stage);
  assert.equal(status.ready,true);assert.equal(status.fastDraft,true);
  assert.equal(status.fullReady,false);
  let output=join(root,'quick','quick-'+id,'output');
  const draft=JSON.parse(await readFile(join(output,'RESULT.json'),'utf8'));
  assert.equal(draft.width,720);assert.equal(draft.height,1280);
  assert.equal(draft.distributionAllowed,false);

  // Real recovery acceptance begins with ONLY the 720p draft. The second
  // Worker must promote a relocated, byte-identical immutable EditPlan.
  const originalJob=join(root,'quick','quick-'+id);
  const originalPlan=await readFile(join(output,'edit-plan.json'));
  const originalTimeline=await readFile(join(output,'timeline.json'));
  const originalReceipt=await readFile(join(output,'RESULT.json'));
  const draftArchive=join(root,'offline-draft-archive');
  const relocatedQuickRoot=join(root,'relocated-quick');
  await backupPersonaQuickJob({quickRoot:join(root,'quick'),id,destination:draftArchive});
  const relocatedDraft=await restorePersonaQuickJob({backupDir:draftArchive,quickRoot:relocatedQuickRoot});
  assert.equal(relocatedDraft.verified,true);
  assert.equal(relocatedDraft.draftRerenderEligible,true);
  assert.equal(relocatedDraft.rerenderVerified,false,'Only a real FFmpeg E2E can verify the rerender');
  const relocatedJob=join(relocatedQuickRoot,'quick-'+id);
  const record=JSON.parse(await readFile(join(relocatedJob,'persona-relocation.json'),'utf8'));
  assert.equal(record.originalJobDir,originalJob);
  assert.equal(record.restoredJobDir,relocatedJob);
  assert.equal(record.receiptSha256,sha(originalReceipt));
  if(worker.server.listening)await new Promise(done=>worker.server.close(done));
  recoveryWorker=createPersonaMediaWorker({port:0,outputRoot:join(root,'relocated-media'),
   quickRenderRoot:relocatedQuickRoot,apiEnv:{OPENROUTER_API_KEY:''}});
  base='http://127.0.0.1:'+await recoveryWorker.start();
  token=(await(await fetch(base+'/health')).json()).token;
  headers={'X-Persona-Worker-Token':token};
  output=join(relocatedJob,'output');
  assert.deepEqual(await readFile(join(output,'edit-plan.json')),originalPlan);
  assert.deepEqual(await readFile(join(output,'timeline.json')),originalTimeline);
  assert.deepEqual(await readFile(join(output,'RESULT.json')),originalReceipt);
  const recoveredCard=await(await fetch(base+'/quick-render/'+id+'/status',{headers})).json();
  assert.equal(recoveredCard.state,'completed');
  assert.equal(recoveredCard.fullReady,false);

  const request=await fetch(base+'/quick-render/'+id+'/render-full?withPackage=1',
   {method:'POST',headers});
  assert.equal(request.status,202,await request.clone().text());
  let observedPackageRender=false;
  for(let i=0;i<1300;i++){
   status=await(await fetch(base+'/quick-render/'+id+'/status',{headers})).json();
   if(status.exportStatus==='RENDERING')observedPackageRender=true;
   if(status.exportStatus==='COMPLETED'||status.exportStatus==='FAILED'||status.fullRenderStatus==='FAILED')break;
   await new Promise(ok=>setTimeout(ok,300));
  }
  assert.equal(status.fullRenderStatus,'COMPLETED',status.fullRenderError||status.stage);
  assert.equal(status.exportStatus,'COMPLETED',status.exportError||status.stage);
  assert.equal(status.fullReady,true);
  assert.ok(status.exportItems.some(x=>x.id==='instagram'));
  assert.ok(status.exportItems.some(x=>x.id==='cover'));
  const final=JSON.parse(await readFile(join(output,'RESULT-FULL.json'),'utf8'));
  // Full Video Quality Lab measures real encoded frames and audio, not artistic merit.
  assert.equal(status.finalQuality?.status,'REVIEW_REQUIRED');
  assert.equal(status.finalQuality.videoSha256,final.sha256);
  const quality=JSON.parse(await readFile(join(output,'video-quality-full.json'),'utf8'));
  assert.equal(quality.video.sha256,final.sha256);
  assert.equal(quality.video.width,1080);assert.equal(quality.video.height,1920);
  assert.equal(quality.publicationApproved,false);assert.equal(quality.distributionAllowed,false);
  assert.ok(quality.findings.some(item=>item.id==='decode_integrity'&&item.status==='measured'));
  assert.ok(quality.findings.some(item=>item.id==='black_frames'));
  assert.ok(quality.findings.some(item=>item.id==='frozen_frames'));
  assert.ok(quality.findings.some(item=>item.id==='audio_stream'||item.id==='audio_loudness'));
  assert.ok(quality.findings.some(item=>item.id==='acting'&&item.status==='needs_human_review'));
  assert.ok(quality.findings.some(item=>item.id==='identity_preservation'&&item.status==='needs_human_review'));
  assert.ok(status.finalQuality.notMeasuredCount>=0);
  assert.equal(status.finalQuality.warnings.length,quality.findings.filter(x=>x.status==='warning').length);
  const noToken=await fetch(base+'/quick-render/'+id+'/quality-report');
  assert.equal(noToken.status,401,'QC evidence must require the local Worker token');
  const reportDownload=await fetch(base+'/quick-render/'+id+'/quality-report?token='+token);
  assert.equal(reportDownload.status,200);
  assert.match(reportDownload.headers.get('content-type'),/application\/json/);
  assert.deepEqual(JSON.parse(await reportDownload.text()),quality);
  const contact=await fetch(base+'/quick-render/'+id+'/quality-contact-sheet?token='+token);
  assert.equal(contact.status,200);
  assert.match(contact.headers.get('content-type'),/image\/jpeg/);
  const pixels=Buffer.from(await contact.arrayBuffer());
  assert.ok(pixels.length>1000);
  assert.deepEqual([...pixels.subarray(0,3)],[0xff,0xd8,0xff]);
  const pkg=JSON.parse(await readFile(join(output,'platform-package','EXPORTS.json'),'utf8'));
  assert.equal(final.width,1080);assert.equal(final.height,1920);
  assert.equal(final.visionRequests,0);assert.equal(final.cloudCalls,0);
  assert.equal(final.status,'awaiting-author-review');
  assert.equal(final.distributionAllowed,false);
  assert.equal(pkg.distributionAllowed,false);
  assert.equal(pkg.sourceSha256,final.sha256);
  assert.equal(final.reusedEditPlanSha256,draft.editPlanSha256);
  assert.equal(final.reusedTimelineSha256,draft.timelineSha256);
  assert.deepEqual(await readFile(join(output,'edit-plan.json')),originalPlan);
  assert.deepEqual(await readFile(join(output,'timeline.json')),originalTimeline);
  assert.deepEqual(await readFile(join(output,'RESULT.json')),originalReceipt);
  const derived=JSON.parse(await readFile(join(output,'full-timeline.json'),'utf8'));
  assert.ok(derived.clips.every(clip=>clip.path.startsWith(join(relocatedJob,'input'))));
  assert.equal(derived.width,1080);
  assert.equal(derived.height,1920);
  assert.equal(sha(await readFile(original)),originalHash);
  assert.equal((await new ProductionJob(join(root,'quick','quick-'+id)).read()).status,'AWAITING_APPROVAL');
  const full=await fetch(base+'/quick-render/'+id+'/video-full?token='+token);
  assert.equal(full.status,200);
  assert.equal(sha(Buffer.from(await full.arrayBuffer())),final.sha256);
  const instagram=await fetch(base+'/quick-render/'+id+'/export/instagram?token='+token);
  assert.equal(instagram.status,200);
  assert.equal(instagram.headers.get('content-type'),'video/mp4');
  assert.ok((await instagram.arrayBuffer()).byteLength>20000);
  assert.ok(observedPackageRender||status.exportStatus==='COMPLETED');
  // Back up and restore the real rendered job with its original source and
  // 1080p master; recovery Worker must serve the identical MP4 bytes.
  const folder=join(root,'offline-job-backup'),finalRecoveryRoot=join(root,'recovered-again');
  const archive=await backupPersonaQuickJob({quickRoot:relocatedQuickRoot,id,destination:folder});
  assert.equal(archive.verified,true);
  assert.equal((await verifyPersonaQuickJobBackup(folder)).id,id);
  const recovered=await restorePersonaQuickJob({backupDir:folder,quickRoot:finalRecoveryRoot});
  assert.equal(recovered.verified,true);
  assert.equal(recovered.relocated,true);
  assert.equal(recovered.draftRerenderEligible,true,'Second relocation preserves original signed source root');
  assert.equal(recovered.rerenderVerified,false);
  const copied=join(finalRecoveryRoot,'quick-'+id);
  assert.equal(sha(await readFile(join(copied,'output',final.videoName))),final.sha256);
  assert.equal(sha(await readFile(join(copied,'input','video-01.mp4'))),originalHash);
  finalRecoveryWorker=createPersonaMediaWorker({port:0,outputRoot:join(root,'recovered-media'),
   quickRenderRoot:finalRecoveryRoot,apiEnv:{OPENROUTER_API_KEY:''}});
  const recoveredBase='http://127.0.0.1:'+await finalRecoveryWorker.start();
  const recoveredToken=(await(await fetch(recoveredBase+'/health')).json()).token;
  const recoveredList=await(await fetch(recoveredBase+'/quick-render',
   {headers:{'X-Persona-Worker-Token':recoveredToken}})).json();
  assert.ok(recoveredList.jobs.some(item=>item.id===id&&item.fullReady===true));
  const recoveredMaster=await fetch(recoveredBase+'/quick-render/'+id+'/video-full?token='+recoveredToken);
  assert.equal(recoveredMaster.status,200);
  assert.equal(sha(Buffer.from(await recoveredMaster.arrayBuffer())),final.sha256);
  console.log('PERSONA_ONE_CLICK_FULL_PACKAGE_PASS '+JSON.stringify({
   originalVerified:true,draft:[720,1280],final:[1080,1920],
   platformFiles:status.exportItems.length,cloudCalls:final.cloudCalls,
   qaWarnings:status.finalQuality.warnings.length,qualityReport:true,contactSheet:true,
   published:false,authorReviewRequired:true}));
 }finally{
  if(finalRecoveryWorker?.server?.listening)await new Promise(ok=>finalRecoveryWorker.server.close(ok));
  if(recoveryWorker?.server?.listening)await new Promise(ok=>recoveryWorker.server.close(ok));
  if(worker?.server?.listening)await new Promise(ok=>worker.server.close(ok));
  await rm(root,{recursive:true,force:true});
 }
});

test('Session 2 appearance mapping is explicit, backwards-compatible and rejects invented FFmpeg options',()=>{
 assert.deepEqual(quickRenderAppearance(),{styleChoice:'auto',colorPreset:null,stylePack:null,subtitlePreset:'cinematic'});
 assert.deepEqual(quickRenderAppearance({styleChoice:'cinematic',colorPreset:'DetailCinematic'}),
  {styleChoice:'cinematic',colorPreset:'DetailCinematic',stylePack:'Cinematic',subtitlePreset:'cinematic'});
 assert.deepEqual(quickRenderAppearance({styleChoice:'dynamic',colorPreset:'SoftCinematic'}),
  {styleChoice:'dynamic',colorPreset:'SoftCinematic',stylePack:'Dynamic',subtitlePreset:'dynamic-interview'});
 assert.deepEqual(quickRenderAppearance({styleChoice:'signature-gold',colorPreset:'DetailCinematic'}),
  {styleChoice:'signature-gold',colorPreset:'DetailCinematic',stylePack:'Cinematic',subtitlePreset:'signature-gold'});
 for(const appearance of [{styleChoice:'invented'},{colorPreset:'rm -rf /'}, {styleChoice:'signature-gold',colorPreset:'colorbalance=pl=1'}])
  assert.throws(()=>quickRenderAppearance(appearance),/Неизвестный/);
});
