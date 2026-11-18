#!/usr/bin/env node
/** Real Chromium acceptance of the Persona weekly calendar; no fake project navigation. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {seedCarousels} from './seed_carousels.mjs';
import {createPersonaMediaWorker} from './persona-media-worker.mjs';

const artifacts=resolve('artifacts/persona-weekly-calendar');
await mkdir(artifacts,{recursive:true});
const temp=await mkdtemp(join(tmpdir(),'persona-weekly-calendar-'));
let worker,browser;
try{
 const seeded=await seedCarousels(join(temp,'quick'));
 assert.equal(seeded.created,10);
 worker=createPersonaMediaWorker({port:47832,outputRoot:join(temp,'media'),quickRenderRoot:join(temp,'quick')});
 const port=await worker.start();assert.equal(port,47832);
 const origin=process.env.PERSONA_PREVIEW_URL||'http://127.0.0.1:4173';
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/#persona/seed10',{waitUntil:'domcontentloaded'});
 await page.locator('.personaProjectList').waitFor({timeout:28000});
 assert.equal(await page.locator('[data-testid="persona-creative-card"]').count(),10);
 await page.evaluate(()=>{
  const now=new Date();now.setHours(12,0,0,0);
  now.setDate(now.getDate()-((now.getDay()+6)%7));
  const pad=n=>String(n).padStart(2,'0');
  const monday=[now.getFullYear(),pad(now.getMonth()+1),pad(now.getDate())].join('-');
  localStorage.setItem('lifeos:persona:unified-weekly-calendar:v1',monday);
 });
 await page.goto(origin+'/#persona',{waitUntil:'domcontentloaded'});
 const calendar=page.getByTestId('persona-weekly-calendar');
 await calendar.waitFor({timeout:25000});
 await calendar.locator('[data-calendar-item-id="PHOTO-001"]').waitFor({timeout:25000});
 assert.equal(await calendar.locator('[data-calendar-item-id]').count(),3);
 assert.equal(await calendar.locator('[data-calendar-day]').count(),7);
 assert.match(await calendar.textContent(),/Календарь на неделю/);
 const monday=calendar.locator('[data-calendar-item-id="reel-01"]');
 const photo=calendar.locator('[data-calendar-item-id="PHOTO-001"]');
 const friday=calendar.locator('[data-calendar-item-id="reel-02"]');
 assert.match(await monday.textContent(),/Видео/);
 assert.match(await monday.textContent(),/Ждёт видео/);
 assert.match(await photo.textContent(),/Фото/);
 assert.match(await photo.textContent(),/Ждёт фото/);
 assert.match(await friday.textContent(),/Видео/);
 await page.screenshot({path:join(artifacts,'calendar-week-desktop.png'),fullPage:true,animations:'disabled'});
 // The photo action must open the EXISTING seeded card, not an invented React project.
 await photo.getByRole('button',{name:/Начать работу/}).click();
 const photoCard=page.locator('[data-quick-status="waiting_for_footage"][data-focused-project="true"]');
 await photoCard.waitFor({timeout:20000});
 assert.match(await photoCard.textContent(),/PHOTO-001/);
 assert.equal(await photoCard.locator('input[type="file"]').count(),1);
 assert.equal(await photoCard.evaluate(el=>document.activeElement===el),true);
 await page.screenshot({path:join(artifacts,'calendar-opens-existing-photo.png'),fullPage:true,animations:'disabled'});
 // Navigate to the real existing video workspace and check route, not just a click callback.
 await monday.getByRole('button',{name:/Начать работу/}).click();
 await page.waitForURL('**/#persona/project/reel-01',{timeout:18000});
 assert.match(await page.locator('.personaProjectHead h2').textContent(),/./);
 assert.equal(await page.locator('.personaCreativeWorkspace').count(),1);
 await page.goto(origin+'/#persona',{waitUntil:'domcontentloaded'});
 const next=page.getByTestId('persona-weekly-calendar');
 await next.getByRole('button',{name:'Следующая неделя'}).click();
 await next.locator('[data-calendar-item-id="PHOTO-002"]').waitFor();
 assert.equal(await next.locator('[data-calendar-item-id]').count(),3);
 assert.equal(await next.locator('[data-calendar-item-id="PHOTO-001"]').count(),0);
 await next.getByRole('button',{name:'Сегодня',exact:true}).click();
 await next.locator('[data-calendar-item-id="PHOTO-001"]').waitFor();
 // Responsive check shares the same storage; no additional Project creation.
 const mobile=await context.newPage();
 await mobile.setViewportSize({width:390,height:844});
 await mobile.goto(origin+'/#persona',{waitUntil:'domcontentloaded'});
 const mobileCalendar=mobile.getByTestId('persona-weekly-calendar');
 await mobileCalendar.locator('[data-calendar-item-id="PHOTO-001"]').waitFor({timeout:20000});
 assert.equal(await mobileCalendar.locator('[data-calendar-day]').count(),7);
 await mobile.screenshot({path:join(artifacts,'calendar-week-mobile.png'),fullPage:true,animations:'disabled'});
 assert.deepEqual(errors,[]);
 console.log('PERSONA_WEEKLY_CALENDAR_BROWSER_PASS '+JSON.stringify({
  videosImported:10,photosFromWorker:10,weekSlots:3,days:7,
  openedVideo:'reel-01',openedPhoto:'PHOTO-001',weekNavigation:true,mobile:true
 }));
}finally{
 if(browser)await browser.close();
 if(worker?.server?.listening)await new Promise(ok=>worker.server.close(ok));
 await rm(temp,{recursive:true,force:true});
}
