#!/usr/bin/env node
/**
 * Build 5 carousel ZIPs from the EXISTING browser-only Editorial Desk code.
 * Browser Canvas, current fixture factories and publication ZIP builders are reused verbatim.
 *
 * Production NEVER invents author approvals: --approved-json is a previously
 * reviewed, fully approved EditorialPost snapshot; missing/stale approval aborts.
 * --self-test creates synthetic *test-only* approvals; its outputs MUST NOT ship.
 *
 * Start Vite on 127.0.0.1:4173 before running (GitHub Actions does this).
 */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';

const argv=process.argv.slice(2);
function option(name,defaultValue=''){
 const i=argv.indexOf(name);
 return i<0?defaultValue:(argv[i+1]??'');
}
const testMode=argv.includes('--self-test');
const inputPath=option('--approved-json');
const outputPath=resolve(option('--output-dir',testMode?
 'artifacts/persona-publish-self-test':'dist/publish-packages'));
const origin=option('--origin',process.env.PERSONA_PREVIEW_URL||'http://127.0.0.1:4173');
const ids=[
 'carousel-baseline-pause','carousel-why-director-leaves-question',
 'carousel-photo-archive','carousel-mixed-narrative'
];
const fail=message=>{throw Error('[Persona publication release] '+message)};
if(!testMode&&!inputPath)fail(
 'Нет подтверждённого снимка утверждений. Для реального Release нужен --approved-json с четырьмя действующими авторскими approvals; фикстуры в main — черновики.');
if(testMode&&inputPath)fail('Self-test cannot read a real approval snapshot');
const approvedData=testMode?null:JSON.parse(await readFile(resolve(inputPath),'utf8'));
if(!testMode&&!(Array.isArray(approvedData?.posts)&&approvedData.posts.length===4))
 fail('Approved snapshot must contain exactly four EditorialPost records in posts[]');
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({acceptDownloads:true});
 try{
  const page=await context.newPage();
  await page.goto(origin+'/#persona',{waitUntil:'domcontentloaded',timeout:45000});
  const validated=await page.evaluate(async ({testMode,approvedData,ids})=>{
   const model=await import('/src/personaEditorialModel.ts');
   const pub=await import('/src/personaEditorialPublish.ts');
   const drafts=pub.PUBLICATION_CAROUSEL_IDS.map(id=>pub.publicationCarouselDraft(id));
   if(JSON.stringify(pub.PUBLICATION_CAROUSEL_IDS)!==JSON.stringify(ids))
    throw Error('IDs differ from existing publication module');
   let posts;
   if(testMode){
    // Test only. These are not author approvals, and their ZIPs never reach Release.
    posts=drafts.map(draft=>{
     let p=model.approveEditorialStep(draft,'topic','2026-11-20T10:00:00.000Z');
     p=model.approveEditorialStep(p,'content','2026-11-20T10:01:00.000Z');
     for(let i=0;i<(p.carouselFormat?5:6);i++)
      p=model.setEditorialChecklistItem(p,i,true,'2026-11-20T10:02:00.000Z');
     return model.approveEditorialStep(p,'design','2026-11-20T10:03:00.000Z');
    });
   }else{
    posts=ids.map(id=>approvedData.posts.find(p=>p.id===id));
    if(posts.some(p=>!p))throw Error('Missing carousel in approved snapshot');
   }
   for(let i=0;i<posts.length;i++){
    const post=posts[i],draft=drafts[i];
    if(post.id!==draft.id||post.title!==draft.title||
       model.editorialContentHash(post)!==model.editorialContentHash(draft))
     throw Error('Approved content differs from the four canonical fixture drafts: '+post.id);
    if(post.slides.some(s=>s.visual!=='background'||s.photoRef))
     throw Error('GitHub runner has no author IndexedDB: only explicit text-only fallback can be released');
    if(!pub.publicationCarouselApproved(post))
     throw Error('Unapproved/stale carousel: '+post.id);
   }
   return {posts,meta:posts.map(p=>({id:p.id,title:p.title,checkedAt:p.approvals.checkedAt,
    checkedBy:p.approvals.checkedBy,textFallback:pub.publicationIsTextFallback(p)}))};
  },{testMode,approvedData,ids});
  // Never begin downloading until ALL four posts pass approval and provenance.
  await mkdir(outputPath,{recursive:true});
  const date=new Date();
  const yyyy=date.getUTCFullYear(),mm=String(date.getUTCMonth()+1).padStart(2,'0'),
   dd=String(date.getUTCDate()).padStart(2,'0');
  const day=String(yyyy)+'-'+mm+'-'+dd;
  const zipFiles=[];
  for(const post of validated.posts){
   const filename=post.id+'-publish-'+day+'.zip';
   const pending=page.waitForEvent('download',{timeout:120000});
   await page.evaluate(async({post,filename})=>{
    const pub=await import('/src/personaEditorialPublish.ts');
    const media=await import('/src/personaEditorialMedia.ts');
    const zip=await pub.buildSinglePublicationZip(post);
    media.triggerEditorialDownload(zip,filename);
   },{post,filename});
   const download=await pending;
   if(download.suggestedFilename()!==filename)fail('Unexpected download name');
   await download.saveAs(join(outputPath,filename));zipFiles.push(filename);
  }
  const bundleName='persona-carousels-publish-'+day+'.zip';
  const pending=page.waitForEvent('download',{timeout:180000});
  await page.evaluate(async({posts,bundleName})=>{
   const pub=await import('/src/personaEditorialPublish.ts');
   const media=await import('/src/personaEditorialMedia.ts');
   const zip=await pub.buildAllPublicationZip(posts);
   media.triggerEditorialDownload(zip,bundleName);
  },{posts:validated.posts,bundleName});
  const bundle=await pending;
  if(bundle.suggestedFilename()!==bundleName)fail('Unexpected combined download name');
  await bundle.saveAs(join(outputPath,bundleName));zipFiles.push(bundleName);
  await writeFile(join(outputPath,'release-metadata.json'),
   JSON.stringify({kind:'persona-github-carousel-release-v1',testOnly:testMode,
    date:day,files:zipFiles,carousels:validated.meta},null,2)+'\n');
  console.log('PERSONA_FIVE_PUBLISH_ZIPS_CREATED '+JSON.stringify({
   count:zipFiles.length,files:zipFiles,outputPath,testOnly:testMode,
   metadata:validated.meta
  }));
 }finally{await context.close()}
}finally{await browser.close()}
