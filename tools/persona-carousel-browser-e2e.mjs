#!/usr/bin/env node
/** Ten waiting carousels in a real React dashboard using local Worker API. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {seedCarousels,carouselPlan} from './seed_carousels.mjs';
import {createPersonaMediaWorker} from './persona-media-worker.mjs';

const root=await mkdtemp(join(tmpdir(),'persona-carousel-visual-'));
const captures=resolve('artifacts/persona-carousel-seed');
await mkdir(captures,{recursive:true});
let worker,browser;
try{
 const seeded=await seedCarousels(join(root,'quick'));
 assert.equal(seeded.created,10);
 worker=createPersonaMediaWorker({port:47832,outputRoot:join(root,'media'),quickRenderRoot:join(root,'quick')});
 assert.equal(await worker.start(),47832);
 browser=await chromium.launch({headless:true});
 const origin=process.env.PERSONA_PREVIEW_URL||'http://127.0.0.1:4173';
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/#persona',{waitUntil:'domcontentloaded'});
 const block=page.getByTestId('persona-quick-auto-render');
 await block.waitFor({timeout:25000});
 const cards=block.locator('article[data-quick-status="waiting_for_footage"]');
 await cards.first().waitFor({timeout:25000});
 assert.equal(await cards.count(),10,'all ten seed records render as waiting cards');
 for(let i=0;i<10;i++){
  const card=cards.nth(i);
  assert.ok((await card.textContent()).includes('PHOTO-'+String(i+1).padStart(3,'0')));
  assert.match(await card.textContent(),/ожидает фотографии/i);
  assert.equal(await card.locator('input[type=file]').count(),1);
  assert.ok((await card.locator('h4').textContent()).includes(carouselPlan.projects[i].title));
 }
 await page.screenshot({path:join(captures,'ten-waiting-cards-desktop.png'),
  fullPage:true,animations:'disabled'});
 await cards.first().locator('details').evaluate(el=>el.open=true);
 assert.match(await cards.first().textContent(),/Он ещё верит/);
 await page.screenshot({path:join(captures,'slide-brief-open.png'),
  fullPage:true,animations:'disabled'});
 const phone=await browser.newPage({viewport:{width:390,height:844}});
 await phone.goto(origin+'/#persona',{waitUntil:'domcontentloaded'});
 const mobile=phone.getByTestId('persona-quick-auto-render');
 await mobile.locator('article[data-quick-status="waiting_for_footage"]').first().waitFor({timeout:25000});
 assert.equal(await mobile.locator('article[data-quick-status="waiting_for_footage"]').count(),10);
 await phone.screenshot({path:join(captures,'ten-waiting-cards-mobile.png'),
  fullPage:true,animations:'disabled'});
 assert.deepEqual(errors,[]);
 console.log('CAROUSEL_SEEDED_BROWSER_PASS '+JSON.stringify({projects:10,slides:40,
  waitingForFootage:10,desktop:1440,mobile:390,uploadInputEach:true}));
}finally{
 if(browser)await browser.close();
 if(worker?.server?.listening)await new Promise(ok=>worker.server.close(ok));
 await rm(root,{recursive:true,force:true});
}
