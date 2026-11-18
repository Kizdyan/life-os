#!/usr/bin/env node
/** Real Chromium proof: 10 imported videos, 10 existing carousel Worker jobs,
 * editorial approvals, mixed slide PNG/ZIP export, a Friday photo and optional stories.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {seedCarousels} from './seed_carousels.mjs';
import {createPersonaMediaWorker} from './persona-media-worker.mjs';

const artifacts=resolve('artifacts/persona-weekly-calendar');
await mkdir(artifacts,{recursive:true});
const temp=await mkdtemp(join(tmpdir(),'persona-weekly-calendar-'));
let worker,browser;
function contents(buf){
 const entries=[];let offset=0;
 while(offset+30<buf.length&&buf.readUInt32LE(offset)===0x04034b50){
  const n=buf.readUInt16LE(offset+26),extra=buf.readUInt16LE(offset+28);
  const len=buf.readUInt32LE(offset+18),start=offset+30+n+extra;
  entries.push({name:buf.subarray(offset+30,offset+30+n).toString('utf8'),
   bytes:buf.subarray(start,start+len)});
  offset=start+len;
 }
 return entries;
}
try{
 const seeded=await seedCarousels(join(temp,'quick'));
 assert.equal(seeded.created,10);
 worker=createPersonaMediaWorker({port:47832,outputRoot:join(temp,'media'),quickRenderRoot:join(temp,'quick')});
 assert.equal(await worker.start(),47832);
 const origin=process.env.PERSONA_PREVIEW_URL||'http://127.0.0.1:4173';
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/#persona/seed10',{waitUntil:'domcontentloaded'});
 await page.locator('.personaProjectList').waitFor({timeout:28000});
 assert.equal(await page.locator('[data-testid="persona-creative-card"]').count(),10);
 await page.evaluate(()=>{
  const now=new Date();now.setHours(12,0,0,0);
  now.setDate(now.getDate()-((now.getDay()+6)%7));
  const pad=n=>String(n).padStart(2,'0');
  localStorage.setItem('lifeos:persona:unified-weekly-calendar:v1',
   [now.getFullYear(),pad(now.getMonth()+1),pad(now.getDate())].join('-'));
 });
 await page.goto(origin+'/#persona',{waitUntil:'domcontentloaded'});
 const calendar=page.getByTestId('persona-weekly-calendar');
 await calendar.waitFor({timeout:25000});
 await calendar.locator('[data-calendar-item-id="PHOTO-001"]').waitFor({timeout:25000});
 assert.equal(await calendar.locator('[data-calendar-item-id]').count(),3);
 assert.equal(await calendar.locator('[data-calendar-day]').count(),7);
 const reel=calendar.locator('[data-calendar-item-id="reel-01"]');
 const carousel=calendar.locator('[data-calendar-item-id="PHOTO-001"]');
 const friday=calendar.locator('[data-calendar-item-id="photo-week-01"]');
 assert.match(await reel.textContent(),/Видео/);
 assert.match(await carousel.textContent(),/Карусель/);
 assert.match(await friday.textContent(),/Фото-пост/);
 assert.match(await friday.textContent(),/Тема не выбрана/);
 await page.screenshot({path:join(artifacts,'editorial-calendar-desktop.png'),fullPage:true,animations:'disabled'});
 // Stories are an optional, independently saved manual layer.
 await calendar.getByRole('textbox',{name:'Идея Stories'}).fill('Короткий рабочий кадр из реального архива');
 await calendar.getByRole('button',{name:'Добавить',exact:true}).click();
 await calendar.getByRole('combobox',{name:/Статус истории/}).selectOption('captured');
 assert.match(await calendar.textContent(),/Короткий рабочий кадр/);
 // Work on PHOTO-001's editorial companion: no duplicate Worker ProductionJob.
 await carousel.getByRole('button',{name:/Начать работу/}).click();
 const editor=page.getByTestId('persona-editorial-studio');
 await editor.locator('[data-testid="editorial-post-workflow"]').waitFor({timeout:15000});
 assert.match(await editor.textContent(),/PHOTO-001/);
 assert.match(await editor.textContent(),/Четыре секунды до выбора/);
 await editor.getByRole('button',{name:'Утвердить тему'}).click();
 assert.match(await editor.textContent(),/Он ещё верит/);
 await editor.getByRole('button',{name:'Утвердить тексты и подпись'}).click();
 const style=editor.locator('[aria-label="Шаг 3. Оформление"]');
 await style.getByRole('button',{name:'Тёмный шоколад'}).click();
 // Mix: text-only backgrounds plus an actual image from the local archive.
 await style.getByRole('button',{name:/2 · Фон/}).click();
 await style.getByLabel('Фото из архива + текст').check();
 const image=join(temp,'actual-photo.png');
 const imageCommand=spawnSync('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i',
  'testsrc2=size=480x600:rate=1','-frames:v','1','-y',image],{timeout:20000,encoding:'utf8'});
 assert.equal(imageCommand.status,0,imageCommand.stderr);
 await style.locator('input[type=file]').setInputFiles(image);
 await style.getByText('Локально сохранено:').waitFor({timeout:15000});
 const carouselChecklist=editor.getByTestId('carousel-acceptance-checklist');
 for(let i=1;i<=6;i++)await carouselChecklist.getByRole('checkbox',{name:'Пункт '+i}).check();
 await style.getByRole('button',{name:'Утвердить оформление'}).click();
 // Intercept the ACTUAL Canvas exporter, not only its source code: every
 // public text drawing call must be an authored slide title, never a watermark.
 await page.evaluate(()=>{
  const root=window;
  root.__personaPublicCanvasText=[];
  const proto=CanvasRenderingContext2D.prototype;
  const original=proto.fillText;
  proto.fillText=function(value,...args){
   root.__personaPublicCanvasText.push(String(value));
   return original.call(this,value,...args);
  };
 });
 const expectedCarouselCaption=(await editor.locator('.personaEditorialCaption').inputValue()).trim();
 const downloadPromise=page.waitForEvent('download',{timeout:45000});
 await editor.getByRole('button',{name:'Скачать ZIP с PNG и подписью'}).click();
 const download=await downloadPromise;
 await download.saveAs(join(artifacts,'approved-mixed-carousel.zip'));
 const zip=await readFile(join(artifacts,'approved-mixed-carousel.zip'));
 const files=contents(zip);
 assert.deepEqual(files.map(f=>f.name),[
  'slide-01.png','slide-02.png','slide-03.png','slide-04.png','caption.txt']);
 assert.ok(files.slice(0,4).every(f=>f.bytes.subarray(0,4).equals(Buffer.from([137,80,78,71]))));
 assert.equal(files[4].bytes.toString('utf8'),expectedCarouselCaption);
 assert.doesNotMatch(files[4].bytes.toString('utf8'),/ТЕМА:|Проверено автором|Публикация не выполнялась|PERSONA/i);
 const drawn=await page.evaluate(()=>window.__personaPublicCanvasText);
 // Canvas wraps an authored sentence over multiple lines; compare full
 // visible text in reading order rather than the number of draw calls.
 assert.equal(drawn.join(' '),
  ['Он ещё верит','Теперь он сомневается','Улыбка ничего не объясняет','Решение уже принято'].join(' '));
 assert.ok(drawn.every(x=>!/(PERSONA|EDITORIAL|АВТОРСКИЙ МАТЕРИАЛ)/i.test(x)));
 // After reload the companion approval and photo stored in IndexedDB survive.
 await page.reload({waitUntil:'domcontentloaded'});
 // A hard reload creates a NEW JS document. Reattach the Canvas observer
 // before testing the independent portrait export in that document.
 await page.evaluate(()=>{
  window.__personaPublicCanvasText=[];
  const proto=CanvasRenderingContext2D.prototype;
  const original=proto.fillText;
  proto.fillText=function(value,...args){
   window.__personaPublicCanvasText.push(String(value));
   return original.call(this,value,...args);
  };
 });
 await page.getByTestId('persona-weekly-calendar')
  .locator('[data-calendar-item-id="PHOTO-001"]').waitFor({timeout:18000});
 assert.match(await page.getByTestId('persona-weekly-calendar')
  .locator('[data-calendar-item-id="PHOTO-001"]').textContent(),/Готов к производству/);
 const editorAfter=page.getByTestId('persona-editorial-studio');
 assert.equal(await editorAfter.locator('[data-testid="editorial-post-workflow"]').count(),0);
 await page.getByTestId('persona-weekly-calendar').locator('[data-calendar-item-id="PHOTO-001"]')
  .getByRole('button',{name:/Начать работу/}).click();
 await editorAfter.getByRole('button',{name:'Скачать ZIP с PNG и подписью'}).waitFor();
 // Photo slot must open the TOPIC chooser; it is not a fabricated completed post.
 await page.getByTestId('persona-weekly-calendar').locator('[data-calendar-item-id="photo-week-01"]')
  .getByRole('button',{name:'Выбрать тему'}).click();
 await editorAfter.locator('[data-testid="editorial-topic-chooser"]').waitFor();
 await editorAfter.getByRole('button',{name:'Фото-посты'}).click();
 await editorAfter.locator('.personaEditorialSuggestions article').first()
  .getByRole('button',{name:/Выбрать тему/}).click();
 await editorAfter.getByRole('button',{name:'Утвердить тему'}).click();
 await editorAfter.getByRole('textbox',{name:/Короткий титр на фото/}).fill('');
 await editorAfter.getByRole('button',{name:'Утвердить тексты и подпись'}).click();
 assert.match(await page.getByTestId('persona-weekly-calendar')
  .locator('[data-calendar-item-id="photo-week-01"]').textContent(),/Оформление на утверждении/);
 const photoDesign=editorAfter.locator('[aria-label="Шаг 3. Оформление"]');
 await photoDesign.locator('input[type=file]').setInputFiles(image);
 await photoDesign.getByText('Локально сохранено:').waitFor({timeout:15000});
 await photoDesign.getByRole('button',{name:'Утвердить оформление'}).click();
 const photoCaption=(await editorAfter.locator('.personaEditorialCaption').inputValue()).trim();
 const textCountBefore=await page.evaluate(()=>window.__personaPublicCanvasText.length);
 const photoDownload=page.waitForEvent('download',{timeout:45000});
 await editorAfter.getByRole('button',{name:'Скачать ZIP с PNG и подписью'}).click();
 const oneImageDownload=await photoDownload;
 await oneImageDownload.saveAs(join(artifacts,'approved-single-photo.zip'));
 const photoZip=contents(await readFile(join(artifacts,'approved-single-photo.zip')));
 assert.deepEqual(photoZip.map(x=>x.name),['slide-01.png','caption.txt']);
 assert.ok(photoZip[0].bytes.subarray(0,4).equals(Buffer.from([137,80,78,71])));
 assert.equal(photoZip[1].bytes.toString('utf8'),photoCaption);
 assert.deepEqual(await page.evaluate(n=>window.__personaPublicCanvasText.slice(n),textCountBefore),[],
  'An archive-only portrait must have ZERO burned text');
 // Complete backup of actual browser state, including BOTH IndexedDB photos.
 const backupSection=page.getByRole('region',{name:'Резервная копия Persona'});
 await page.getByText('Сохранность контента · резервная копия').click();
 await backupSection.waitFor();
 const backupDownload=page.waitForEvent('download',{timeout:60000});
 await backupSection.getByRole('button',{name:'Сохранить полный архив ZIP'}).click();
 const backup=await backupDownload;
 const archivePath=join(artifacts,'persona-full-backup.zip');
 await backup.saveAs(archivePath);
 const backupZip=contents(await readFile(archivePath));
 assert.equal(backupZip.length,3);
 assert.equal(backupZip[0].name,'persona-backup.json');
 const manifest=JSON.parse(backupZip[0].bytes.toString('utf8'));
 assert.equal(manifest.kind,'life-os-persona-full-backup');
 assert.ok(manifest.editorial.posts.some(p=>p.id==='PHOTO-001'&&p.approvals.design));
 assert.ok(manifest.editorial.posts.some(p=>p.id==='photo-week-01'&&p.approvals.design));
 assert.equal(manifest.stories.length,1);
 assert.equal(manifest.photos.length,2);
 // Fresh independent browser profile must restore actual bytes, not merely
 // the labels and author decisions from localStorage.
 const fresh=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
 const restored=await fresh.newPage();
 await restored.goto(origin+'/#persona',{waitUntil:'domcontentloaded'});
 await restored.getByText('Сохранность контента · резервная копия').click();
 const recovery=restored.getByRole('region',{name:'Резервная копия Persona'});
 await recovery.getByLabel('Выбрать резервный архив Persona').setInputFiles(archivePath);
 await recovery.getByText(/фотографии — 2/).waitFor({timeout:25000});
 await recovery.getByRole('button',{name:'Восстановить из архива'}).click();
 await recovery.getByText(/ZIP восстановлен/).waitFor({timeout:25000});
 await restored.reload({waitUntil:'domcontentloaded'});
 const restoredEvidence=await restored.evaluate(async()=>{
  const editorial=JSON.parse(localStorage.getItem('lifeos:persona:editorial-posts:v1')||'{}');
  const stories=JSON.parse(localStorage.getItem('lifeos:persona:weekly-stories:v1')||'[]');
  const db=await new Promise((yes,no)=>{
   const req=indexedDB.open('persona-editorial-assets-v1',1);
   req.onsuccess=()=>yes(req.result);req.onerror=()=>no(req.error);
  });
  const images=await new Promise((yes,no)=>{
   const tx=db.transaction('images','readonly'),r=tx.objectStore('images').getAll();
   r.onsuccess=()=>yes(r.result.map(x=>({key:x.key,size:x.blob.size})));
   r.onerror=()=>no(r.error);
  });
  db.close();
  return {editorial:editorial.posts.map(p=>({id:p.id,caption:p.caption,approved:p.approvals.design})),stories,images};
 });
 assert.deepEqual(restoredEvidence.editorial.map(p=>p.id).sort(),['PHOTO-001','photo-week-01']);
 assert.ok(restoredEvidence.editorial.every(p=>p.approved&&p.caption.length>40));
 assert.equal(restoredEvidence.stories.length,1);
 assert.deepEqual(restoredEvidence.images.map(p=>p.key).sort(),['PHOTO-001/slide-2','photo-week-01/slide-1']);
 assert.ok(restoredEvidence.images.every(p=>p.size>1024));
 // An imported carousel must still EXPORT; this confirms photos are usable.
 await restored.getByTestId('persona-weekly-calendar')
  .locator('[data-calendar-item-id="PHOTO-001"]').getByRole('button',{name:/Начать работу/}).click();
 const againDownload=restored.waitForEvent('download',{timeout:45000});
 await restored.getByTestId('persona-editorial-studio')
  .getByRole('button',{name:'Скачать ZIP с PNG и подписью'}).click();
 const exported=await againDownload;
 await exported.saveAs(join(artifacts,'restored-photo-carousel.zip'));
 const recoveredZip=contents(await readFile(join(artifacts,'restored-photo-carousel.zip')));
 assert.deepEqual(recoveredZip.map(x=>x.name),files.map(x=>x.name));
 assert.ok(recoveredZip[1].bytes.subarray(0,4).equals(Buffer.from([137,80,78,71])));
 await fresh.close();
 await page.screenshot({path:join(artifacts,'editorial-photo-and-carousel-approval.png'),
  fullPage:true,animations:'disabled'});
 // Correct existing video route still works.
 await page.getByTestId('persona-weekly-calendar').locator('[data-calendar-item-id="reel-01"]')
  .getByRole('button',{name:/Начать работу/}).click();
 await page.waitForURL('**/#persona/project/reel-01',{timeout:18000});
 assert.equal(await page.locator('.personaCreativeWorkspace').count(),1);
 await page.goto(origin+'/#persona',{waitUntil:'domcontentloaded'});
 const next=page.getByTestId('persona-weekly-calendar');
 await next.getByRole('button',{name:'Следующая неделя'}).click();
 await next.locator('[data-calendar-item-id="PHOTO-002"]').waitFor();
 assert.equal(await next.locator('[data-calendar-item-id]').count(),3);
 assert.equal(await next.locator('[data-calendar-item-id="PHOTO-001"]').count(),0);
 await next.getByRole('button',{name:'Сегодня',exact:true}).click();
 await next.locator('[data-calendar-item-id="PHOTO-001"]').waitFor();
 assert.match(await next.textContent(),/Короткий рабочий кадр/);
 const mobile=await context.newPage();
 await mobile.setViewportSize({width:390,height:844});
 await mobile.goto(origin+'/#persona',{waitUntil:'domcontentloaded'});
 const mobileCalendar=mobile.getByTestId('persona-weekly-calendar');
 await mobileCalendar.locator('[data-calendar-item-id="PHOTO-001"]').waitFor({timeout:20000});
 assert.equal(await mobileCalendar.locator('[data-calendar-day]').count(),7);
 await mobile.screenshot({path:join(artifacts,'editorial-calendar-mobile.png'),
  fullPage:true,animations:'disabled'});
 assert.deepEqual(errors,[]);
 console.log('PERSONA_EDITORIAL_BROWSER_PASS '+JSON.stringify({
  videosImported:10,photosFromWorker:10,weeklySlots:['reel','carousel','photo'],
  stages:['topic','content','design','production'],openedVideo:'reel-01',
  approvedCarousel:'PHOTO-001',mixedSlideZipFiles:5,singlePhotoZipFiles:2,photoTopicChosen:true,
  storiesPersisted:true,fullZipBackupRestore:true,archivedPhotosRecovered:2,publicCanvasBrandAbsent:true,weekNavigation:true,mobile:true
 }));
}finally{
 if(browser)await browser.close();
 if(worker?.server?.listening)await new Promise(ok=>worker.server.close(ok));
 await rm(temp,{recursive:true,force:true});
}
