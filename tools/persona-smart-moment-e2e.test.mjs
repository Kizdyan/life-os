import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPersonaMediaWorker} from './persona-media-worker.mjs';

const available=['ffmpeg','ffprobe'].every(name=>spawnSync(name,['-version'],{stdio:'ignore'}).status===0);
test('two MP4s: sparse 2.5s Vision -> draft -> 1080p from identical EditPlan without more Vision',{skip:!available,timeout:360000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-real-smart-click-'));let server=null;
 let finalCardHeld=false,releaseFinalCard,observedBeforeCommit=null;
 const finalCardGate=new Promise(resolve=>{releaseFinalCard=resolve});
 try{
  const files=[];
  for(const [i,duration] of [9.0,9.5].entries()){
   const name='angle-'+(i+1)+'.mp4',path=join(root,name);
   const ff=spawnSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-f','lavfi',
    '-i','testsrc2=size=192x336:rate=24:duration='+duration,
    '-f','lavfi','-i','sine=frequency='+(i===0?410:480)+':sample_rate=48000:duration='+duration,
    '-shortest','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-y',path],
    {encoding:'utf8',timeout:55000});
   assert.equal(ff.status,0,ff.stderr);
   files.push({name,path,bytes:await readFile(path)});
  }
  let visionCalls=0,styleCalls=0;
  const worker=createPersonaMediaWorker({port:0,outputRoot:join(root,'other'),
   quickRenderRoot:join(root,'quick'),
   beforeQuickStateCommit:async card=>{
    if(card.stage==='Полный MP4 готов'){finalCardHeld=true;await finalCardGate}
   },
   quickStrategy:async()=>({status:'WARNING',recommendation:'Preserve expressive acting, confirm performance manually'}),
   quickLighting:async()=>({style:'Quiet Luxury'}),
   quickAudioOverride:async()=>({status:'no-speech-detected',segments:[],provenance:'synthetic-test-fixture'}),
   quickStyleDirector:async({frames,jpegs})=>{
    styleCalls++;
    assert.ok(frames.length>=3&&frames.length<=5);
    assert.equal(frames.length,jpegs.length);
    assert.ok(jpegs.every(frame=>frame[0]===0xff&&frame[1]===0xd8));
    return {mood:'premium',reason:'Elegant composition and restrained framing'};
   },
   quickVisionBatch:async({frames,jpegs})=>{
    visionCalls++;
    assert.ok(frames.length<=12);assert.equal(jpegs.length,frames.length);
    assert.ok(jpegs.every(f=>f[0]===0xff&&f[1]===0xd8));
    return {frames:frames.map(f=>({id:f.id,faceVisible:true,lookingAtCamera:true,
     sharpFace:true,emotion:f.atSec<2.5?'smile':f.atSec<5?'expressive':'serious',
     intensity:f.atSec<2.5?4:3,clarity:4,
     transition:f.atSec===2.5||f.atSec===5,reason:'Fixture rating attached to a real extracted source frame'}))};
   },
  });
  server=worker.server;
  const base='http://127.0.0.1:'+await worker.start();
  const token=(await(await fetch(base+'/health')).json()).token;
  const headers={'X-Persona-Worker-Token':token};
  const manifest={prompt:'Сделай красиво',consent:true,fastDraft:true,autoStyle:true,
   files:files.map(f=>({kind:'video',name:f.name,size:f.bytes.length}))};
  const creation=await fetch(base+'/quick-render',{method:'POST',
   headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(manifest)});
  assert.equal(creation.status,201,await creation.text());
  const id=(await(await fetch(base+'/quick-render',{headers})).json()).jobs[0].id;
  for(const [index,file] of files.entries()){
   const up=await fetch(base+'/quick-render/'+id+'/upload/'+index,{method:'PUT',
    headers:{...headers,'X-Persona-Original-Name':encodeURIComponent(file.name)},body:file.bytes});
   assert.equal(up.status,200,await up.text());
  }
  const run=await fetch(base+'/quick-render/'+id+'/run',{method:'POST',headers});
  assert.equal(run.status,202,await run.text());
  let final;
  for(let attempt=0;attempt<300;attempt++){
   await new Promise(r=>setTimeout(r,550));
   final=await(await fetch(base+'/quick-render/'+id+'/status',{headers})).json();
   if(['completed','failed'].includes(final.state))break;
  }
  assert.equal(final.state,'completed',final.error||'Smart render timed out: '+final.stage);
  assert.equal(visionCalls,2,'two videos each fit a single sparse Vision batch');
  assert.equal(styleCalls,1,'separate mood Director runs exactly once');
  const output=join(root,'quick','quick-'+id,'output');
  const evidence=JSON.parse(await readFile(join(output,'smart-moments.json'),'utf8'));
  assert.equal(evidence.manualTimecodes,false);
  assert.equal(evidence.prompt,'Сделай красиво');
  assert.equal(evidence.frameAssessments.length,8,'only 4 samples from each 9s video');
  assert.equal(evidence.vision.totalFrames,evidence.frameAssessments.length);
  assert.equal(evidence.vision.provider,'test-injected');
  assert.equal(evidence.audio[0].status,'skipped-fast-draft','Fast Draft must not pretend it performed Whisper');
  assert.equal(evidence.sourceVideos.length,2);
  const edit=JSON.parse(await readFile(join(output,'edit-plan.json'),'utf8'));
  assert.equal(edit.kind,'persona-smart-moment-edit-plan');
  assert.equal(edit.choices.length,evidence.selectedMoments.length);
  assert.ok(edit.choices.length>=3&&edit.choices.length<=5);
  assert.equal(edit.choices[0].arcRole,'hook');
  assert.equal(edit.choices.at(-1).arcRole,'finale');
  assert.deepEqual([...new Set(edit.choices.map(x=>x.fileIndex))].sort(),[0,1]);
  assert.equal(edit.provenance.provider,'test-injected');
  assert.equal(edit.provenance.frameIntervalSec,2.5);
  assert.equal(edit.styleDecision.mood,'premium');
  assert.equal(edit.styleDecision.mode,'test-injected');
  assert.equal(edit.appearance.styleChoice,'signature-gold');
  assert.equal(edit.appearance.colorPreset,'DetailCinematic');
  const result=JSON.parse(await readFile(join(output,'RESULT.json'),'utf8'));
  assert.equal(result.smartMomentDetection,true);
  assert.equal(result.publicationApproved,false);
  assert.equal(result.audioUnderstanding,'not-confirmed','Fast Draft intentionally skips Whisper');
  assert.equal(result.submittedToModel,'sparse_2_5_second_jpeg_frames');
  assert.equal(result.performance.visionFrames,8);
  assert.equal(result.performance.visionRequests,2);
  assert.equal(result.performance.standardHalfSecondFrames,37);
  assert.equal(result.fastDraft,true);
  assert.equal(result.autoStyle,true);
  assert.equal(result.visualPreset,'DetailCinematic');
  assert.equal(result.subtitlePreset,'signature-gold');
  assert.equal(result.styleDecision.mood,'premium');
  assert.equal(result.performance.styleVisionFrames,4);
  assert.ok((await stat(join(output,result.videoName))).size>20000);
  const video=await fetch(base+'/quick-render/'+id+'/video?token='+token);
  assert.equal(video.status,200);assert.equal(video.headers.get('content-type'),'video/mp4');
  const verified=spawnSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,width,height',
   '-of','json',join(output,result.videoName)],{encoding:'utf8'});
  assert.equal(verified.status,0,verified.stderr);
  const media=JSON.parse(verified.stdout);
  assert.equal(media.streams.find(x=>x.codec_type==='video').height,1280);
  assert.ok(Number(media.format.duration)>8);
  const fullRequest=await fetch(base+'/quick-render/'+id+'/render-full',{method:'POST',headers});
  assert.equal(fullRequest.status,202,await fullRequest.clone().text());
  let full;
  for(let attempt=0;attempt<420;attempt++){
   await new Promise(r=>setTimeout(r,350));
   full=await(await fetch(base+'/quick-render/'+id+'/status',{headers})).json();
   if(finalCardHeld&&!observedBeforeCommit){observedBeforeCommit=full;releaseFinalCard()}
   const disk=JSON.parse(await readFile(join(root,'quick','quick-'+id,'quick-state.json'),'utf8'));
   if(full.fullRenderStatus==='FAILED'||full.fullRenderStatus==='COMPLETED'&&disk.stage==='Полный MP4 готов')break;
  }
  assert.equal(observedBeforeCommit?.fullRenderStatus,'RENDERING','polling must not publish full completion before the final card commit');
  assert.equal(observedBeforeCommit?.fullReady,false);
  assert.equal(full.fullRenderStatus,'COMPLETED',full.fullRenderError);
  assert.equal(visionCalls,2,'1080p promotion never re-runs sparse Vision');
  assert.equal(styleCalls,1,'1080p promotion must reuse mood and color without repeating Director');
  const fullResult=JSON.parse(await readFile(join(output,'RESULT-FULL.json'),'utf8'));
  assert.equal(fullResult.visionRequests,0);
  assert.equal(fullResult.cloudCalls,0);
  assert.equal(fullResult.reusedEditPlanSha256,result.editPlanSha256);
  console.log('FAST_DRAFT_BENCHMARK_JSON '+JSON.stringify({
   draftMs:result.performance.renderElapsedMs,fullRenderMs:fullResult.renderElapsedMs,
   baselineVisionFrames:result.performance.standardHalfSecondFrames,
   draftVisionFrames:result.performance.visionFrames,
   draftVisionRequests:result.performance.visionRequests,
   fullVisionRequests:fullResult.visionRequests,
   syntheticMedia:true,visionProvider:'test-injected'}));
  const fullProbe=spawnSync('ffprobe',['-v','error',
   '-show_entries','stream=codec_type,width,height','-of','json',
   join(output,fullResult.videoName)],{encoding:'utf8'});
  assert.equal(fullProbe.status,0,fullProbe.stderr);
  const fullVideo=JSON.parse(fullProbe.stdout).streams.find(x=>x.codec_type==='video');
  assert.equal(fullVideo.width,1080);assert.equal(fullVideo.height,1920);
  assert.ok((await stat(join(output,fullResult.videoName))).size>20000);

 }finally{
  releaseFinalCard();
  if(server?.listening)await new Promise(resolve=>server.close(resolve));
  await rm(root,{recursive:true,force:true});
 }
});
