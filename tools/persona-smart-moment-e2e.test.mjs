import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPersonaMediaWorker} from './persona-media-worker.mjs';

const available=['ffmpeg','ffprobe'].every(name=>spawnSync(name,['-version'],{stdio:'ignore'}).status===0);
test('two uploaded real MP4 sources + generic prompt -> 0.5s frames -> emotion peaks -> FFmpeg output',{skip:!available,timeout:250000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-real-smart-click-'));let server=null;
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
  let visionCalls=0;
  const worker=createPersonaMediaWorker({port:0,outputRoot:join(root,'other'),
   quickRenderRoot:join(root,'quick'),
   quickStrategy:async()=>({status:'WARNING',recommendation:'Preserve expressive acting, confirm performance manually'}),
   quickLighting:async()=>({style:'Quiet Luxury'}),
   quickAudioOverride:async()=>({status:'no-speech-detected',segments:[],provenance:'synthetic-test-fixture'}),
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
  const manifest={prompt:'Сделай красиво',consent:true,
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
  assert.ok(visionCalls>=4);
  const output=join(root,'quick','quick-'+id,'output');
  const evidence=JSON.parse(await readFile(join(output,'smart-moments.json'),'utf8'));
  assert.equal(evidence.manualTimecodes,false);
  assert.equal(evidence.prompt,'Сделай красиво');
  assert.ok(evidence.frameAssessments.length>=36);
  assert.equal(evidence.vision.totalFrames,evidence.frameAssessments.length);
  assert.equal(evidence.vision.provider,'test-injected');
  assert.equal(evidence.audio[0].status,'no-speech-detected');
  assert.equal(evidence.sourceVideos.length,2);
  const edit=JSON.parse(await readFile(join(output,'edit-plan.json'),'utf8'));
  assert.equal(edit.kind,'persona-smart-moment-edit-plan');
  assert.equal(edit.choices.length,evidence.selectedMoments.length);
  assert.ok(edit.choices.length>=3&&edit.choices.length<=5);
  assert.equal(edit.choices[0].arcRole,'hook');
  assert.equal(edit.choices.at(-1).arcRole,'finale');
  assert.deepEqual([...new Set(edit.choices.map(x=>x.fileIndex))].sort(),[0,1]);
  assert.equal(edit.provenance.provider,'test-injected');
  assert.equal(edit.provenance.frameIntervalSec,.5);
  const result=JSON.parse(await readFile(join(output,'RESULT.json'),'utf8'));
  assert.equal(result.smartMomentDetection,true);
  assert.equal(result.publicationApproved,false);
  assert.equal(result.audioUnderstanding,'no-speech-detected');
  assert.equal(result.submittedToModel,'half_second_jpeg_frames_and_optional_text_transcript');
  assert.ok((await stat(join(output,result.videoName))).size>20000);
  const video=await fetch(base+'/quick-render/'+id+'/video?token='+token);
  assert.equal(video.status,200);assert.equal(video.headers.get('content-type'),'video/mp4');
  const verified=spawnSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,width,height',
   '-of','json',join(output,result.videoName)],{encoding:'utf8'});
  assert.equal(verified.status,0,verified.stderr);
  const media=JSON.parse(verified.stdout);
  assert.equal(media.streams.find(x=>x.codec_type==='video').height,1280);
  assert.ok(Number(media.format.duration)>8);
 }finally{
  if(server?.listening)await new Promise(resolve=>server.close(resolve));
  await rm(root,{recursive:true,force:true});
 }
});
