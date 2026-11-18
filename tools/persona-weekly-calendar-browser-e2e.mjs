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
 await page.addInitScript(()=>{
  window.__personaPaintLabels=[];
  const original=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(label,...args){
   if(this.canvas.width===1080&&this.canvas.height===1350)
    window.__personaPaintLabels.push(String(label));
   return original.call(this,label,...args);
  };
 });
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
 const authoredTitles=[];
 const contentStep=editor.locator('[aria-label="Шаг 2. Текст и подпись"]');
 for(let i=0;i<4;i++){
  await contentStep.getByRole('button',{name:'Слайд '+(i+1),exact:true}).click();
  authoredTitles.push((await contentStep.getByRole('textbox',{name:'Текст выбранного слайда'}).inputValue()).trim());
 }
 const caption=(await editor.locator('.personaEditorialCaption').inputValue()).trim()+
  '\n\n#актёр #сценарий';
 await editor.locator('.personaEditorialCaption').fill(caption);
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
 await style.getByRole('button',{name:'Утвердить оформление'}).click();
 const downloadPromise=page.waitForEvent('download',{timeout:45000});
 await editor.getByRole('button',{name:'Скачать ZIP с PNG и подписью'}).click();
 const download=await downloadPromise;
 await download.saveAs(join(artifacts,'approved-mixed-carousel.zip'));
 const zip=await readFile(join(artifacts,'approved-mixed-carousel.zip'));
 const files=contents(zip);
 assert.deepEqual(files.map(f=>f.name),[
  'slide-01.png','slide-02.png','slide-03.png','slide-04.png','caption.txt']);
 assert.ok(files.slice(0,4).every(f=>f.bytes.subarray(0,4).equals(Buffer.from([137,80,78,71]))));
 assert.equal(files[4].bytes.toString('utf8'),caption);
 assert.doesNotMatch(files[4].bytes.toString('utf8'),/Проверено автором|ТЕМА:|Публикация не выполнялась/);
 const painted=await page.evaluate(()=>window.__personaPaintLabels);
 assert.equal(painted.join(' ').replace(/\s+/g,' ').trim(),
  authoredTitles.join(' ').replace(/\s+/g,' ').trim(),
  'Canvas must paint every authored title exactly and nothing else (line wraps allowed)');
 assert.ok(painted.every(s=>!/PERSONA|EDITORIAL|АВТОРСКИЙ МАТЕРИАЛ|КАРУСЕЛЬ|ФОТО/i.test(s)),
  'No service brand, format or status burned into PNG');
 // After reload the companion approval and photo stored in IndexedDB survive.
 await page.reload({waitUntil:'domcontentloaded'});
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
 await page.evaluate(()=>{window.__personaPaintLabels=[]});
 const photoDownload=page.waitForEvent('download',{timeout:45000});
 await editorAfter.getByRole('button',{name:'Скачать ZIP с PNG и подписью'}).click();
 const oneImageDownload=await photoDownload;
 await oneImageDownload.saveAs(join(artifacts,'approved-single-photo.zip'));
 const photoZip=contents(await readFile(join(artifacts,'approved-single-photo.zip')));
 assert.deepEqual(photoZip.map(x=>x.name),['slide-01.png','caption.txt']);
 assert.ok(photoZip[0].bytes.subarray(0,4).equals(Buffer.from([137,80,78,71])));
 assert.ok(photoZip[1].bytes.toString('utf8').trim().length>20);
 assert.doesNotMatch(photoZip[1].bytes.toString('utf8'),/Проверено автором|ТЕМА:|Публикация не выполнялась/);
 assert.deepEqual(await page.evaluate(()=>window.__personaPaintLabels),[],
  'Photo with no authored title must contain no rendered text at all');
 await page.screenshot({path:join(artifacts,'editorial-photo-and-carousel-approval.png'),
  fullPage:true,animations:'disabled'});

 // P0: one complete archive must include ALL editorial drafts, Stories and
 // actual IndexedDB photo bytes, and restore in a truly fresh browser profile.
 await page.locator('summary').filter({hasText:'Advanced (Для разработчика) · другие инструменты и архив'}).click();
 await page.locator('summary').filter({hasText:'Настройки разработчика · экспорт и резервная копия'}).click();
 await page.locator('summary').filter({hasText:'Резервная копия и перенос данных'}).click();
 const backupDownload=page.waitForEvent('download',{timeout:45000});
 await page.getByRole('button',{name:'Сохранить ПОЛНЫЙ архив'}).click();
 const backup=await backupDownload;
 const backupPath=join(artifacts,'p0-complete-persona-backup.json');
 await backup.saveAs(backupPath);
 const backupJson=JSON.parse(await readFile(backupPath,'utf8'));
 assert.equal(backupJson.version,2);
 assert.equal(backupJson.kind,'life-os-persona-complete-backup');
 assert.ok(backupJson.editorialPosts.some(p=>p.id==='PHOTO-001'&&p.caption===caption));
 assert.ok(backupJson.editorialPosts.some(p=>p.id==='photo-week-01'));
 assert.ok(backupJson.stories.some(s=>s.text==='Короткий рабочий кадр из реального архива'));
 assert.ok(backupJson.images.some(i=>i.key==='PHOTO-001/slide-2'&&i.sha256.length===64));
 assert.ok(backupJson.images.some(i=>i.key==='photo-week-01/slide-1'&&i.sha256.length===64));
 const clean=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
 const fresh=await clean.newPage();
 await fresh.goto(origin+'/#persona',{waitUntil:'domcontentloaded'});
 await fresh.getByTestId('persona-weekly-calendar').waitFor({timeout:20000});
 assert.equal(await fresh.locator('.personaEditorialSaved').getByText('Четыре секунды до выбора').count(),0);
 await fresh.locator('summary').filter({hasText:'Advanced (Для разработчика) · другие инструменты и архив'}).click();
 await fresh.locator('summary').filter({hasText:'Настройки разработчика · экспорт и резервная копия'}).click();
 await fresh.locator('summary').filter({hasText:'Резервная копия и перенос данных'}).click();
 await fresh.getByLabel('Выбрать JSON-архив Life OS').setInputFiles(backupPath);
 await fresh.getByRole('button',{name:'Восстановить без перезаписи'}).click();
 await fresh.getByText(/Восстановлено:.*2 оригинальных фотографий/).waitFor({timeout:45000});
 await fresh.reload({waitUntil:'domcontentloaded'});
 const restoredCalendar=fresh.getByTestId('persona-weekly-calendar');
 await restoredCalendar.locator('[data-calendar-item-id="PHOTO-001"]').waitFor({timeout:18000});
 assert.match(await restoredCalendar.textContent(),/Короткий рабочий кадр из реального архива/);
 await restoredCalendar.locator('[data-calendar-item-id="PHOTO-001"]')
  .getByRole('button',{name:/Начать работу/}).click();
 const restoredEditor=fresh.getByTestId('persona-editorial-studio');
 assert.match(await restoredEditor.textContent(),/Четыре секунды до выбора/);
 assert.equal(await restoredEditor.locator('.personaEditorialCaption').inputValue(),caption);
 const styleRestored=restoredEditor.locator('[aria-label="Шаг 3. Оформление"]');
 await styleRestored.getByRole('button',{name:/2 · Фото/}).click();
 await styleRestored.getByText('Локально сохранено:').waitFor();
 assert.ok((await styleRestored.getByText('Локально сохранено:').textContent()).includes('actual-photo.png'));
 await clean.close();

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
  storiesPersisted:true,backupRestoredFreshBrowser:true,publicCanvasLabelsOnly:true,
  weekNavigation:true,mobile:true
 }));
}finally{
 if(browser)await browser.close();
 if(worker?.server?.listening)await new Promise(ok=>worker.server.close(ok));
 await rm(temp,{recursive:true,force:true});
}
