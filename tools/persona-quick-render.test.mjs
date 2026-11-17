import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,stat,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createPersonaMediaWorker} from './persona-media-worker.mjs';
import {ProductionJob} from './persona_orchestrator.mjs';
import {quickRenderAppearance} from './persona-quick-render.mjs';

const available=['ffmpeg','ffprobe'].every(bin=>spawnSync(bin,['-version'],{stdio:'ignore'}).status===0);
const sha=data=>createHash('sha256').update(data).digest('hex');
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
