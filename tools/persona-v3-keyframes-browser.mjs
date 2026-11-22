/** Pre-production gate: render only the three key screens before full V3 export. */
import {mkdir,writeFile} from 'node:fs/promises';import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PERSONA_PLAYWRIGHT_MODULE||'playwright');
const out=resolve(process.env.PERSONA_V3_OUTPUT||'artifacts/persona-v3-keyframes');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});let paid=0;
 await context.route(/https:\/\/(api\.openai\.com|api\.perplexity\.ai|openrouter\.ai)\//,r=>{paid++;return r.abort()});
 const page=await context.newPage();
 await page.goto((process.env.PERSONA_PREVIEW_URL||'http://127.0.0.1:4173')+'/?local=1#persona');
 await page.getByTestId('open-carousel-fridge-hum-v3').click({timeout:10000});
 const editor=page.getByTestId('persona-editorial-studio');await editor.getByTestId('editorial-post-workflow').waitFor();
 for(const [index,name]of[[0,'key-cover.png'],[2,'key-fact.png'],[6,'key-finale.png']]){
  const ready=page.waitForEvent('download');
  await page.evaluate(async({index,name})=>{
   const m=await import('/src/personaEditorialMedia.ts'),model=await import('/src/personaEditorialModel.ts');
   const p=model.loadEditorialStore(localStorage).posts.find(p=>p.id==='carousel-fridge-hum-v3');
   if(!p)throw Error('V3 draft not saved');
   const png=await m.renderEditorialSlide(p,p.slides[index],index);m.triggerEditorialDownload(png,name);
  },{index,name});
  await(await ready).saveAs(join(out,name));
 }
 await page.screenshot({path:join(out,'mobile-v3-key-cover.png'),fullPage:true});
 assert.equal(paid,0);console.log('V3_KEY_SCREENS_PASS: cover, fact and finale only; author approval pending');
}finally{await browser.close()}
