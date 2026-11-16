import {test} from 'node:test';
import assert from 'node:assert/strict';
import {frameCandidates,validateEditPlan,selectEditPlan,editPlanProvider} from './persona-quick-edit-plan.mjs';

const videos=[{durationSec:14,sha256:'a'.repeat(64)},{durationSec:18,sha256:'b'.repeat(64)}];
const valid={stylePack:'Cinematic',creativeIntent:'Через паузу показать смену решения героя',
 choices:[{candidateId:'v0_0',role:'actor',caption:'Перед решением'},
          {candidateId:'v1_0',role:'broll',caption:''}]};
test('candidate windows are from verified source intervals only',()=>{
 const cuts=frameCandidates(videos);
 assert.ok(cuts.length>=4);
 for(const c of cuts){assert.ok(c.startSec>=0);assert.ok(c.startSec+c.durationSec<=videos[c.fileIndex].durationSec+.01)}
 const result=validateEditPlan(valid,cuts);
 assert.equal(result.version,1);
 assert.equal(result.choices.length,2);
 assert.equal(result.publicationApproved,false);
 assert.equal(result.brollPolicy,'uploaded_and_verified_sources_only');
 assert.equal(result.audioUnderstanding,'not_transcribed');
 assert.throws(()=>validateEditPlan({...valid,choices:[{candidateId:'fake',role:'broll',caption:''},valid.choices[0]]},cuts),/invented/);
 assert.throws(()=>validateEditPlan({...valid,choices:[valid.choices[0],valid.choices[0]]},cuts),/duplicated/);
 assert.throws(()=>validateEditPlan({...valid,stylePack:'bad'},cuts),/invalid/);
 assert.throws(()=>validateEditPlan({...valid,choices:[{...valid.choices[0],caption:'{\\pos(0,0)}' },valid.choices[1]]},cuts),/unsafe/);
 assert.throws(()=>validateEditPlan({...valid,choices:[valid.choices[0]]},cuts),/invalid/);
});
test('LLM receives only selected JPEG samples and real prompt; schema guard refuses invented material',async()=>{
 const candidates=frameCandidates(videos).slice(0,2);
 const response=valid=>{
  const selected={...valid,choices:[{...valid.choices[0],candidateId:candidates[0].id},
   {...valid.choices[1],candidateId:candidates[1].id}]};
  return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify(selected)}}]})};
 };
 let called=0;
 const result=await selectEditPlan({
  prompt:'Сделай камерно и драматично',candidates,
  frames:[Buffer.concat([Buffer.from([0xff,0xd8]),Buffer.alloc(350)]),Buffer.concat([Buffer.from([0xff,0xd8]),Buffer.alloc(350)])],
  env:{OPENAI_API_KEY:'fake-in-memory-unit-test-key',PERSONA_AUTO_RENDER_MODEL:'gpt-4.1-mini'},
  fetchImpl:async(url,options)=>{
   called++;
   assert.equal(url,'https://api.openai.com/v1/chat/completions');
   assert.equal(options.headers.Authorization,'Bearer fake-in-memory-unit-test-key');
   const body=JSON.parse(options.body);
   assert.ok(body.messages[1].content.some(x=>x.type==='image_url'&&x.image_url.url.startsWith('data:image/jpeg;base64,')));
   assert.match(body.messages[1].content[0].text,/камерно/);
   assert.ok(!body.messages[1].content.some(x=>x.type==='video'));
   return response(valid);
  },
 });
 assert.equal(called,1);
 assert.equal(result.provider,'openai');
 assert.equal(result.choices.length,2);
 assert.ok(/^[a-f0-9]{64}$/.test(result.evidenceSha256));
 assert.throws(()=>editPlanProvider({}),/API key unavailable/);
});
