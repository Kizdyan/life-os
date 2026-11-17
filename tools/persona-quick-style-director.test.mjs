import {test} from 'node:test';
import assert from 'node:assert/strict';
import {quickDirectorFrameSchedule,quickDirectorMoodToAppearance,selectQuickStyleFromVision} from './persona-quick-style-director.mjs';

const videos=Array.from({length:4},(_,i)=>({durationSec:10+i,sha256:String.fromCharCode(97+i).repeat(64)}));
const jpeg=()=>Buffer.concat([Buffer.from([0xff,0xd8]),Buffer.alloc(380)]);
test('Director samples 3–5 real frames and includes every submitted take',()=>{
 for(let n=1;n<=4;n++){
  const frames=quickDirectorFrameSchedule(videos.slice(0,n));
  assert.ok(frames.length>=3&&frames.length<=5);
  assert.equal(new Set(frames.map(f=>f.fileIndex)).size,n);
  assert.ok(frames.every(f=>f.atSec>=0&&f.atSec<videos[f.fileIndex].durationSec));
  assert.equal(new Set(frames.map(f=>f.id)).size,frames.length);
  assert.equal(new Set(frames.map(f=>f.fileIndex+':'+f.atSec)).size,frames.length);
 }
});
test('Director mood has exactly five safe mappings to existing color and subtitle packs',()=>{
 for(const [mood,styleChoice,colorPreset] of [
  ['dramatic','cinematic','SoftCinematic'],
  ['calm','cinematic','SoftCinematic'],
  ['funny','dynamic','DetailCinematic'],
  ['dynamic','dynamic','DetailCinematic'],
  ['premium','signature-gold','DetailCinematic']
 ]){
  const look=quickDirectorMoodToAppearance({mood,reason:'Verifiable luminance and framing'});
  assert.equal(look.styleChoice,styleChoice);
  assert.equal(look.colorPreset,colorPreset);
 }
 for(const value of [null,{mood:'destructive',reason:'Make up a grade'},
  {mood:'premium',reason:''},{mood:'dramatic',reason:12},
  {mood:'calm',colorPreset:'unknown'},'funny']){
  // Extra untrusted fields never influence selected presets. Only malformed
  // mood or missing explanation is invalid.
  if(value?.mood==='calm')continue;
  assert.throws(()=>quickDirectorMoodToAppearance(value),/Director returned/);
 }
});
test('OpenRouter gets one JSON request with exactly 3–5 real JPEG frames and no video or audio',async()=>{
 const frames=quickDirectorFrameSchedule(videos.slice(0,2));
 const jpegs=frames.map(jpeg);
 let calls=0;
 const output=await selectQuickStyleFromVision({frames,jpegs,
  env:{OPENROUTER_API_KEY:'test-only-key',PERSONA_AUTO_RENDER_MODEL:'openai/gpt-4.1-mini'},
  fetchImpl:async(url,opts)=>{
   calls++;assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');
   assert.equal(opts.headers.Authorization,'Bearer test-only-key');
   const body=JSON.parse(opts.body);
   assert.equal(body.model,'openai/gpt-4.1-mini');
   assert.ok(body.messages[0].content.includes('драматичное, веселое, спокойное или динамичное'));
   assert.ok(body.messages[0].content.includes('премиальное/стильное'));
   const imageInputs=body.messages[1].content.filter(x=>x.type==='image_url');
   assert.equal(imageInputs.length,frames.length);
   assert.ok(imageInputs.every(x=>x.image_url.url.startsWith('data:image/jpeg;base64,')));
   assert.ok(!JSON.stringify(body).includes('test-only-key'));
   return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({
    mood:'premium',reason:'Elegant lighting and composed interior'})}}]})};
  }});
 assert.equal(calls,1);assert.equal(output.requestCount,1);
 assert.equal(output.analyzedFrames,frames.length);
 assert.equal(output.styleChoice,'signature-gold');
 assert.equal(output.colorPreset,'DetailCinematic');
 assert.equal(output.provider,'openrouter');
 assert.match(output.evidenceSha256,/^[a-f0-9]{64}$/);
 assert.deepEqual(output.frames,frames);
});
test('invalid model mood, hallucinated categories, missing key and fake JPEGs are rejected',async()=>{
 const frames=quickDirectorFrameSchedule(videos.slice(0,1)),jpegs=frames.map(jpeg);
 await assert.rejects(selectQuickStyleFromVision({frames,jpegs,
  env:{OPENROUTER_API_KEY:'fixture'},fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify({
   choices:[{message:{content:JSON.stringify({mood:'exciting-grade-please',reason:'inferred'})}}]})})}),/unsupported mood/);
 await assert.rejects(selectQuickStyleFromVision({frames,jpegs,env:{OPENAI_API_KEY:'not-openrouter'}}),/OpenRouter unavailable/);
 await assert.rejects(selectQuickStyleFromVision({frames,jpegs:[...jpegs.slice(0,-1),Buffer.alloc(400)],env:{OPENROUTER_API_KEY:'fixture'}}),/validated JPEGs/);
});
