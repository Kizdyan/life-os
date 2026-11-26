#!/usr/bin/env node
/** Actual versioned editorial production; the separate Worker contract uses an
 * explicitly mocked upstream and is never called live generation evidence. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {createPersonaMediaWorker} from './persona-media-worker.mjs';
const out=resolve(process.env.PERSONA_EDITORIAL_V2_OUTPUT||'artifacts/persona-editorial-v2');
const origin=process.env.PERSONA_PREVIEW_URL||'http://127.0.0.1:4173';
const sha=b=>createHash('sha256').update(b).digest('hex');
await mkdir(out,{recursive:true});
for(const [revision,name]of(process.env.PERSONA_REVIEW_REUSE_EXPORTS==='1'?[]:[['v1','v1'],['v2a','v2'],['v2b','cover-b']])){
 await new Promise((ok,no)=>{
  const child=spawn(process.execPath,['tools/persona-production-carousel-browser-e2e.mjs'],{shell:false,windowsHide:true,
   env:{...process.env,PERSONA_PRODUCTION_REVISION:revision,PERSONA_PRODUCTION_OUTPUT:join(out,name)},stdio:'inherit'});
  const timer=setTimeout(()=>{child.kill();no(Error('Revision browser test timed out'))},150000);
  child.once('error',e=>{clearTimeout(timer);no(e)});child.once('close',code=>{clearTimeout(timer);code===0?ok():no(Error(revision+' browser failed: '+code))});
 });
}
const {chromium}=await import(process.env.PERSONA_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const deadline=setTimeout(()=>void browser.close(),120000);
let worker;const originalFetch=globalThis.fetch;let providerCalls=0,forbiddenCalls=0;
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.route(/https:\/\/(api\.openai\.com|api\.perplexity\.ai|openrouter\.ai)\//,r=>{forbiddenCalls++;return r.abort()});
 const page=await context.newPage();
 // Same-origin page has fonts/modules/IndexedDB but no async React rendering.
 await page.route('**/__editorial_review',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
 await page.goto(origin+'/__editorial_review');
 console.log('Review exports loaded; assembling comparison');
 const files=[];
 for(const folder of['v1','v2'])for(const name of await readdir(join(out,folder))){
  if(name.endsWith('.zip'))continue;
  files.push({name:folder+'/'+name,data:(await readFile(join(out,folder,name))).toString('base64')});
 }
 files.push({name:'editorial-review.md',data:(await readFile('docs/persona-editorial-quality-v2.md')).toString('base64')});
 const covers=[(await readFile(join(out,'v2','slide-01.png'))).toString('base64'),(await readFile(join(out,'cover-b','slide-01.png'))).toString('base64')];
 const sheets=[(await readFile(join(out,'v1','contact-sheet.png'))).toString('base64'),(await readFile(join(out,'v2','contact-sheet.png'))).toString('base64')];
 const assembled=await page.evaluate(async({files,covers,sheets})=>{
  const media=await import('/src/personaEditorialMedia.ts');
  await document.fonts.load('400 28px "Inter"','Обложка');
  async function contact(images,labels,w,h,thumbW,thumbH){
   const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
   x.fillStyle='#1c1c1e';x.fillRect(0,0,w,h);x.font='400 28px "Inter"';x.textAlign='center';x.fillStyle='#F2E9DC';
   for(let i=0;i<2;i++){const image=new Image();image.src='data:image/png;base64,'+images[i];await image.decode();
    x.fillText(labels[i],w*(i+.5)/2,42);x.drawImage(image,w*i/2+(w/2-thumbW)/2,80,thumbW,thumbH);}
   return new Uint8Array(await(await new Promise(ok=>c.toBlob(ok,'image/png'))).arrayBuffer());
  }
  const comparison=await contact(sheets,['V1 · исходная','V2 · редакторская доработка'],2160,2240,1080,2160);
  const hooks=await contact(covers,['Обложка A','Обложка B'],1080,760,480,600);
  const all=files.map(f=>({name:f.name,data:Uint8Array.from(atob(f.data),c=>c.charCodeAt(0))}));
  all.push({name:'v2/cover-hook-b.png',data:Uint8Array.from(atob(covers[1]),c=>c.charCodeAt(0))},
   {name:'v1-v2-comparison.png',data:comparison},{name:'cover-comparison.png',data:hooks});
  const v2=all.filter(f=>f.name.startsWith('v2/')).map(f=>({...f,name:f.name.slice(3)}));
  v2.push({name:'cover-comparison.png',data:hooks},all.find(f=>f.name==='editorial-review.md'));
  const base64=data=>{let s='';for(let i=0;i<data.length;i+=32768)s+=String.fromCharCode(...data.subarray(i,i+32768));return btoa(s)};
  globalThis.reviewExports={'fridge-hum-V1-V2-REVIEW.zip':media.zipFileBytes(all),'fridge-hum-V2-REVIEW.zip':media.zipFileBytes(v2)};
  return {comparison:base64(comparison),hooks:base64(hooks)};
 },{files,covers,sheets});
 console.log('Comparison images assembled');
 await writeFile(join(out,'v1-v2-comparison.png'),Buffer.from(assembled.comparison,'base64'));
 await writeFile(join(out,'cover-comparison.png'),Buffer.from(assembled.hooks,'base64'));
 for(const name of['fridge-hum-V1-V2-REVIEW.zip','fridge-hum-V2-REVIEW.zip']){
  const ready=page.waitForEvent('download');
  await page.evaluate(async name=>{const m=await import('/src/personaEditorialMedia.ts');m.triggerEditorialDownload(globalThis.reviewExports[name],name)},name);
  await(await ready).saveAs(join(out,name));
 }

 // Valid fixture image, from a saved illustration. NOT a new generated image.
 const fixture=await page.evaluate(async()=>{
  const image=new Image();image.src='/carousel-backgrounds/fridge-hum-v1/background-1.jpg';await image.decode();
  const c=document.createElement('canvas');c.width=1024;c.height=1536;c.getContext('2d').drawImage(image,0,0,1024,1536);
  return c.toDataURL('image/png').split(',')[1];
 });
 globalThis.fetch=async(url,init)=>{
  if(String(url).startsWith('http://127.0.0.1:')||String(url).startsWith('http://localhost:'))return originalFetch(url,init);
  assert.equal(url,'https://api.openai.com/v1/images/generations');providerCalls++;
  return new Response(JSON.stringify({data:[{b64_json:fixture}]}),{headers:{'Content-Type':'application/json'}});
 };
 console.log('Review ZIP saved; checking mocked Worker contract');
 worker=createPersonaMediaWorker({port:0,outputRoot:join(out,'mock-worker'),apiEnv:{OPENAI_API_KEY:'mock-contract-key-not-real'}});
 const port=await worker.start(),actualBase='http://127.0.0.1:'+port;
 const expectedBase=await page.evaluate(async()=>{const m=await import('/src/personaWorkerUrl.ts');return new URL(m.personaWorkerUrl,location.href).href.replace(/\/$/,'')});
 await context.route(expectedBase+'/**',async r=>{
  const response=await r.fetch({url:actualBase+new URL(r.request().url()).pathname,
   headers:{...r.request().headers(),host:'127.0.0.1:'+port},timeout:15000});
  await r.fulfill({response});
 });
 console.log('Isolated test Worker listening');
 const contract=await page.evaluate(async()=>{
  const media=await import('/src/personaEditorialMedia.ts'),model=await import('/src/personaEditorialV2.ts');
  const p=model.createFridgeHumV2();p.id='image-worker-contract';
  const blocked=await media.requestEditorialBackground(p,0);if(blocked.status!=='BLOCKED')throw Error('Consent bypass');
  const result=await media.requestEditorialBackground(p,0,{paidConsent:true});
  if(result.status!=='READY'||!result.background)throw Error(result.message);
  const stored=await media.readEditorialImageByRef(result.background.generatedRef);if(!stored)throw Error('Image was not persisted');
  p.slides[0].background=result.background;
  const provenance=(await media.editorialImageProvenance({...p,slides:p.slides.slice(0,1)}))[0];
  if(provenance.v1AssetReused!==false||provenance.generationMode!=='worker-api')throw Error('Replacement image provenance mislabelled');
  const png=await media.renderEditorialSlide(p,p.slides[0],0),bitmap=await createImageBitmap(png);
  const data={upstream:'MOCKED; not live generation',status:result.status,storedBytes:stored.bytes,
   rendered:[bitmap.width,bitmap.height],provider:result.background.provenance.provider,model:result.background.provenance.model,v1AssetReused:provenance.v1AssetReused};bitmap.close();return data;
 });
 assert.equal(providerCalls,1);assert.equal(forbiddenCalls,0);assert.deepEqual(contract.rendered,[1080,1350]);
 await writeFile(join(out,'worker-image-contract.json'),JSON.stringify({...contract,liveGeneration:'BLOCKED_WITHOUT_PAID_PERMISSION',actualPaidCalls:0},null,2)+'\n');
 for(const folder of['v2','cover-b']){
  const qa=JSON.parse(await readFile(join(out,folder,'browser-QA.json'),'utf8'));
  const cover=qa.typography.filter(t=>t.slide===1),coin={left:690,top:780,right:980,bottom:1240};
  assert.ok(cover.every(t=>t.left+t.width<coin.left||t.left>coin.right||t.top+t.height<coin.top||t.top>coin.bottom),'Cover text overlaps protected coin: '+folder);
 }
 const v1ConfigSha=sha(JSON.stringify(JSON.parse(await readFile('config/carousel-fridge-hum.json','utf8'))));
 assert.equal(v1ConfigSha,'945541543ded39486d6fbfbc8eea89fe78949b9d325202fa608561cff374d168','V1 source copy must remain unchanged');
 await writeFile(join(out,'comparison-QA.json'),JSON.stringify({v1CanonicalConfigSha256:v1ConfigSha,
  v1Preserved:true,coverTextClearOfCoin:true,authorApproval:false,publicationAllowed:false,actualPaidCalls:0,
  independentArtReviewRequired:true},null,2)+'\n');
 console.log('EDITORIAL_V2_PRODUCTION_PASS: V1 + V2 + alternate hook, actual PNG/ZIP, mocked Worker image contract');
}finally{clearTimeout(deadline);globalThis.fetch=originalFetch;if(worker)await new Promise(r=>worker.server.close(r));await browser.close()}
