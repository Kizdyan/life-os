import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {generateCarouselBackground,carouselBackgroundPrompt,carouselBackgroundStatus} from './persona-carousel-backgrounds.mjs';
import {createPersonaMediaWorker} from './persona-media-worker.mjs';

// A complete 1024 x 1536 RGBA PNG; the old signature + zero padding was not an image.
// Table-based fixture CRC works on every Node 22 minor (zlib.crc32 requires 22.15).
const crcTable=Uint32Array.from({length:256},(_,index)=>{
 let value=index;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);return value>>>0;
});
function fixtureCrc(bytes){let value=0xffffffff;for(const byte of bytes)value=crcTable[(value^byte)&255]^(value>>>8);return (value^0xffffffff)>>>0}
assert.equal(fixtureCrc(Buffer.from('123456789')),0xcbf43926); // Standard independent CRC-32 check vector.
function pngChunk(type,data){
 const tag=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);
 length.writeUInt32BE(data.length);crc.writeUInt32BE(fixtureCrc(Buffer.concat([tag,data])));
 return Buffer.concat([length,tag,data,crc]);
}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1024);ihdr.writeUInt32BE(1536,4);ihdr[8]=8;ihdr[9]=6;
const validPng=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',ihdr),
 pngChunk('IDAT',deflateSync(Buffer.alloc((1024*4+1)*1536))),pngChunk('IEND',Buffer.alloc(0))]);
const providerResponse=png=>new Response(JSON.stringify({created:1795305600,data:[{b64_json:png.toString('base64')}],output_format:'png',size:'1024x1536',quality:'medium'}));

test('status distinguishes missing credentials and consent and uses a supported effective model',()=>{
 const missing=carouselBackgroundStatus({});
 assert.equal(missing.status,'BLOCKED');assert.equal(missing.code,'IMAGE_PROVIDER_NOT_CONFIGURED');
 assert.equal(missing.model,'gpt-image-2.5-sunburst');
 const configured=carouselBackgroundStatus({OPENAI_API_KEY:'test-secret',PERSONA_CAROUSEL_IMAGE_MODEL:'gpt-image-2.5-flare-2026-09-08'});
 assert.equal(configured.status,'NEEDS_CONSENT');assert.equal(configured.model,'gpt-image-2.5-flare-2026-09-08');
 assert.equal(configured.paidConsentRequired,true);assert.equal(configured.configured,true);
 assert.ok(!JSON.stringify(configured).includes('test-secret'));
});

test('retired, unknown, blank or unsafe model overrides fail closed before a provider request',async()=>{
 for(const model of ['gpt-image-1','dall-e-3','unknown','', ' gpt-image-2.5-sunburst','https://secret.invalid/key']){
  const env={OPENAI_API_KEY:'test-secret',PERSONA_CAROUSEL_IMAGE_MODEL:model};
  const status=carouselBackgroundStatus(env);
  assert.equal(status.status,'BLOCKED');assert.equal(status.code,'IMAGE_MODEL_UNSUPPORTED');assert.equal(status.model,null);
  let calls=0;
  const result=await generateCarouselBackground({theme:'Театр',index:0,paidConsent:true},{env,fetchImpl:()=>{calls++;throw Error('unexpected network')}});
  assert.equal(calls,0);assert.equal(result.status,'BLOCKED');assert.equal(result.code,'IMAGE_MODEL_UNSUPPORTED');
  assert.equal(result.pngBase64,undefined);assert.ok(!JSON.stringify(result).includes('secret'));
 }
});

test('blank credentials remain BLOCKED even with consent and never call the provider',async()=>{
 let calls=0;const env={OPENAI_API_KEY:'   '};
 assert.equal(carouselBackgroundStatus(env).configured,false);
 const result=await generateCarouselBackground({theme:'Театр',index:0,paidConsent:true},{env,fetchImpl:()=>{calls++;throw Error('unexpected network')}});
 assert.equal(result.code,'IMAGE_PROVIDER_NOT_CONFIGURED');assert.equal(calls,0);
});

test('without a key selects a deterministic local image and never calls a provider',async()=>{
 const args={theme:'Почему самая страшная сцена часто тише всех',index:0};
 const options={env:{},fetchImpl:()=>{throw Error('unexpected network')}};
 const a=await generateCarouselBackground(args,options),b=await generateCarouselBackground(args,options);
 assert.deepEqual(a,b);assert.equal(a.source,'library');assert.equal(a.libraryId,'empty-stage');
 assert.match(a.prompt,/solitary chair/);assert.match(a.prompt,/NO TEXT/);
});
test('OpenAI receives text-free prompt with bounded request and returns PNG, never credentials',async()=>{
 let request;
 const png=validPng.toString('base64');
 const result=await generateCarouselBackground({theme:'Тихая сцена',index:2,paidConsent:true},{env:{OPENAI_API_KEY:'test-secret',PERSONA_CAROUSEL_IMAGE_MODEL:'gpt-image-2.5-flare'},fetchImpl:async(url,init)=>{
  request={url,...init};return providerResponse(validPng);
 }});
 assert.equal(request.url,'https://api.openai.com/v1/images/generations');assert.ok(request.signal);
 const body=JSON.parse(request.body);
 assert.deepEqual({model:body.model,n:body.n,size:body.size,quality:body.quality,output_format:body.output_format},
  {model:'gpt-image-2.5-flare',n:1,size:'1024x1536',quality:'medium',output_format:'png'});
 assert.equal(body.response_format,undefined);
 assert.match(body.prompt,/NO TEXT/);assert.equal(result.status,'READY');assert.equal(result.source,'openai');assert.equal(result.pngBase64,png);
 assert.equal(result.model,'gpt-image-2.5-flare');
 assert.ok(!JSON.stringify(result).includes('test-secret'));
});

test('signature-only, truncated or CRC-damaged PNG data never reports READY',async()=>{
 const damaged=Buffer.from(validPng);damaged[29]^=1;
 for(const png of [Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(2048)]),validPng.subarray(0,validPng.length-12),damaged]){
  const result=await generateCarouselBackground({theme:'Театр',index:0,paidConsent:true},{env:{OPENAI_API_KEY:'test-secret'},fetchImpl:async()=>providerResponse(png)});
  assert.equal(result.status,'BLOCKED');assert.equal(result.code,'IMAGE_PROVIDER_FAILED');assert.equal(result.pngBase64,undefined);
 }
});

test('a well-framed PNG with invalid compressed pixels cannot report READY',async()=>{
 const invalid=Buffer.concat([validPng.subarray(0,33),pngChunk('IDAT',Buffer.alloc(2048)),pngChunk('IEND',Buffer.alloc(0))]);
 const result=await generateCarouselBackground({theme:'Театр',index:0,paidConsent:true},{env:{OPENAI_API_KEY:'test-secret'},fetchImpl:async()=>providerResponse(invalid)});
 assert.equal(result.status,'BLOCKED');assert.equal(result.pngBase64,undefined);
});

test('oversized chunked provider responses are cancelled and remain BLOCKED',async()=>{
 let cancelled=false;
 const body=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(1024*1024))},cancel(){cancelled=true}});
 const result=await generateCarouselBackground({theme:'Театр',index:0,paidConsent:true},{env:{OPENAI_API_KEY:'test-secret'},fetchImpl:async()=>new Response(body)});
 assert.equal(result.status,'BLOCKED');assert.equal(result.code,'IMAGE_PROVIDER_FAILED');assert.equal(cancelled,true);
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

test('authenticated Worker exposes the effective model and routes one consented request using only a mocked provider',async()=>{
 const worker=createPersonaMediaWorker({port:0,apiEnv:{OPENAI_API_KEY:'test-secret',PERSONA_CAROUSEL_IMAGE_MODEL:'gpt-image-2.5-flare'},ollamaModel:'not-used'});
 const base='http://127.0.0.1:'+await worker.start(),originalFetch=globalThis.fetch;let upstreamCalls=0;
 globalThis.fetch=async(url,init)=>{
  if(String(url).startsWith(base+'/'))return originalFetch(url,init);
  assert.equal(url,'https://api.openai.com/v1/images/generations');upstreamCalls++;
  assert.equal(JSON.parse(init.body).model,'gpt-image-2.5-flare');return providerResponse(validPng);
 };
 const headers={'Content-Type':'application/json','X-Persona-Worker-Token':worker.token};
 try{
  assert.equal((await fetch(base+'/carousel-background/status')).status,401);
  const status=await(await fetch(base+'/carousel-background/status',{headers})).json();
  assert.equal(status.model,'gpt-image-2.5-flare');assert.equal(status.status,'NEEDS_CONSENT');
  const request=paidConsent=>fetch(base+'/carousel-background',{method:'POST',headers,body:JSON.stringify({theme:'Театр',index:0,paidConsent})});
  const blocked=await(await request(false)).json();assert.equal(blocked.status,'BLOCKED');assert.equal(upstreamCalls,0);
  const ready=await(await request(true)).json();
  assert.equal(ready.status,'READY');assert.equal(ready.model,'gpt-image-2.5-flare');assert.equal(ready.pngBase64,validPng.toString('base64'));
  assert.equal(upstreamCalls,1);assert.ok(!JSON.stringify(ready).includes('test-secret'));
 }finally{globalThis.fetch=originalFetch;await new Promise(r=>worker.server.close(r))}
});
