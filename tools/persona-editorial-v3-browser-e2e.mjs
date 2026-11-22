#!/usr/bin/env node
/** Final review pack over existing Persona exports. No new renderer or approvals. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const out=resolve(process.env.PERSONA_EDITORIAL_V3_OUTPUT||'artifacts/persona-editorial-v3');
await mkdir(out,{recursive:true});
for(const [revision,folder]of(process.env.PERSONA_REVIEW_REUSE_EXPORTS==='1'?[]:[['v2a','v2'],['v3','v3']])){
 await new Promise((ok,no)=>{
  const child=spawn(process.execPath,['tools/persona-production-carousel-browser-e2e.mjs'],{shell:false,windowsHide:true,
   env:{...process.env,PERSONA_PRODUCTION_REVISION:revision,PERSONA_PRODUCTION_OUTPUT:join(out,folder)},stdio:'inherit'});
  const timer=setTimeout(()=>{child.kill();no(Error('Review export timed out'))},150000);
  child.once('error',e=>{clearTimeout(timer);no(e)});
  child.once('close',code=>{clearTimeout(timer);code===0?ok():no(Error('Review export failed: '+code))});
 });
}
const {chromium}=await import(process.env.PERSONA_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const deadline=setTimeout(()=>void browser.close(),120000);
try{
 const context=await browser.newContext({acceptDownloads:true});let paid=0;
 await context.route(/https:\/\/(api\.openai\.com|api\.perplexity\.ai|openrouter\.ai)\//,r=>{paid++;return r.abort()});
 const page=await context.newPage();
 await page.route('**/__v3_review_pack',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html></html>'}));
 await page.goto((process.env.PERSONA_PREVIEW_URL||'http://127.0.0.1:4173')+'/__v3_review_pack');
 const files=[];
 for(const folder of['v2','v3']){
  const source=folder==='v2'&&process.env.PERSONA_REVIEW_V2_SOURCE?resolve(process.env.PERSONA_REVIEW_V2_SOURCE):join(out,folder);
  for(const name of await readdir(source)){
  if(!/\.(png|json|txt)$/.test(name))continue;
  files.push({name:folder+'/'+name,data:(await readFile(join(source,name))).toString('base64')});
 }}
 files.push({name:'production-review.md',data:(await readFile('docs/persona-first-publication-v3.md')).toString('base64')});
 const result=await page.evaluate(async files=>{
  const media=await import('/src/personaEditorialMedia.ts');
  await document.fonts.load('400 28px "Persona Editorial Golos"','Редакция');
  const canvas=document.createElement('canvas');canvas.width=2160;canvas.height=2240;
  const c=canvas.getContext('2d');c.fillStyle='#1c1c1e';c.fillRect(0,0,2160,2240);
  c.font='400 28px "Persona Editorial Golos"';c.fillStyle='#F2E9DC';c.textAlign='center';
  for(const [i,version]of['v2','v3'].entries()){
   const image=new Image();image.src='data:image/png;base64,'+files.find(f=>f.name===version+'/contact-sheet.png').data;await image.decode();
   c.fillText(version==='v2'?'V2 · сохранённая':'V3 · для авторского просмотра',540+1080*i,42);
   c.drawImage(image,1080*i,80,1080,2160);
  }
  const comparison=new Uint8Array(await(await new Promise(ok=>canvas.toBlob(ok,'image/png'))).arrayBuffer());
  const all=files.map(f=>({name:f.name,data:Uint8Array.from(atob(f.data),c=>c.charCodeAt(0))}));
  all.push({name:'v2-v3-comparison.png',data:comparison});
  globalThis.personaV3ReviewZip=media.zipFileBytes(all);
  let text='';for(let i=0;i<comparison.length;i+=32768)text+=String.fromCharCode(...comparison.subarray(i,i+32768));
  return btoa(text);
 },files);
 await writeFile(join(out,'v2-v3-comparison.png'),Buffer.from(result,'base64'));
 const ready=page.waitForEvent('download');
 await page.evaluate(async()=>{const m=await import('/src/personaEditorialMedia.ts');m.triggerEditorialDownload(globalThis.personaV3ReviewZip,'fridge-hum-V2-V3-REVIEW.zip')});
 await(await ready).saveAs(join(out,'fridge-hum-V2-V3-REVIEW.zip'));
 assert.equal(paid,0);console.log('V3_REVIEW_PACK_PASS: existing Persona PNGs, comparison and ZIP; no approvals or paid calls');
}finally{clearTimeout(deadline);await browser.close()}
