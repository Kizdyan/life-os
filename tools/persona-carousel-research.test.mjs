import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generatePersonaCarouselResearch} from './persona-carousel-research.mjs';
import {createPersonaMediaWorker} from './persona-media-worker.mjs';
const u1='https://www.filmexample.org/interview';
const u2='https://www.filmexample.org/history';
const packet={
 title:'Зачем музыка предупреждает зрителя',
 angle:'Исследование реального кинопроизводства и воздействия музыки',
 caption:'Драматургия может начаться раньше появления героя.',
 slides:[
  {text:'Небанальный проверенный хук',sources:[{title:'Интервью',url:u1}],visualDirection:'Рояль в свете софита'},
  {text:'Что произошло на площадке',sources:[{title:'История',url:u2}]},
  {text:'Что сказал режиссёр',sources:[{title:'Интервью',url:u1}]},
  {text:'Как изменилось восприятие',sources:[{title:'История',url:u2}]},
  {text:'Авторский вывод о музыке',interpretation:true}
 ]
};
const result=(p=packet)=>({status:'completed',model:'openai/test',output:[
 {type:'web_search_call',results:[{url:u1,title:'Интервью'},{url:u2,title:'История'}]},
 {type:'message',content:[{type:'output_text',text:JSON.stringify(p)}]}
]});
test('explicit consent and local API key are required without any paid network request',async()=>{
 let calls=0;
 const mock=async()=>{calls++;throw Error('network should not be called')};
 await assert.rejects(generatePersonaCarouselResearch({theme:'Почему в кино страшно?',env:{},fetchImpl:mock}),/согласие/);
 await assert.rejects(generatePersonaCarouselResearch({theme:'Почему в кино страшно?',consent:true,env:{},fetchImpl:mock}),/PERPLEXITY_API_KEY|ключ/i);
 assert.equal(calls,0);
});
test('uses documented Agent API and refuses model-invented citations not in actual web results',async()=>{
 let request;
 const good=await generatePersonaCarouselResearch({
  theme:'История киномузыки',consent:true,env:{PERPLEXITY_API_KEY:'private-test-key'},
  fetchImpl:async(url,options)=>{
   request={url,body:JSON.parse(options.body),headers:options.headers};
   return {ok:true,json:async()=>result()};
  }
 });
 assert.equal(request.url,'https://api.perplexity.ai/v1/agent');
 assert.equal(request.body.tools[0].type,'web_search');
 assert.equal(request.body.max_steps,5);
 assert.equal('max_tool_calls' in request.body,false);
 assert.equal(request.body.store,false);
 assert.equal(request.headers.Authorization,'Bearer private-test-key');
 assert.doesNotMatch(JSON.stringify(request.body),/private-test-key/);
 assert.equal(good.status,'UNVERIFIED');assert.equal(good.approved,false);
 assert.equal(good.packet.slides.length,5);
 assert.equal(good.packet.slides[4].interpretation,true);
 const invented=structuredClone(packet);
 invented.slides[0].sources=[{title:'Выдумано',url:'https://invented.example/article'}];
 await assert.rejects(generatePersonaCarouselResearch({
  theme:'История киномузыки',consent:true,env:{PERPLEXITY_API_KEY:'private-test-key'},
  fetchImpl:async()=>({ok:true,json:async()=>result(invented)})
 }),/не найден в реальных результатах/);
});
test('a message without web-search results is never accepted as researched',async()=>{
 await assert.rejects(generatePersonaCarouselResearch({
  theme:'История киномузыки',consent:true,env:{PERPLEXITY_API_KEY:'secret'},
  fetchImpl:async()=>({ok:true,json:async()=>({status:'completed',output:[
   {type:'message',content:[{type:'output_text',text:JSON.stringify(packet)}]}]})})
 }),/нет поисковых результатов/);
});
test('localhost Worker requires token and user consent for research and never marks it approved',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-carousel-research-'));
 let researchCalls=0;
 const worker=createPersonaMediaWorker({
  port:0,outputRoot:root,ollamaModel:'unused',
  apiEnv:{PERPLEXITY_API_KEY:'testing-key'},
  carouselResearch:async()=>{researchCalls++;return {provider:'perplexity',status:'UNVERIFIED',packet}}
 });
 const base='http://127.0.0.1:'+await worker.start();
 const post=(body,token=worker.token)=>fetch(base+'/carousel-research',{
  method:'POST',headers:{'Content-Type':'application/json','X-Persona-Worker-Token':token},
  body:JSON.stringify(body)
 });
 try{
  const h=await(await fetch(base+'/health')).json();
  assert.equal(h.carouselResearch.configured,true);
  assert.equal((await post({theme:'История киномузыки',consent:true},'wrong')).status,401);
  assert.equal((await post({theme:'История киномузыки',consent:false})).status,400);
  assert.equal(researchCalls,0);
  const good=await post({theme:'История киномузыки',consent:true});
  assert.equal(good.status,200);
  assert.equal((await good.json()).status,'UNVERIFIED');
  assert.equal(researchCalls,1);
 }finally{await new Promise(r=>worker.server.close(r));await rm(root,{recursive:true,force:true})}
});
