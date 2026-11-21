#!/usr/bin/env node
// Isolated browser acceptance and review-only exports. Author approvals are never persisted.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const {chromium}=await import(process.env.PERSONA_PLAYWRIGHT_MODULE||'playwright');
const cinematic=process.env.QUIET_HORROR_CINEMATIC==='1';
const out=process.env.QUIET_HORROR_OUTPUT||(cinematic?'dist/carousels-v4-cinematic-preview':'dist/carousels-v3-quiet-horror');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.E2E_URL||'http://127.0.0.1:4173')+'/#persona',{waitUntil:'domcontentloaded'});
 await page.getByTestId('open-carousel-quiet-horror').click({timeout:30000});
 await page.getByRole('button',{name:'Утвердить тему',exact:true}).waitFor();
 const data=await page.evaluate(async()=>{
  const m=await import('/src/personaEditorialModel.ts'),media=await import('/src/personaEditorialMedia.ts');
  const draft=m.createQuietHorrorCarousel('2026-11-21T00:00:00.000Z');
  if(!draft.slides.every(s=>s.background))throw Error('Cinematic backgrounds missing');
  if(draft.approvals.textApproved||draft.approvals.designApproved)throw Error('Draft is already approved');
  const images=await Promise.all(draft.slides.map((s,i)=>media.renderEditorialSlide(draft,s,i)));
  const typography=await import('/src/personaEditorialTypography.ts');
  const ctx=document.createElement('canvas').getContext('2d');
  const layouts=draft.slides.map((s,i)=>typography.paintEditorialHierarchy(ctx,s,i));
  for(const layout of layouts)for(const zone of layout){
   if(zone.x<100||zone.y<100||zone.x+zone.width>980||zone.y+zone.height>1250)throw Error('Typography escaped safe margins');
   if(zone.role==='body'&&(zone.size!==32||zone.width>756))throw Error('Body scale/column changed');
  }
  for(const b of images){const im=await createImageBitmap(b);if(im.width!==1080||im.height!==1350)throw Error('Invalid PNG dimensions');im.close();}
  // Simulate the app's delayed Google Fonts face replacing a global family.
  // Renderer-scoped @fontsource aliases must keep the PNG unchanged.
  const inter=performance.getEntriesByType('resource').find(e=>e.name.includes('inter-cyrillic-400-normal.woff2'));
  if(!inter)throw Error('Bundled Cyrillic Inter was not loaded');
  const competing=new FontFace('Cormorant Garamond',`url("${inter.name}")`,{weight:'700'});
  await competing.load();document.fonts.add(competing);
  const second=await media.renderEditorialSlide(draft,draft.slides[0],0);
  document.fonts.delete(competing);
  const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer()))).map(v=>v.toString(16).padStart(2,'0')).join('');
  if(await digest(second)!==await digest(images[0]))throw Error('Nondeterministic rendering');
  let checked=m.approveEditorialStep(m.approveEditorialStep(draft,'topic'),'content');
  for(let i=0;i<6;i++)checked=m.setEditorialChecklistItem(checked,i,true);
  if(!m.editorialChecklistReady(checked))throw Error('Gate failed');
  checked=m.approveEditorialStep(checked,'design');
  if(checked.approvals.contentHashAtApproval!==m.editorialContentHash(checked))throw Error('Approval hash failed');
  const zip=await media.buildEditorialExport(checked);
  const changed=m.reviseEditorialPost(checked,{slides:checked.slides.map((s,i)=>i?s:{...s,headline:s.headline+' Ещё.'})});
  if(changed.approvals.textApproved||changed.approvals.designApproved)throw Error('Edit retained approval');
  const sheet=await media.quietHorrorContactSheet(images);
  const files=images.map((b,i)=>({name:'quiet-horror-slide-'+String(i+1).padStart(2,'0')+'.png',blob:b}));
  const enc=new TextEncoder(),entries=[];
  for(const f of files)entries.push({name:f.name,data:new Uint8Array(await f.blob.arrayBuffer())});
  entries.push({name:'caption.txt',data:enc.encode(draft.caption)});
  entries.push({name:'draft.json',data:enc.encode(JSON.stringify(draft,null,2))});
  entries.push({name:'REVIEW.txt',data:enc.encode('Оформление и тексты ожидают автора. Публикация запрещена до утверждения.')});
  const reviewZip=await media.zipFileBytes(entries);
  const b64=b=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]);r.onerror=no;r.readAsDataURL(b)});
  return {slides:await Promise.all(images.map(b64)),sheet:await b64(sheet),zip:await b64(reviewZip),draft,
   sha256:await Promise.all(images.map(digest)),gateZipBytes:zip.size,layouts};
 });
 // Real UI preview uses precisely the same PNG bytes as export.
 await page.getByRole('button',{name:'Утвердить тему',exact:true}).click();
 await page.getByRole('button',{name:'Утвердить тексты и подпись',exact:true}).click();
 const preview=page.getByTestId('baseline-exact-preview');
 await preview.waitFor({timeout:20000});
 const actual=await preview.evaluate(async img=>{
  const bytes=await(await fetch(img.src)).arrayBuffer();
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
 });
 assert.equal(actual,data.sha256[0],'preview PNG must match export byte-for-byte');
 // Library works with no Worker and no API key, through the actual editor UI.
 await page.route('**/health',route=>route.abort('failed'));
 await page.getByRole('button',{name:'Сгенерировать фон слайда · OpenAI',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Генерация недоступна.'}).waitFor();
 // A generated image must be stored, rendered and restored from IndexedDB.
 await page.unroute('**/health');
 await page.route('**/health',route=>route.fulfill({json:{token:'browser-test-only'}}));
 await page.route('**/carousel-background',route=>route.fulfill({json:{source:'openai',pngBase64:data.slides[0]}}));
 await page.getByRole('button',{name:'Сгенерировать фон слайда · OpenAI',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Фон создан OpenAI'}).waitFor();
 const generated=await page.evaluate(async()=>{
  const m=await import('/src/personaEditorialModel.ts');
  return m.loadEditorialStore(localStorage).posts.find(p=>p.id==='carousel-quiet-horror')?.slides[0].background;
 });
 assert.match(generated.generatedRef,/\/bg-/);assert.match(generated.sha256,/^[a-f0-9]{64}$/);
 await page.getByTestId('cinematic-library').click();
 // Check typography and content on a phone-sized UI as well.
 await page.setViewportSize({width:390,height:844});
 await preview.waitFor();
 assert.ok(await preview.evaluate(img=>img.getBoundingClientRect().width<=390));
 await page.getByLabel('Заголовок слайда',{exact:true}).fill(data.draft.slides[0].headline+' Ещё.');
 await page.getByRole('button',{name:'Утвердить тексты и подпись',exact:true}).waitFor();
 // Restore the author's initial draft in this isolated browser only.
 await page.evaluate(async draft=>{
  const m=await import('/src/personaEditorialModel.ts');
  const saved=m.loadEditorialStore(localStorage);saved.posts=saved.posts.map(p=>p.id===draft.id?draft:p);
  localStorage.setItem(m.EDITORIAL_KEY,JSON.stringify(saved));
 },data.draft);
 for(let i=0;i<8;i++)await writeFile(join(out,'quiet-horror-slide-'+String(i+1).padStart(2,'0')+'.png'),Buffer.from(data.slides[i],'base64'));
 await writeFile(join(out,cinematic?'contact-sheet-quiet-horror-v3.png':'contact-sheet-quiet-horror.png'),Buffer.from(data.sheet,'base64'));
 await writeFile(join(out,'carousel-quiet-horror-'+(cinematic?'cinematic-preview-':'publish-')+new Date().toISOString().slice(0,10)+'.zip'),Buffer.from(data.zip,'base64'));
 await writeFile(join(out,'draft.json'),JSON.stringify(data.draft,null,2)+'\n');
 await writeFile(join(out,'caption.txt'),data.draft.caption);
 await writeFile(join(out,'QA.json'),JSON.stringify({sha256:data.sha256,previewMatchesPng:true,gatePassedInIsolatedTest:true,
  typography:data.layouts,
  textApproved:false,designApproved:false,publicationAllowed:false,sheet:{width:1080,height:2160,thumbnailWidth:400,thumbnailHeight:500}},null,2));
 assert.deepEqual(errors,[]);
 console.log('QUIET_HORROR_PASS eight PNGs, deterministic preview, approval gate, caption, contact sheet, edit invalidation');
}finally{await browser.close();}
