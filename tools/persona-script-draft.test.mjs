import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateLocalPersonaScriptDraft} from './persona-script-draft.mjs';
const idea={title:'Актёрская репетиция',angle:'Почему реплика не работает',format:'reel'};
function good(){
 return {title:'Конфликт с режиссёром',caption:'Полный текст под видеороликом',
  slides:Array.from({length:5},(_,i)=>({eyebrow:'ШАГ '+i,title:'Точный кадр '+i,body:'Действие в сцене '+i})),
  platformNotes:{instagram:'Reels',vk:'Клипы',youtube:'Shorts'},
  style:'editorial',assetInstruction:'Снять оригинальные реплики'};
}
test('real local script requires actual Ollama JSON and reports provider',async()=>{
 let calls=0;
 const r=await generateLocalPersonaScriptDraft({idea,fetchImpl:async(url,options)=>{
  calls++;
  assert.equal(url,'http://127.0.0.1:11434/api/chat');
  const payload=JSON.parse(options.body);
  assert.equal(payload.stream,false);assert.equal(payload.format,'json');
  assert.match(payload.messages[0].content,/не выдумывай|Не выдавай/iu);
  return {ok:true,json:async()=>({message:{content:JSON.stringify(good())}})};
 }});
 assert.equal(calls,1);assert.equal(r.mode,'ai');assert.equal(r.provider,'ollama-local');
 assert.equal(r.draft.slides.length,5);
});
test('offline Ollama, invalid JSON and branded text never yield fake AI output',async()=>{
 await assert.rejects(generateLocalPersonaScriptDraft({idea,fetchImpl:async()=>{throw Error('offline')}}),/ollama_unavailable/);
 await assert.rejects(generateLocalPersonaScriptDraft({idea,fetchImpl:async()=>({
  ok:true,json:async()=>({message:{content:'not json'}})
 })}),/invalid_json/);
 await assert.rejects(generateLocalPersonaScriptDraft({idea,fetchImpl:async()=>({
  ok:true,json:async()=>({message:{content:JSON.stringify({...good(),caption:'Persona draft'})}})
 })}),/internal_brand/);
});
test('rejects malformed idea before model request',async()=>{
 await assert.rejects(generateLocalPersonaScriptDraft({
  idea:{...idea,title:' '},fetchImpl:async()=>{throw Error('should not be called')}
 }),/invalid_request/);
});
