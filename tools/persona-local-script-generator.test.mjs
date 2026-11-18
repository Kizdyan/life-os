import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePersonaLocalScript,validateLocalScenarioDraft} from './persona-local-script-generator.mjs';

const idea={title:'Почему сцена начинается до первой реплики',angle:'Актёр готовит внутреннее действие',format:'reel'};
const draft={
 title:'Сначала — выбор',slides:Array.from({length:5},(_,i)=>({
  eyebrow:'СЦЕНА '+(i+1),title:'Реплика '+(i+1),
  body:'Конкретное наблюдение об актёрском выборе без выдуманной истории.'
 })),
 caption:'Процесс начинается до первой реплики.\n\n#актёр',
 platformNotes:{instagram:'Вертикальное видео',vk:'Рилс',youtube:'Shorts'},
 style:'documentary',assetInstruction:'Снять общий и два крупных плана'
};
test('real Ollama HTTP generation marks AI only after valid returned model JSON',async()=>{
 let seen=false;
 const response=await generatePersonaLocalScript({
  idea,model:'qwen3:4b-instruct',history:['Прошлая тема'],
  fetchImpl:async(url,init)=>{
   seen=true;
   assert.equal(url,'http://127.0.0.1:11434/api/chat');
   const sent=JSON.parse(init.body);
   assert.equal(sent.model,'qwen3:4b-instruct');
   assert.equal(sent.stream,false);
   assert.match(sent.messages[1].content,/Почему сцена/);
   return {ok:true,json:async()=>({message:{content:JSON.stringify(draft)}})};
  }
 });
 assert.equal(seen,true);
 assert.equal(response.mode,'ai');
 assert.equal(response.provider,'ollama-local');
 assert.equal(response.draft.caption,draft.caption);
 assert.equal(response.publicationApproved,false);
});
test('never calls a model for invalid user input',async()=>{
 await assert.rejects(()=>generatePersonaLocalScript({
  idea:{...idea,title:''},model:'qwen3:4b-instruct',
  fetchImpl:()=>{throw Error('must not run')}
 }),/invalid_request/);
});
test('rejects unavailable Ollama without pretending that a template came from AI',async()=>{
 await assert.rejects(()=>generatePersonaLocalScript({
  idea,model:'qwen3:4b-instruct',fetchImpl:async()=>{throw Error('ECONNREFUSED')}
 }),/ollama_unavailable/);
 await assert.rejects(()=>generatePersonaLocalScript({
  idea,model:'qwen3:4b-instruct',fetchImpl:async()=>({ok:false,status:503})
 }),/ollama_http_503/);
});
test('rejects malformed model output and does not publish fake AI passes',async()=>{
 assert.throws(()=>validateLocalScenarioDraft({...draft,slides:[]}),/invalid_model_output/);
 await assert.rejects(()=>generatePersonaLocalScript({
  idea,model:'qwen3:4b-instruct',
  fetchImpl:async()=>({ok:true,json:async()=>({message:{content:'not-json'}})})
 }),/ollama_invalid_json/);
});
