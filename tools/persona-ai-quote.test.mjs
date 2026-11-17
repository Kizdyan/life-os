import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyQuoteSpeech,cueFromWhisper,validateQuoteText,quoteCue,generatePersonaQuote} from './persona-ai-quote.mjs';

const silent=[{status:'no-speech-detected',segments:[]},{status:'no-audio',segments:[]}];
const spoken=[{status:'whisper-transcribed',segments:[{startSec:1.2,endSec:2.2,text:'Я играю для тебя'},
 {startSec:2.4,endSec:3.3,text:'Послушай эту музыку'}]}];
const choices=[{fileIndex:0,startSec:1,durationSec:2.5},{fileIndex:0,startSec:4,durationSec:3}];
test('speech >2 words wins; no-speech and little speech generate a quote; unknown ASR forbids quote',()=>{
 assert.equal(classifyQuoteSpeech(silent).mode,'quote');
 assert.equal(classifyQuoteSpeech(spoken).mode,'speech');
 assert.equal(classifyQuoteSpeech([{status:'whisper-transcribed',
  segments:[{startSec:1,endSec:2,text:'Слышно'}]}]).mode,'quote');
 for(const unknown of ['whisper-failed','whisper-unavailable','skipped-fast-draft','noise-only'])
  assert.equal(classifyQuoteSpeech([{status:unknown,segments:[]}]).mode,'unverified');
 assert.equal(classifyQuoteSpeech([silent[0],{status:'whisper-unavailable',segments:[]}]).mode,'unverified');
});
test('speech captions are ONLY Whisper words at actual edit offsets, never generated',()=>{
 const cues=cueFromWhisper({audio:spoken,choices});
 assert.deepEqual(cues,[{startMs:200,endMs:1200,text:'Я играю для тебя'},
 {startMs:1400,endMs:2300,text:'Послушай эту музыку'}]);
 const excluded=cueFromWhisper({audio:spoken,choices:[{fileIndex:0,startSec:6,durationSec:2}]});
 assert.deepEqual(excluded,[]);
});
test('unique quotes constrained to 2–7 words, with one timed, non-overlapping overlay',()=>{
 const q='Тишина перед первым аккордом';
 assert.equal(validateQuoteText('«'+q+'»'),q);
 const cues=quoteCue(q,choices);
 assert.equal(cues.length,1);
 assert.equal(cues[0].text,'Тишина перед\\nпервым аккордом'.replace('\\n','\n'));
 assert.ok(cues[0].text.split('\n').every(line=>[...line].length<=16),'keep Gold quote inside two balanced lines');
 assert.ok(cues[0].startMs>=0&&cues[0].endMs<=5500);
 assert.ok(cues[0].endMs>cues[0].startMs+2000);
 assert.throws(()=>quoteCue('Понимаешь иногда совершенно необыкновенное значение простого ощущения',choices),/too wide/);
 for(const bad of ['Верь в себя','Это очень очень очень очень очень очень очень длинная фраза',
  'Один','текст\\Nопасность','<script>x</script>','Две строки\nопасно'])
  assert.throws(()=>validateQuoteText(bad));
});
test('one OpenRouter text-only request uses verified mood and rejects invented speech',async()=>{
 let calls=0;
 const result=await generatePersonaQuote({mood:'premium',
  env:{OPENROUTER_API_KEY:'fixture',PERSONA_AUTO_RENDER_MODEL:'openai/gpt-4.1-mini'},
  fetchImpl:async(url,opts)=>{
   calls++;assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');
   const data=JSON.parse(opts.body);
   assert.equal(data.messages[1].content.includes('Премиальное'),true);
   assert.equal(data.messages[1].content.includes('не копируй примеры'),true);
   assert.ok(!JSON.stringify(data).includes('image_url'));
   assert.ok(data.messages[0].content.includes('НЕ произнесённые'));
   return {ok:true,text:async()=>JSON.stringify({choices:[{message:{
    content:JSON.stringify({quote:'У музыки своя тишина'})}}]})};
  }});
 assert.equal(calls,1);assert.equal(result.quote,'У музыки своя тишина');
 assert.equal(result.requestCount,1);assert.equal(result.mood,'premium');
 assert.match(result.promptSha256,/^[a-f0-9]{64}$/);
});
test('no OpenRouter, invalid mood and out-of-policy LLM phrase are fail-closed',async()=>{
 await assert.rejects(generatePersonaQuote({mood:'premium',env:{}}),/OpenRouter unavailable/);
 await assert.rejects(generatePersonaQuote({mood:'newly-invented',env:{OPENROUTER_API_KEY:'fixture'}}),/Invalid mood/);
 await assert.rejects(generatePersonaQuote({mood:'calm',env:{OPENROUTER_API_KEY:'fixture'},
  fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify({choices:[{message:{
   content:'{"quote":"Следуй за мечтой"}'}}]})})}),/cliché/);
});
