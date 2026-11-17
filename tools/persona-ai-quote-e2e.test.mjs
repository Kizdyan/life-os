import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createPersonaMediaWorker} from './persona-media-worker.mjs';

const available=['ffmpeg','ffprobe'].every(x=>spawnSync(x,['-version'],{stdio:'ignore'}).status===0);
const pause=ms=>new Promise(ok=>setTimeout(ok,ms));
const sha=b=>createHash('sha256').update(b).digest('hex');
test('real MP4: instrument-only AI quote in Signature Gold preview and cached 1080p; speech uses Whisper words only',
 {skip:!available,timeout:380000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-quote-real-mp4-'));
 let worker=null;
 try{
  const source=join(root,'piano-style-instrumental.mp4');
  const ff=spawnSync('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i',
   'testsrc2=size=192x336:rate=24:duration=11','-f','lavfi','-i',
   'sine=frequency=330:duration=11:sample_rate=48000','-shortest',
   '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-y',source],
   {encoding:'utf8',timeout:55000});
  assert.equal(ff.status,0,ff.stderr);
  const bytes=await readFile(source),originalSha=sha(bytes);
  let speechMode='none',quoteCalls=0,asrCalls=0,directorCalls=0;
  worker=createPersonaMediaWorker({port:0,outputRoot:join(root,'worker'),quickRenderRoot:join(root,'jobs'),
   quickStrategy:async()=>({status:'WARNING',recommendation:'Fixture data requires review'}),
   quickLighting:async()=>({status:'skipped'}),
   quickStyleDirector:async()=>{directorCalls++;return {mood:'premium',reason:'Elegant restrained lighting'};},
   quickAudioOverride:async()=>{
    asrCalls++;
    return speechMode==='none'?{status:'no-speech-detected',segments:[]}:
     {status:'whisper-transcribed',segments:[
      {startSec:1,endSec:2.5,text:'Я играю новую музыку'},
      {startSec:4.5,endSec:6,text:'Только послушай эту мелодию'}
     ]};
   },
   quickQuoteGenerator:async({mood})=>{quoteCalls++;assert.equal(mood,'premium');
    return {quote:'Тишина перед первым аккордом'};},
   quickPlanner:async({candidates,jpegs,frames})=>{
    assert.ok((jpegs??frames).length>=2);
    return {stylePack:'Commercial',creativeIntent:'Short visual progression',
     choices:[{candidateId:candidates[0].id,role:'actor',caption:'MODEL INVENTED WORDS'},
      {candidateId:candidates[1].id,role:'broll',caption:'ANOTHER UNVERIFIED TITLE'}]};
   }
  });
  const base='http://127.0.0.1:'+await worker.start();
  const token=(await(await fetch(base+'/health')).json()).token,headers={'X-Persona-Worker-Token':token};
  async function render(mode){
   speechMode=mode;
   const created=await fetch(base+'/quick-render',{method:'POST',
    headers:{...headers,'Content-Type':'application/json'},
    body:JSON.stringify({prompt:'Собери выразительный музыкальный портрет',consent:true,
     autoStyle:true,textAccents:true,fastDraft:true,
     files:[{kind:'video',name:'piano-style-instrumental.mp4',size:bytes.length}]})});
   assert.equal(created.status,201,await created.clone().text());
   const job=await created.json();
   const upload=await fetch(base+'/quick-render/'+job.id+'/upload/0',
    {method:'PUT',headers:{...headers,'X-Persona-Original-Name':'piano-style-instrumental.mp4'},body:bytes});
   assert.equal(upload.status,200,await upload.clone().text());
   const request=await fetch(base+'/quick-render/'+job.id+'/run',{method:'POST',headers});
   assert.equal(request.status,202,await request.clone().text());
   let status;
   for(let n=0;n<400;n++){
    status=await(await fetch(base+'/quick-render/'+job.id+'/status',{headers})).json();
    if(['completed','failed'].includes(status.state))break;
    await pause(350);
   }
   assert.equal(status.state,'completed',status.error||status.stage);
   const dir=join(root,'jobs','quick-'+job.id,'output');
   const result=JSON.parse(await readFile(join(dir,'RESULT.json'),'utf8'));
   const caption=JSON.parse(await readFile(join(dir,'caption-review.json'),'utf8'));
   const plan=JSON.parse(await readFile(join(dir,'edit-plan.json'),'utf8'));
   assert.equal(result.textAccents,true);
   assert.equal(result.subtitlePreset,'signature-gold');
   assert.equal(result.visualPreset,'DetailCinematic');
   assert.equal(result.hasCaptions,true,'text must be visible on 720p Fast Draft');
   assert.equal(result.captionsDeferred,false);
   assert.equal(result.videoName,'ready.mp4');
   assert.equal(plan.captionDecision.mode,result.captionDecision.mode);
   assert.ok(plan.choices.every(c=>c.caption===''),'never keep unverified model dialogue');
   const ass=await readFile(join(dir,'ready.mp4.ass'),'utf8');
   assert.match(ass,/&H0039668F/,'Signature Gold #8F6639 is actually burned by libass');
   assert.equal((ass.match(/Dialogue: 0,/g)||[]).length,caption.cues.length);
   assert.ok((await stat(join(dir,'ready.mp4'))).size>20000);
   const receipt=JSON.parse(await readFile(join(dir,'ready.mp4.persona-subtitles.json'),'utf8'));
   assert.equal(receipt.output.width,720);assert.equal(receipt.output.height,1280);
   assert.ok(receipt.fontSelections,'gold font checked by renderer');
   assert.equal(sha(await readFile(source)),originalSha);
   return {job,dir,result,caption,ass};
  }
  const music=await render('none');
  assert.equal(music.result.captionDecision.mode,'ai-quote');
  assert.equal(music.result.captionDecision.generatedText,'Тишина перед первым аккордом');
  assert.equal(music.caption.cues.length,1,'exactly one original quote');
  assert.match(music.ass,/Тишина перед первым аккордом/);
  assert.equal(music.caption.captionTiming,'ai-generated-original-not-spoken');
  assert.equal(quoteCalls,1);
  const fullReq=await fetch(base+'/quick-render/'+music.job.id+'/render-full',{method:'POST',headers});
  assert.equal(fullReq.status,202,await fullReq.clone().text());
  let full;
  for(let n=0;n<520;n++){
   full=await(await fetch(base+'/quick-render/'+music.job.id+'/status',{headers})).json();
   if(['COMPLETED','FAILED'].includes(full.fullRenderStatus))break;
   await pause(350);
  }
  assert.equal(full.fullRenderStatus,'COMPLETED',full.fullRenderError);
  assert.equal(quoteCalls,1,'1080p must not generate the quote again');
  assert.equal(directorCalls,1,'1080p must not run Director again');
  assert.equal(asrCalls,1,'1080p must not run Whisper again');
  const fullResult=JSON.parse(await readFile(join(music.dir,'RESULT-FULL.json'),'utf8'));
  assert.equal(fullResult.width,1080);assert.equal(fullResult.height,1920);
  assert.equal(fullResult.visionRequests,0);assert.equal(fullResult.cloudCalls,0);
  assert.equal(fullResult.hasCaptions,true);
  assert.match(await readFile(join(music.dir,'full-ready.mp4.ass'),'utf8'),/Тишина перед первым аккордом/);
  const fullReceipt=JSON.parse(await readFile(join(music.dir,'full-ready.mp4.persona-subtitles.json'),'utf8'));
  assert.equal(fullReceipt.output.width,1080);assert.equal(fullReceipt.output.height,1920);
  assert.match(await readFile(join(music.dir,'full-ready.mp4.ass'),'utf8'),/&H0039668F/);

  const voice=await render('spoken');
  assert.equal(voice.result.captionDecision.mode,'speech');
  assert.equal(voice.result.captionDecision.generatedText,null);
  assert.equal(voice.caption.captionTiming,'local-whisper-timed-not-verified');
  assert.equal(quoteCalls,1,'spoken video never calls LLM for invented phrases');
  assert.ok(voice.caption.cues.some(c=>c.text.includes('Я играю новую музыку')));
  assert.ok(voice.caption.cues.every(c=>c.text!=='Тишина перед первым аккордом'));
  assert.doesNotMatch(voice.ass,/MODEL INVENTED WORDS|ANOTHER UNVERIFIED TITLE/);
  assert.equal(asrCalls,2,'Whisper attempted once per source, each job');
  console.log('AI_QUOTE_MP4_PASS '+JSON.stringify({draftPreview:music.result.videoName,
   phrase:music.result.captionDecision.generatedText,preset:'signature-gold',
   goldColor:'#8F6639',subtitleFont:'Cormorant Garamond',
   fullResolution:[fullResult.width,fullResult.height],
   speechTranscriptionCues:voice.caption.cues.length,
   quoteCalls,asrCalls,directorCalls,provider:'test-injected',syntheticMedia:true}));
 }finally{
  if(worker?.server?.listening)await new Promise(resolve=>worker.server.close(resolve));
  await rm(root,{recursive:true,force:true});
 }
});
