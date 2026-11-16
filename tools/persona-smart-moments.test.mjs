import {test} from 'node:test';
import assert from 'node:assert/strict';
import {smartFrameSchedule,validateVisionBatch,chooseSmartMoments,
 makeSmartEditPlan,runSmartVision,detectVisionBatch} from './persona-smart-moments.mjs';
import {analyzeWhisperAudio,compressSpeechSegments,rankSpeechHighlights} from './persona-smart-audio.mjs';

const videos=[{durationSec:8.3,sha256:'a'.repeat(64)},{durationSec:9,sha256:'b'.repeat(64)}];
const sample=(frame,emotion='serious',transition=false)=>({...frame,faceVisible:true,lookingAtCamera:true,
 sharpFace:true,transition,emotion,intensity:3,clarity:4,reason:'Visible and sharp facial expression'});
const classify=f=>sample(f,f.atSec>=5?'serious':f.atSec>=2.5?'expressive':'smile',f.atSec===2.5||f.atSec===5);
test('every .5 second is scheduled across all source videos and never silently decimated',()=>{
 const frames=smartFrameSchedule(videos);
 assert.equal(frames.filter(x=>x.fileIndex===0).length,17);
 assert.equal(frames.filter(x=>x.fileIndex===1).length,18);
 assert.deepEqual(frames.slice(0,3).map(x=>x.atSec),[0,.5,1]);
 assert.equal(frames.at(-1).atSec,8.5);
 assert.throws(()=>smartFrameSchedule([{durationSec:400,sha256:'a'.repeat(64)}]),/maximum 300 seconds/);
});
test('vision response must cover exact evidence IDs, no fabricated or bad ratings',()=>{
 const frames=smartFrameSchedule(videos).slice(0,3);
 assert.equal(validateVisionBatch({frames:frames.map(classify)},frames).length,3);
 assert.throws(()=>validateVisionBatch({frames:[classify(frames[0])]},frames),/omitted/);
 assert.throws(()=>validateVisionBatch({frames:[classify(frames[0]),classify(frames[0]),classify(frames[2])]},frames),/repeated/);
 assert.throws(()=>validateVisionBatch({frames:frames.map(f=>({...classify(f),emotion:'unknown'}))},frames),/invalid/);
 assert.throws(()=>validateVisionBatch({frames:frames.map(f=>({...classify(f),intensity:100}))},frames),/invalid/);
});
test('real OpenRouter request attaches all 0.5-second JPEGs, rejects model-invented intervals',async()=>{
 const frames=smartFrameSchedule(videos).slice(0,2);
 const jpegs=frames.map(()=>Buffer.concat([Buffer.from([0xff,0xd8]),Buffer.alloc(450)]));
 let calls=0;
 const result=await detectVisionBatch({frames,jpegs,env:{OPENROUTER_API_KEY:'test-local-fixture'},
  fetchImpl:async(url,opts)=>{
   calls++;assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');
   const req=JSON.parse(opts.body),content=req.messages[1].content;
   assert.equal(content.filter(x=>x.type==='image_url').length,2);
   assert.ok(content.some(x=>x.type==='text'&&x.text.includes('0.5')));
   assert.equal(opts.headers.Authorization,'Bearer test-local-fixture');
   return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({frames:frames.map(classify)})}}]})};
  }});
 assert.equal(calls,1);assert.equal(result.frames.length,2);assert.equal(result.provider,'openrouter');
});
test('autonomous dramatic arc from only a generic user prompt; rejects blurry/averted eyes',async()=>{
 const frames=smartFrameSchedule(videos);
 const scored=frames.map(f=>classify(f));
 scored[8]={...scored[8],sharpFace:false,intensity:4};
 scored[20]={...scored[20],lookingAtCamera:false,intensity:4};
 const best=chooseSmartMoments(scored,{videos});
 assert.ok(best.length>=3&&best.length<=5);
 assert.equal(best[0].arcRole,'hook');assert.equal(best[1].arcRole,'turn');
 assert.equal(best.at(-1).arcRole,'finale');
 assert.ok(best.every(x=>x.startSec>=0&&x.startSec+x.durationSec<=videos[x.fileIndex].durationSec+.00001));
 assert.ok(best.every(x=>x.stillSec!==4&&x.stillSec!==1.5));
 const {plan}=makeSmartEditPlan({prompt:'Сделай красиво',videos,scored,
  audio:[{status:'whisper-unavailable',segments:[]},{status:'no-audio',segments:[]}],
  visionProvider:'openrouter',visionModel:'openai/gpt-4.1-mini'});
 assert.equal(plan.kind,'persona-smart-moment-edit-plan');
 assert.equal(plan.detection.manualTimecodes,false);assert.equal(plan.detection.analyzedFrames,35);
 assert.equal(plan.audioUnderstanding,'whisper-unavailable');
 assert.equal(plan.choices.length,best.length);
 assert.equal(plan.choices[0].arcRole,'hook');
 assert.equal(plan.choices.at(-1).arcRole,'finale');
 assert.equal(plan.publicationApproved,false);
});
test('scans every half-second frame via real frame-extractor contract, batches by file',async()=>{
 let framesExtracted=0,batches=0;
 const scan=await runSmartVision({videos,frameAt:async f=>{
  assert.ok(f.atSec>=0);framesExtracted++;
  return Buffer.concat([Buffer.from([0xff,0xd8]),Buffer.alloc(360)]);
 },batchOverride:async ({frames,jpegs})=>{
  batches++;assert.equal(jpegs.length,frames.length);
  assert.ok(new Set(frames.map(f=>f.fileIndex)).size===1);
  return {frames:frames.map(classify)};
 }});
 assert.equal(framesExtracted,35);assert.equal(scan.frameCount,35);assert.equal(scan.scored.length,35);
 assert.equal(batches,4);assert.equal(scan.provider,'test-injected');
 assert.match(scan.evidenceSha256,/^[a-f0-9]{64}$/);
});
test('Whisper is optional but never silently reclassified as no speech',async()=>{
 const unavailable=await analyzeWhisperAudio({videoPath:'/nonexistent',durationSec:10,hasAudio:true,
  whisperCli:null,whisperModel:null,ffmpeg:'ffmpeg',run:async()=>{}});
 assert.equal(unavailable.status,'whisper-unavailable');
 const silent=await analyzeWhisperAudio({videoPath:'/nonexistent',durationSec:10,hasAudio:false,
  whisperCli:null,whisperModel:null,ffmpeg:'ffmpeg',run:async()=>{}});
 assert.equal(silent.status,'no-audio');
 const segments=compressSpeechSegments([{startSec:1,endSec:1.25,text:'Здравствуй'},
  {startSec:1.3,endSec:2.1,text:'мир!'}, {startSec:4,endSec:4.6,text:'Сейчас.'}],{durationSec:10});
 assert.equal(segments.length,2);assert.match(segments[0].text,/мир!/);
 const noRank=await rankSpeechHighlights({audio:[unavailable]});assert.equal(noRank.status,'not-applicable');
});
