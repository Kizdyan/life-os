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
test('research allows 8 sourced slides, never treating search citations as author approval',async()=>{
 const eight=structuredClone(packet);
 eight.slides.push(...[1,2,3].map(i=>({text:'Дополнительная проверяемая деталь '+i,sources:[{title:'Публикация',url:u1}]})));
 const response=await generatePersonaCarouselResearch({theme:'Музыкальная драматургия',consent:true,
  env:{PERPLEXITY_API_KEY:'test-only'},fetchImpl:async()=>({ok:true,json:async()=>result(eight)})});
 assert.equal(response.packet.slides.length,8);
 assert.equal(response.status,'UNVERIFIED');
 assert.equal(response.approved,false);
 await assert.rejects(generatePersonaCarouselResearch({theme:'Музыкальная драматургия',consent:true,
  env:{PERPLEXITY_API_KEY:'test-only'},fetchImpl:async()=>({ok:true,json:async()=>result({...eight,slides:[...eight.slides,eight.slides[0]]})})}),/5.?8/);
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

test('discovery selects its own topic and returns only an unverified candidate',async()=>{
 const discovered=structuredClone(packet);
 for(const slide of discovered.slides)slide.visualDirection='Конкретный кинематографичный кадр: '+slide.text;
 let calls=0;
 const env={PERPLEXITY_API_KEY:'test-only'};
 const fetchImpl=async(url,options)=>{
  calls++;
  const body=JSON.parse(options.body);
  assert.deepEqual(JSON.parse(body.input),{task:'Выбери тему самостоятельно',excludedTitles:['Уже использованная тема']});
  assert.match(body.instructions,/Самостоятельно выбери/);
  return {ok:true,json:async()=>result(discovered)};
 };
 const output=await generatePersonaCarouselResearch({mode:'discover',history:['Уже использованная тема'],consent:true,env,fetchImpl});
 assert.equal(calls,1);
 assert.equal(output.mode,'discover');
 assert.equal(output.status,'UNVERIFIED');
 assert.equal(output.approved,false);
 assert.equal(output.published,false);
 assert.equal(output.packet.title,discovered.title);
});
test('discovery rejects malformed inputs before spending, then rejects reused topics and inadequate results',async()=>{
 let calls=0;
 const env={PERPLEXITY_API_KEY:'test-only'};
 const valid=structuredClone(packet);
 for(const slide of valid.slides)slide.visualDirection='Крупный план: '+slide.text;
 const request={mode:'discover',consent:true,env};
 const mocked=p=>async()=>{calls++;return {ok:true,json:async()=>result(p)}};
 for(const bad of [{theme:'Готовая тема'},{history:'not-an-array'},{history:Array(21).fill('Повтор')},{mode:'unknown'},{history:['']}])
  await assert.rejects(generatePersonaCarouselResearch({...request,...bad,fetchImpl:mocked(valid)}));
 await assert.rejects(generatePersonaCarouselResearch({...request,consent:false,fetchImpl:mocked(valid)}),/согласие/);
 assert.equal(calls,0);
 await assert.rejects(generatePersonaCarouselResearch({...request,history:[' ЗАЧЕМ МУЗЫКА ПРЕДУПРЕЖДАЕТ ЗРИТЕЛЯ! '],fetchImpl:mocked(valid)}),/повторил/);
 await assert.rejects(generatePersonaCarouselResearch({...request,fetchImpl:mocked(packet)}),/визуальное решение/);
 const thin=structuredClone(valid);
 for(const slide of thin.slides.slice(2)){delete slide.sources;slide.interpretation=true}
 await assert.rejects(generatePersonaCarouselResearch({...request,fetchImpl:mocked(thin)}),/достаточно слайдов/);
 const repeated=structuredClone(valid);repeated.slides[1].text=repeated.slides[0].text;
 await assert.rejects(generatePersonaCarouselResearch({...request,fetchImpl:mocked(repeated)}),/повторяющиеся/);
});
test('worker discovery uses existing auth, consent and rate limit before invoking provider',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-carousel-discover-'));
 let calls=0;
 const worker=createPersonaMediaWorker({
  port:0,outputRoot:root,ollamaModel:'unused',apiEnv:{PERPLEXITY_API_KEY:'test-only'},
  carouselResearch:async input=>{
   calls++;assert.equal(input.mode,'discover');assert.deepEqual(input.history,['Старая тема']);assert.equal(input.consent,true);
   assert.equal(input.theme,undefined);return {mode:'discover',provider:'perplexity',status:'UNVERIFIED',approved:false,packet};
  }
 });
 const base='http://127.0.0.1:'+await worker.start();
 const post=(body,token=worker.token)=>fetch(base+'/carousel-research',{method:'POST',headers:{'Content-Type':'application/json','X-Persona-Worker-Token':token},body:JSON.stringify(body)});
 try{
  const req={mode:'discover',history:['Старая тема'],consent:true};
  assert.equal((await post(req,'bad')).status,401);
  assert.equal((await post({...req,consent:false})).status,400);
  assert.equal((await post({...req,theme:'Не заданная моделью тема'})).status,400);
  assert.equal(calls,0);
  for(let i=0;i<5;i++){const response=await post(req);assert.equal(response.status,200);assert.equal((await response.json()).status,'UNVERIFIED')}
  assert.equal((await post(req)).status,400);assert.equal(calls,5);
 }finally{await new Promise(r=>worker.server.close(r));await rm(root,{recursive:true,force:true})}
});
