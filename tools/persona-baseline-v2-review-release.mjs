#!/usr/bin/env node
// Review-only: no author design approval or publication is asserted.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const out='dist/carousels-v2-baseline';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:4173/#persona',{waitUntil:'domcontentloaded'});
 const payload=await page.evaluate(async()=>{
  const m=await import('/src/personaEditorialModel.ts');
  const media=await import('/src/personaEditorialMedia.ts');
  const p=m.createBaselinePauseCarousel();
  if(p.approvals.design||p.approvals.designApproved||p.fontPreset!=='playfair-inter')
   throw Error('Expected unapproved baseline v2');
  const images=await Promise.all(p.slides.map((s,i)=>media.renderEditorialSlide(p,s,i)));
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1620;
  const c=canvas.getContext('2d');if(!c)throw Error('Canvas unavailable');
  c.fillStyle='#1C1C1E';c.fillRect(0,0,1080,1620);
  await document.fonts.load('400 24px "Inter"','01');
  for(let i=0;i<6;i++){
   const image=await createImageBitmap(images[i]);
   const x=140+(i%2)*410,y=20+Math.floor(i/2)*530;
   c.drawImage(image,x,y,390,488);image.close();
   c.fillStyle='#F2E9DC';c.textAlign='center';c.font='400 24px "Inter"';
   c.fillText(String(i+1).padStart(2,'0'),x+195,y+518);
  }
  const sheet=await new Promise((ok,no)=>canvas.toBlob(b=>b?ok(b):no(Error('Contact sheet failed')),'image/png'));
  const encoder=new TextEncoder(),files=[];
  for(let i=0;i<6;i++)files.push({name:'carousel-baseline-pause/slide-'+String(i+1).padStart(2,'0')+'.png',data:new Uint8Array(await images[i].arrayBuffer())});
  files.push({name:'carousel-baseline-pause/caption.txt',data:encoder.encode(p.caption)});
  files.push({name:'carousel-baseline-pause/publish-instructions.txt',data:encoder.encode('ПРЕДПРОСМОТР: оформление не утверждено. Публикация запрещена до авторской приёмки.')});
  files.push({name:'carousel-baseline-pause/checklist.json',data:encoder.encode(JSON.stringify({textApproved:true,designApproved:false,published:false,status:'review-required'}))});
  const zip=await media.zipFileBytes(files);
  const b64=blob=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]);r.onerror=no;r.readAsDataURL(blob)});
  return {slides:await Promise.all(images.map(b64)),sheet:await b64(sheet),zip:await b64(zip),date:new Date().toISOString().slice(0,10)};
 });
 for(let i=0;i<6;i++)await writeFile(join(out,'baseline-pause-slide-'+String(i+1).padStart(2,'0')+'.png'),Buffer.from(payload.slides[i],'base64'));
 await writeFile(join(out,'contact-sheet-baseline-pause.png'),Buffer.from(payload.sheet,'base64'));
 await writeFile(join(out,'carousel-baseline-pause-publish-'+payload.date+'.zip'),Buffer.from(payload.zip,'base64'));
 console.log('BASELINE_V2_REVIEW_PASS: six 1080x1350 PNGs, 1080x1620 contact sheet, unapproved ZIP');
}finally{await browser.close()}
