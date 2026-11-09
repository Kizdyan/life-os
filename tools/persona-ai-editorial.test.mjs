import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyAiEditorialSelection,chooseAiEditorialCuts} from './persona-ai-editorial.mjs';
const make=(beat,index,source,start,transcript)=>({
 candidateId:'beat-'+beat+'-take-'+index,sourceId:source,startSec:start,durationSec:1.2,
 confidence:.9,coverage:.99,f1:.97,transcript,captionWords:[],
 speechEndSec:start+1.05,speechBoundaryConfidence:'word',
 postSpeechMusicPreserved:false,rankingReason:'Offline Whisper source-aligned candidate verified',
});
const a=make(1,1,'take-a',0,'Я хочу это снять');
const b=make(1,2,'take-b',0,'Я хочу это снять');
const c=make(2,1,'take-a',2,'И музыка всё меняет');
const d=make(2,2,'take-b',1.4,'И музыка всё меняет');
const decisions={version:1,mode:'strict',candidates:[
 {beat:1,alternatives:[a,b]},{beat:2,alternatives:[c,d]},
],choices:[
 {beat:1,selectedCandidateId:a.candidateId},
 {beat:2,selectedCandidateId:c.candidateId},
],missingBeats:[]};
const brief={script:[{line:'Я хочу это снять'},{line:'И музыка всё меняет'}]};
const reply={choices:[
 {beat:1,candidateId:b.candidateId},{beat:2,candidateId:d.candidateId},
],creativeIntent:'Переход между двумя персонажами на смене реплики',look:'natural-clean'};
test('real local model chooses different existing takes without inventing source/timecodes',async()=>{
 let modelWasCalled=false;
 const selected=await chooseAiEditorialCuts({
  decisions,brief,model:'qwen3:4b-instruct',variation:'humor',
  fetchImpl:async(url,options)=>{
   assert.equal(url,'http://127.0.0.1:11434/api/chat');
   assert.equal(options.method,'POST');
   const request=JSON.parse(options.body);
   assert.equal(request.stream,false);
   assert.equal(request.model,'qwen3:4b-instruct');
   assert.equal(request.format.type,'object');
   assert.deepEqual(request.format.properties.choices.items.properties.candidateId.enum,[a.candidateId,b.candidateId,c.candidateId,d.candidateId]);
   assert.equal(request.format.properties.choices.items.properties.beat.maximum,2);
   assert.equal(request.options.temperature,.2);
   assert.ok(request.messages[0].content.includes('НЕ видишь видео'));
   assert.equal(JSON.parse(request.messages[1].content).candidates[1].alternatives.length,2);
   modelWasCalled=true;
   return {ok:true,json:async()=>({message:{content:JSON.stringify(reply)}})};
  },
 });
 assert.equal(modelWasCalled,true);
 assert.equal(selected.aiEditorial.model,'qwen3:4b-instruct');
 assert.equal(selected.aiEditorial.look,'natural-clean');
 assert.equal(selected.aiEditorial.changedTakeSelection,true);
 assert.equal(selected.choices[0].sourceId,'take-b');
 assert.equal(selected.choices[0].startSec,0);
 assert.equal(selected.choices[1].startSec,1.4);
 assert.equal(selected.choices[1].selectedCandidateId,d.candidateId);
 assert.equal(selected.choices[1].reason.includes('Ollama'),true);
 assert.equal(selected.choices[1].captionWords,d.captionWords);
 assert.equal(decisions.choices[0].selectedCandidateId,a.candidateId,'source packet is read-only');
});
test('rejects fictional cuts, missing beats, overlapping segments and fake visual claims',()=>{
 const valid=applyAiEditorialSelection(decisions,reply);
 assert.equal(valid.choices.length,2);
 assert.equal(valid.aiEditorial.provider,'ollama');
 assert.throws(()=>applyAiEditorialSelection(decisions,{...reply,choices:[
  {beat:1,candidateId:'invented-take'},{beat:2,candidateId:d.candidateId}
 ]}),/nonexistent/);
 assert.throws(()=>applyAiEditorialSelection(decisions,{...reply,choices:reply.choices.slice(0,1)}),/invalid/);
 assert.throws(()=>applyAiEditorialSelection(decisions,{...reply,look:'cinematic-auto-perfect-skin'}),/invalid/);
 const overlapping={...decisions,candidates:[decisions.candidates[0],{beat:2,alternatives:[
  {...d,startSec:.5,sourceId:'take-b'},
 ]}]};
 assert.throws(()=>applyAiEditorialSelection(overlapping,reply),/overlapping/);
});
test('fails CLOSED when Ollama is offline, returns invalid JSON or missing options',async()=>{
 await assert.rejects(chooseAiEditorialCuts({decisions,brief,model:'qwen3:4b-instruct',
  fetchImpl:async()=>{throw Error('offline')}}),/unavailable/);
 await assert.rejects(chooseAiEditorialCuts({decisions,brief,model:'qwen3:4b-instruct',
  fetchImpl:async()=>({ok:true,json:async()=>({message:{content:'broken json'}})})}),/valid JSON/);
 await assert.rejects(chooseAiEditorialCuts({decisions,brief,model:'qwen3:4b-instruct',
  fetchImpl:async()=>({ok:false,status:503})}),/HTTP 503/);
});
