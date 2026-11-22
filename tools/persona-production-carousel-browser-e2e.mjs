#!/usr/bin/env node
/** Actual source-backed review production inside Persona. No provider mocks,
 * no paid requests and no author checkbox/approval automation. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.PERSONA_PLAYWRIGHT_MODULE||'playwright');
const out=resolve(process.env.PERSONA_PRODUCTION_OUTPUT||'artifacts/persona-production-carousel');
const revision=process.env.PERSONA_PRODUCTION_REVISION||'v1';
assert.ok(['v1','v2a','v2b','v3'].includes(revision));
const draftId=revision==='v3'?'carousel-fridge-hum-v3':revision==='v1'?'carousel-fridge-hum':'carousel-fridge-hum-v2'+(revision==='v2b'?'-hook-b':'');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const hash=b=>createHash('sha256').update(b).digest('hex');
function unzip(buf){const files=[];let at=0;while(at+30<=buf.length&&buf.readUInt32LE(at)===0x04034b50){
 const length=buf.readUInt32LE(at+18),names=buf.readUInt16LE(at+26),extra=buf.readUInt16LE(at+28),start=at+30+names+extra;
 assert.ok(start+length<=buf.length);files.push({name:buf.subarray(at+30,at+30+names).toString('utf8'),bytes:buf.subarray(start,start+length)});at=start+length;}return files;}
try{
 const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
 let paidRequests=0;
 await context.route(/https:\/\/(api\.openai\.com|api\.perplexity\.ai|openrouter\.ai)\//,r=>{paidRequests++;return r.abort()});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.PERSONA_PREVIEW_URL||'http://127.0.0.1:4173')+'/#persona',{waitUntil:'domcontentloaded'});
 await page.getByTestId('open-carousel-fridge-hum').click({timeout:8000});
 const editor=page.getByTestId('persona-editorial-studio');
 await editor.getByTestId('editorial-post-workflow').waitFor();
 const v1Before=await page.evaluate(async()=>{
  const m=await import('/src/personaEditorialModel.ts');
  return m.loadEditorialStore(localStorage).posts.find(p=>p.id==='carousel-fridge-hum');
 });
 if(revision!=='v1')await editor.getByRole('button',{name:revision==='v3'?'V3 · финальная редакция':revision==='v2a'?'V2 · обложка A':'V2 · обложка B',exact:true}).click();
 const semantic=process.env.PERSONA_PRODUCTION_COMPOSITION==='semantic';
 if(semantic){
  assert.equal(revision,'v3');
  await editor.getByTestId('editorial-compose-by-meaning').click();
 }
 let before;
 for(let attempt=0;attempt<100&&!before;attempt++){
  before=await page.evaluate(async id=>{const m=await import('/src/personaEditorialModel.ts');return m.loadEditorialStore(localStorage).posts.find(p=>p.id===id)},draftId);
  if(before&&semantic&&before.compositionPreset!=='semantic-editorial-v1')before=undefined;
  if(!before)await new Promise(r=>setTimeout(r,100));
 }
 assert.ok(before,'Missing selected draft '+draftId+'; '+await editor.innerText());
 if(semantic){
  assert.equal(before.compositionPreset,'semantic-editorial-v1');
  const plan=await page.evaluate(async post=>{const m=await import('/src/personaEditorialTypography.ts');return post.slides.map((_,i)=>m.semanticEditorialComposition(post,i))},before);
  assert.ok(new Set(plan.map(p=>JSON.stringify(p.layout))).size>=5);
  await writeFile(join(out,'composition-plan.json'),JSON.stringify(plan,null,2)+'\n');
 }
 assert.equal(before.slides.length,7);assert.equal(before.approvals.topic,false);
 assert.equal(before.approvals.textApproved,false);assert.equal(before.approvals.designApproved,false);
 assert.ok(before.research.sourceItems.every(s=>!s.reviewed));
 const ready=page.waitForEvent('download',{timeout:60000});
 await editor.getByRole('button',{name:'Скачать черновик для проверки',exact:true}).click();
 const download=await ready.catch(async error=>{throw Error(error.message+'\nEditor state: '+(await editor.innerText()).slice(-7000))});
 const zip=join(out,'fridge-hum-DRAFT.zip');await download.saveAs(zip);
 const files=unzip(await readFile(zip)),pngs=files.filter(f=>/^slide-\d\d\.png$/.test(f.name));
 assert.equal(pngs.length,7);
 for(const f of pngs){assert.equal(f.bytes.readUInt32BE(16),1080);assert.equal(f.bytes.readUInt32BE(20),1350);await writeFile(join(out,f.name),f.bytes);}
 for(const name of ['caption.txt','contact-sheet.png','draft.json','review-manifest.json','research-sources.json','image-provenance.json','source-evidence.json']){
  const f=files.find(f=>f.name===name);assert.ok(f,name+' missing');await writeFile(join(out,name),f.bytes);
 }
 const manifest=JSON.parse(files.find(f=>f.name==='review-manifest.json').bytes);
 assert.equal(manifest.publicationAllowed,false);assert.equal(manifest.purpose,'author-review-only');
 const provenance=JSON.parse(files.find(f=>f.name==='image-provenance.json').bytes);
 assert.equal(new Set(provenance.map(p=>p.sha256)).size,7);
 assert.ok(provenance.every(p=>p.source==='provider-generated'&&p.provider==='codex-imagegen'));
 for(let i=0;i<7;i++){
  await editor.getByRole('button',{name:'Проверить слайд '+(i+1),exact:true}).click();
  let actual;
  for(let attempt=0;attempt<100;attempt++){
  actual=await page.evaluate(async()=>{
   const img=document.querySelector('[data-testid="research-draft-preview"]');if(!img)return false;
   let bytes;try{bytes=await(await fetch(img.src)).arrayBuffer()}catch{return false} // A prior preview URL may have just been revoked.
   return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
  });
  if(actual===hash(pngs[i].bytes))break;await new Promise(r=>setTimeout(r,75));
  }
  assert.equal(actual,hash(pngs[i].bytes),'Actual visible preview bytes must match slide '+(i+1));
 }
 // A separate same-origin page shares IndexedDB but has no React preview jobs.
 // Otherwise an in-flight preview can contaminate the per-slide canvas audit.
 const auditPage=await context.newPage();
 await auditPage.route('**/__persona_canvas_audit',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
 await auditPage.goto((process.env.PERSONA_PREVIEW_URL||'http://127.0.0.1:4173')+'/__persona_canvas_audit');
 const typography=await auditPage.evaluate(async(p)=>{
  const m=await import('/src/personaEditorialModel.ts'),media=await import('/src/personaEditorialMedia.ts');
  const original=CanvasRenderingContext2D.prototype.fillText,checks=[];let slide=0;
  const lum=rgb=>{const v=rgb.map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4});return .2126*v[0]+.7152*v[1]+.0722*v[2]};
  CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...rest){
   const mt=this.measureText(text),left=Math.floor(x-mt.actualBoundingBoxLeft),top=Math.floor(y-mt.actualBoundingBoxAscent);
   const w=Math.ceil(mt.actualBoundingBoxLeft+mt.actualBoundingBoxRight)+2,h=Math.ceil(mt.actualBoundingBoxAscent+mt.actualBoundingBoxDescent)+2;
   if(w>0&&h>0){
    if(left<90||left+w>990||top<90||top+h>1260)throw Error('Text ink outside safe area: '+text);
    const underneath=this.getImageData(left,top,w,h).data,mask=document.createElement('canvas');mask.width=w;mask.height=h;
    const c=mask.getContext('2d');c.font=this.font;c.textAlign=this.textAlign;c.textBaseline=this.textBaseline;c.fillStyle='#fff';
    original.call(c,text,x-left,y-top,...rest);const alpha=c.getImageData(0,0,w,h).data;
    const color=String(this.fillStyle);if(!/^#[0-9a-f]{6}$/i.test(color))throw Error('Unknown text paint');
    const fg=[1,3,5].map(at=>parseInt(color.slice(at,at+2),16));let minimum=Infinity,samples=0;
    for(let at=0;at<alpha.length;at+=8)if(alpha[at+3]>245){
     const bg=[underneath[at],underneath[at+1],underneath[at+2]],paint=fg.map((v,i)=>v*this.globalAlpha+bg[i]*(1-this.globalAlpha));
     const a=lum(bg),b=lum(paint),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);minimum=Math.min(minimum,ratio);samples++;
    }
    if(!samples)throw Error('No measurable glyph pixels');
    checks.push({slide:slide+1,text,font:this.font,minimumContrast:Number(minimum.toFixed(2)),samples,left,top,width:w,height:h});
   }
   return original.call(this,text,x,y,...rest);
  };
  try{for(slide=0;slide<p.slides.length;slide++)await media.renderEditorialSlide(p,p.slides[slide],slide)}
  finally{CanvasRenderingContext2D.prototype.fillText=original}
  return checks;
 },before);
 await auditPage.close();
 const normalize=s=>s.replace(/\s+/gu,' ').trim();
 assert.ok(typography.length>0);
 assert.ok(typography.every(t=>normalize(before.slides[t.slide-1].text).includes(normalize(t.text))),'Each measured line belongs to the audited slide');
 assert.ok(typography.every(t=>t.minimumContrast>=4.5),'Actual photo/glyph contrast below 4.5: '+JSON.stringify(typography.filter(t=>t.minimumContrast<4.5)));
 assert.ok(typography.every(t=>!/^\d{2}\s*\/\s*\d{2}$/.test(t.text)&&!/(PERSONA|EDITORIAL)/i.test(t.text)));
 assert.ok(typography.every(t=>!/(?:[А-Яа-яЁё][A-Za-z]|[A-Za-z][А-Яа-яЁё])/.test(t.text)),'No Latin substitutes inside Russian words');
 const after=await page.evaluate(async id=>{
  const m=await import('/src/personaEditorialModel.ts'),media=await import('/src/personaEditorialMedia.ts');
  const store=m.loadEditorialStore(localStorage),p=store.posts.find(p=>p.id===id);
  let blocked=false;try{await media.buildEditorialExport(p)}catch(e){blocked=/SOURCE_PASS/.test(String(e))}
  return {post:p,blocked,v1:store.posts.find(p=>p.id==='carousel-fridge-hum')};
 },draftId);
 assert.deepEqual(after.v1,v1Before,'V2 must preserve the original V1 record');
 assert.deepEqual(after.post,before,'Review export must not approve or revise a draft');assert.equal(after.blocked,true);
 assert.equal(paidRequests,0);assert.deepEqual(errors,[]);
 const mobile=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,
  editor:document.querySelector('[data-testid="persona-editorial-studio"]').getBoundingClientRect().toJSON(),
  offenders:Array.from(document.querySelectorAll('body *')).filter(el=>{
   const r=el.getBoundingClientRect();return el.checkVisibility()&&r.width>0&&r.right>innerWidth+2;
  }).slice(-10).map(el=>({tag:el.tagName,cls:el.className,text:el.textContent?.slice(0,55),rect:el.getBoundingClientRect().toJSON()}))}));
 assert.ok(mobile.width<=mobile.viewport+2,'Mobile horizontal overflow '+JSON.stringify(mobile));
 await page.screenshot({path:join(out,'mobile-persona-draft.png'),fullPage:true});
 await context.close();
 await writeFile(join(out,'browser-QA.json'),JSON.stringify({revision,draftId,compositionPreset:before.compositionPreset,slides:7,pngSize:'1080x1350',paidRequests,v1RecordUnchanged:true,
  authorApprovalsUnchanged:true,publicationBlocked:true,previewMatchesExport:true,typography,provenance:revision==='v1'?'7 actual tool-generated images, imported locally; no Worker generation':'7 preserved V1 illustrations, reframed and relit in Persona; no new generation',
  sha256:pngs.map(p=>({file:p.name,sha256:hash(p.bytes)}))},null,2)+'\n');
 console.log('PERSONA_PRODUCTION_CAROUSEL_PASS: 7 real PNG, contact sheet, source/provenance ZIP, author approvals unchanged');
}finally{await browser.close()}
