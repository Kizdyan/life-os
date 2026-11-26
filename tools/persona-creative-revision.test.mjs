import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateCreativePatch,localCreativeRevision} from './persona-creative-revision.mjs';

test('local model is called and structured patch is returned',async()=>{
 let called=false;
 const result=await localCreativeRevision({model:'qwen3:4b-instruct',request:{topic:'Музыка в кино',text:'Заголовок\n\nТекст',comment:'Сделай темнее',style:{palette:'light'}},fetchImpl:async(url,init)=>{
  called=true;assert.equal(url,'http://127.0.0.1:11434/api/chat');
  assert.equal(JSON.parse(init.body).model,'qwen3:4b-instruct');
  return {ok:true,json:async()=>({message:{content:JSON.stringify({status:'patch',patch:{palette:'dark'}})}})};
 }});
 assert.equal(called,true);assert.deepEqual(result.patch,{palette:'dark'});assert.equal(result.provider,'ollama-local');
});
test('rejects unknown keys, external actions, branding, invalid fonts',()=>{
 for(const patch of [{publish:true},{font:'unknown'},{text:'Persona'},{palette:'neon'},{text:'Константин Умрихин'},{text:'x'.repeat(261)}])assert.throws(()=>validateCreativePatch({status:'patch',patch}));
});
test('unsupported is explicit and provider failures are not simulated',async()=>{
 assert.equal(validateCreativePatch({status:'unsupported',reason:'Нужен новый рисунок'}).status,'unsupported');
 await assert.rejects(localCreativeRevision({model:'qwen3:4b-instruct',request:{topic:'Кино',text:'Текст',comment:'Исправить'},fetchImpl:async()=>({ok:false,status:503})}),/ollama_http_503/);
});

test('author brand notes reach only the local model as bounded context',async()=>{
 const request={topic:'Кино',text:'Заголовок',comment:'Сделай темнее',brandNotes:['Не использовать подпись автора']};
 const result=await localCreativeRevision({model:'qwen3:4b-instruct',request,fetchImpl:async(url,init)=>{
  assert.equal(url,'http://127.0.0.1:11434/api/chat');
  const body=JSON.parse(init.body);
  assert.deepEqual(JSON.parse(body.messages[1].content).brandNotes,request.brandNotes);
  return {ok:true,json:async()=>({message:{content:'{"status":"patch","patch":{"palette":"dark"}}'}})};
 }});
 assert.equal(result.patch.palette,'dark');
 await assert.rejects(localCreativeRevision({model:'qwen3:4b-instruct',request:{...request,brandNotes:['x'.repeat(601)]},fetchImpl:async()=>{throw Error('must not call')} }),/invalid_brand_notes/);
});
