#!/usr/bin/env node
/** PREVIEW-ONLY baseline artifact. Text consent is NOT approval of visual design. */
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const argv=process.argv.slice(2);
const arg=(key,fallback)=>{const i=argv.indexOf(key);return i===-1?fallback:argv[i+1]};
const out=resolve(arg('--output-dir','dist/baseline-review-v2'));
const origin=arg('--origin',process.env.PERSONA_PREVIEW_URL||'http://127.0.0.1:4173');
const day=new Date().toISOString().slice(0,10);
const zipname='carousel-baseline-pause-publish-'+day+'.zip';
const previewNames=Array.from({length:6},(_,i)=>'baseline-pause-slide-'+String(i+1).padStart(2,'0')+'.png');
const pngSig='89504e470d0a1a0a';
function unzip(buffer){
 const files=[];let offset=0;
 while(offset+30<=buffer.length&&buffer.readUInt32LE(offset)===0x04034b50){
  const len=buffer.readUInt16LE(offset+26),extra=buffer.readUInt16LE(offset+28),
   method=buffer.readUInt16LE(offset+8),size=buffer.readUInt32LE(offset+18);
  const start=offset+30+len+extra;
  if(method!==0||start+size>buffer.length)throw Error('Corrupted or compressed ZIP');
  files.push({name:buffer.subarray(offset+30,offset+30+len).toString('utf8'),
   bytes:buffer.subarray(start,start+size)});
  offset=start+size;
 }
 return files;
}
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({acceptDownloads:true});
 try{
  const page=await context.newPage();
  await page.goto(origin+'/#persona',{waitUntil:'domcontentloaded',timeout:45000});
  const metadata=await page.evaluate(async()=>{
   const model=await import('/src/personaEditorialModel.ts');
   const media=await import('/src/personaEditorialMedia.ts');
   const post=model.applyChatCarouselApproval(model.createBaselinePauseCarousel());
   if(post.approvals.textApproved!==true||post.approvals.content!==true||
      post.approvals.designApproved!==false||post.approvals.design!==false)
    throw Error('Baseline must have author-approved text and UNAPPROVED visual design');
   if(post.slides.length!==6||post.fontPreset!=='playfair-inter')
    throw Error('Wrong canonical baseline art configuration');
   const pixelBlobs=[];
   for(let i=0;i<6;i++)pixelBlobs.push(await media.renderEditorialSlide(post,post.slides[i],i));
   // One contact sheet (1080x1620) must fit 6 FULL aspect-correct 4:5 thumbnails.
   // User-requested 500x625 cannot fit in three 625px rows (1875 >1620),
   // so preserve sheet geometry instead of cropping or dropping slides.
   const contact=document.createElement('canvas');contact.width=1080;contact.height=1620;
   const ctx=contact.getContext('2d');if(!ctx)throw Error('No Canvas for contact sheet');
   ctx.fillStyle='#1C1C1E';ctx.fillRect(0,0,1080,1620);
   const w=360,h=450,gapX=20,gapY=10,x0=170,y0=77,row=482;
   const loaded=await document.fonts.load('400 24px "Inter"','01');
   if(!loaded.length)throw Error('Inter is not loaded for contact sheet');
   for(let i=0;i<6;i++){
    const bmp=await createImageBitmap(pixelBlobs[i]);
    if(bmp.width!==1080||bmp.height!==1350)throw Error('Unexpected slide dimensions');
    const x=x0+(i%2)*(w+gapX),y=y0+Math.floor(i/2)*(row+gapY);
    ctx.drawImage(bmp,x,y,w,h);bmp.close();
    ctx.fillStyle='#F2E9DC';ctx.font='400 24px "Inter", sans-serif';
    ctx.textAlign='left';ctx.fillText(String(i+1).padStart(2,'0'),x,y+h+27);
   }
   const contactBlob=await new Promise((resolve,reject)=>contact.toBlob(x=>x?resolve(x):reject(Error('Contact PNG failed')),'image/png'));
   // This ZIP is REVIEW-ONLY, not an approved publication bundle.
   const encode=t=>new TextEncoder().encode(t);
   const id=post.id;
   const checklist={
    kind:'persona-carousel-visual-review-v2',carouselId:id,status:'design-review-required',
    textApproved:true,designApproved:false,published:false,slideCount:6,
    checkedBy:post.approvals.checkedBy,checkedAt:post.approvals.checkedAt,
    contentHashAtApproval:post.approvals.contentHashAtApproval,
    checks:model.editorialChecklistState(post).map((pass,index)=>({item:index+1,pass})),
    note:'All seven text-scope checks do NOT establish author approval of visual design.'
   };
   const entries=[];
   for(let i=0;i<6;i++)entries.push({name:id+'/slide-'+String(i+1).padStart(2,'0')+'.png',
    data:new Uint8Array(await pixelBlobs[i].arrayBuffer())});
   entries.push({name:id+'/caption.txt',data:encode(post.caption)});
   entries.push({name:id+'/publish-instructions.txt',data:encode(
    'ВЕРСИЯ ТОЛЬКО ДЛЯ ПРОСМОТРА: оформление ещё не утверждено автором. '+
    'Проверьте шесть PNG, выберите один из трёх вариантов caption и подтвердите дизайн. '+
    'До этого не публикуйте эту карусель в Instagram.\n')});
   entries.push({name:id+'/checklist.json',data:encode(JSON.stringify(checklist,null,2)+'\n')});
   window.__baselineReviewZip=media.zipFileBytes(entries);
   window.__baselineReviewContact=contactBlob;
   return {id,title:post.title,textApproved:true,designApproved:false,
    caption:post.caption,hash:post.approvals.contentHashAtApproval,
    contact:[1080,1620],slide:[1080,1350],contactCard:[w,h],previewCount:6};
  });
  async function capture(filename,globalKey){
   const pending=page.waitForEvent('download',{timeout:120000});
   await page.evaluate(({filename,globalKey})=>{
    const blob=window[globalKey];
    if(!(blob instanceof Blob))throw Error('Missing generated '+globalKey);
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=filename;document.body.appendChild(link);
    link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
   },{filename,globalKey});
   const download=await pending;
   if(download.suggestedFilename()!==filename)throw Error('Wrong asset name');
   await download.saveAs(join(out,filename));
  }
  await capture(zipname,'__baselineReviewZip');
  await capture('contact-sheet-baseline-pause.png','__baselineReviewContact');
  const files=unzip(await readFile(join(out,zipname)));
  if(files.length!==9)throw Error('Review ZIP must contain 9 entries');
  for(let i=0;i<6;i++){
   const name=metadata.id+'/slide-'+String(i+1).padStart(2,'0')+'.png';
   if(files[i].name!==name)throw Error('Unexpected slide '+files[i].name);
   const b=files[i].bytes;
   if(b.length<2000||b.subarray(0,8).toString('hex')!==pngSig||
      b.readUInt32BE(16)!==1080||b.readUInt32BE(20)!==1350)
    throw Error('Missing rendered 1080x1350 slide '+name);
   await writeFile(join(out,previewNames[i]),b); // Exactly the ZIP bytes.
  }
  if(files[6].name!==metadata.id+'/caption.txt'||files[7].name!==metadata.id+'/publish-instructions.txt'||
   files[8].name!==metadata.id+'/checklist.json')throw Error('Missing review metadata');
  const checklist=JSON.parse(files[8].bytes.toString('utf8'));
  if(checklist.designApproved!==false||checklist.status!=='design-review-required')
   throw Error('Review files must never state the design is approved');
  await writeFile(join(out,'review-metadata.json'),
   JSON.stringify({...metadata,files:[zipname,'contact-sheet-baseline-pause.png',...previewNames]},null,2)+'\n');
  console.log('PERSONA_BASELINE_REVIEW_V2_PASS '+JSON.stringify({
   files:8,zip:zipname,pngs:6,contact:metadata.contact,slide:metadata.slide,
   grid:'2x3',reviewOnly:true,output:out}));
 }finally{await context.close()}
}finally{await browser.close()}
