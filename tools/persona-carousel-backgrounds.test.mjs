import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateCarouselBackground,carouselBackgroundPrompt} from './persona-carousel-backgrounds.mjs';
import {createPersonaMediaWorker} from './persona-media-worker.mjs';

test('without a key selects a deterministic local image and never calls a provider',async()=>{
 const args={theme:'Почему самая страшная сцена часто тише всех',index:0};
 const options={env:{},fetchImpl:()=>{throw Error('unexpected network')}};
 const a=await generateCarouselBackground(args,options),b=await generateCarouselBackground(args,options);
 assert.deepEqual(a,b);assert.equal(a.source,'library');assert.equal(a.libraryId,'empty-stage');
 assert.match(a.prompt,/solitary chair/);assert.match(a.prompt,/NO TEXT/);
});
test('OpenAI receives text-free prompt with bounded request and returns PNG, never credentials',async()=>{
 let request;
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(2048)]).toString('base64');
 const result=await generateCarouselBackground({theme:'Тихая сцена',index:2,paidConsent:true},{env:{OPENAI_API_KEY:'test-secret'},fetchImpl:async(url,init)=>{
  request={url,...init};return new Response(JSON.stringify({data:[{b64_json:png}]}));
 }});
 assert.equal(request.url,'https://api.openai.com/v1/images/generations');assert.ok(request.signal);
 assert.match(JSON.parse(request.body).prompt,/NO TEXT/);assert.equal(result.source,'openai');assert.equal(result.pngBase64,png);
 assert.ok(!JSON.stringify(result).includes('test-secret'));
});
test('provider errors or corrupt images fall back visibly without leaking responses',async()=>{
 for(const fetchImpl of [async()=>{throw Error('secret detail')},async()=>new Response('secret detail',{status:401}),async()=>new Response(JSON.stringify({data:[{b64_json:'invalid'}]}))]){
  const r=await generateCarouselBackground({theme:'Театр',index:1,paidConsent:true},{env:{OPENAI_API_KEY:'test-secret'},fetchImpl});
  assert.equal(r.source,'library');assert.ok(r.warning);assert.ok(!JSON.stringify(r).includes('secret'));
 }
});
test('a configured key never authorizes a paid request without explicit opt-in',async()=>{
 let calls=0;
 const r=await generateCarouselBackground({theme:'Челюсти',index:0},{env:{OPENAI_API_KEY:'test-secret'},fetchImpl:async()=>{calls++;throw Error('Paid request must not run')}});
 assert.equal(calls,0);assert.equal(r.status,'BLOCKED');assert.equal(r.code,'PAID_CONSENT_REQUIRED');
 assert.equal(r.pngBase64,undefined);
});
test('research image prompts use the authored per-slide direction',()=>{
 const r=carouselBackgroundPrompt({theme:'Челюсти',index:0,visualDirection:'Тёмный океан, один след под водой'});
 assert.match(r.prompt,/Тёмный океан/);assert.doesNotMatch(r.prompt,/solitary chair/);
});
test('rejects unbounded theme and invalid slide index before network',()=>{
 assert.throws(()=>carouselBackgroundPrompt({theme:'x'.repeat(401),index:0}));
 assert.throws(()=>carouselBackgroundPrompt({theme:'Театр',index:-1}));
});
test('worker endpoint requires its existing local token and serves no-key fallback',async()=>{
 const worker=createPersonaMediaWorker({port:0,apiEnv:{},ollamaModel:'not-used'});
 const base='http://127.0.0.1:'+await worker.start();
 const request=token=>fetch(base+'/carousel-background',{method:'POST',headers:{'Content-Type':'application/json','X-Persona-Worker-Token':token},body:JSON.stringify({theme:'Тихая сцена',index:0})});
 try{
  assert.equal((await request('wrong')).status,401);
  const response=await request(worker.token);assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.source,'library');assert.equal(data.libraryId,'empty-stage');
  assert.ok(data.warning);assert.equal(data.pngBase64,undefined);
 }finally{await new Promise(r=>worker.server.close(r))}
});
