#!/usr/bin/env node
/** P0 real Chromium acceptance without FFmpeg: authored public PNGs, exact
 * caption.txt, full original IndexedDB backup and clean-profile restoration.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';

const origin=process.env.PERSONA_PREVIEW_URL||'http://127.0.0.1:4173';
const artifacts=resolve('artifacts/persona-p0-brand-backup');
await mkdir(artifacts,{recursive:true});
function contents(buf){
 const files=[];let offset=0;
 while(offset+30<=buf.length&&buf.readUInt32LE(offset)===0x04034b50){
  const nameLength=buf.readUInt16LE(offset+26),extra=buf.readUInt16LE(offset+28);
  const size=buf.readUInt32LE(offset+18),start=offset+30+nameLength+extra;
  assert.ok(start+size<=buf.length,'Truncated ZIP entry');
  files.push({name:buf.subarray(offset+30,offset+30+nameLength).toString('utf8'),bytes:buf.subarray(start,start+size)});
  offset=start+size;
 }
 return files;
}
const pngSignature=Buffer.from([137,80,78,71,13,10,26,10]);
function assertPng(file){
 assert.ok(file.bytes.subarray(0,8).equals(pngSignature),'Must output actual PNG');
 assert.equal(file.bytes.readUInt32BE(16),1080);
 assert.equal(file.bytes.readUInt32BE(20),1350);
}
async function observeCanvas(page){
 await page.evaluate(()=>{
  window.__personaPublicCanvasText=[];
  const proto=CanvasRenderingContext2D.prototype;
  const prior=proto.fillText;
  proto.fillText=function(value,...args){
   window.__personaPublicCanvasText.push(String(value));
   return prior.call(this,value,...args);
  };
 });
}
async function downloadZip(page,button,path){
 const pending=page.waitForEvent('download',{timeout:45000});
 await button.click();
 const dl=await pending;await dl.saveAs(path);
 return contents(await readFile(path));
}
async function completeCarouselChecklist(editor){
 const checks=editor.getByTestId('carousel-acceptance-checklist');
 const approve=editor.getByRole('button',{name:'Утвердить оформление'});
 assert.equal(await approve.isDisabled(),true,'Final approval initially disabled');
 for(let i=1;i<=6;i++)await checks.getByRole('checkbox',{name:'Пункт '+i}).check();
 assert.equal(await checks.getByRole('checkbox',{name:'Пункт 7'}).isChecked(),true,'Automatic contrast passes');
 assert.equal(await checks.getByRole('checkbox',{name:'Пункт 7'}).isDisabled(),true,'Contrast must not be manually editable');
 assert.equal(await approve.isEnabled(),true);
}
const browser=await chromium.launch({headless:true});
try{
 const first=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:900}});
 const page=await first.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/#persona',{waitUntil:'domcontentloaded'});
 const calendar=page.getByTestId('persona-weekly-calendar');
 await calendar.waitFor({timeout:30000});
 await calendar.locator('[data-calendar-item-id="PHOTO-001"]').waitFor({timeout:20000});
 // Stories are in the weekly plan but do not imply verified publishing.
 await calendar.getByRole('textbox',{name:'Идея Stories'}).fill('Бэкстейдж реальной репетиции');
 await calendar.getByRole('button',{name:'Добавить',exact:true}).click();
 await calendar.getByRole('combobox',{name:/Статус истории/}).selectOption('captured');
 await calendar.locator('[data-calendar-item-id="PHOTO-001"]')
  .getByRole('button',{name:/Начать работу/}).click();
 const editor=page.getByTestId('persona-editorial-studio');
 await editor.locator('[data-testid="editorial-post-workflow"]').waitFor({timeout:15000});
 await editor.getByRole('button',{name:'Утвердить тему'}).click();
 const carouselCaption=(await editor.locator('.personaEditorialCaption').inputValue()).trim();
 await editor.getByRole('button',{name:'Утвердить тексты и подпись'}).click();
 // One actual JPEG/PNG original, generated in Browser Canvas (no FFmpeg dependency).
 const dataURL=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=480;c.height=600;
  const ctx=c.getContext('2d');ctx.fillStyle='#5b695c';ctx.fillRect(0,0,480,600);
  ctx.fillStyle='#d0b588';ctx.fillRect(90,180,300,240);
  return c.toDataURL('image/png').split(',')[1];
 });
 const imageBuffer=Buffer.from(dataURL,'base64');
 assert.ok(imageBuffer.length>1024);
 const selected={name:'author-original.png',mimeType:'image/png',buffer:imageBuffer};
 const style=editor.locator('[aria-label="Шаг 3. Оформление"]');
 await style.getByRole('button',{name:/2 · Фон/}).click();
 await style.getByLabel('Фото из архива + текст').check();
 await style.locator('input[type=file]').setInputFiles(selected);
 await style.getByText('Локально сохранено:').waitFor({timeout:15000});
 await completeCarouselChecklist(editor);
  await style.getByRole('button',{name:'Утвердить оформление'}).click();
 await observeCanvas(page);
 const carousel=await downloadZip(page,editor.getByRole('button',{name:'Скачать ZIP с PNG и подписью'}),
  join(artifacts,'approved-carousel.zip'));
 assert.deepEqual(carousel.map(f=>f.name),[
  'slide-01.png','slide-02.png','slide-03.png','slide-04.png','caption.txt']);
 carousel.slice(0,4).forEach(assertPng);
 assert.equal(carousel[4].bytes.toString('utf8'),carouselCaption);
 assert.doesNotMatch(carousel[4].bytes.toString('utf8'),/ТЕМА:|Проверено автором|Публикация не выполнялась|PERSONA/i);
 const calls=await page.evaluate(()=>window.__personaPublicCanvasText);
 assert.equal(calls.join(' '),[
  'Он ещё верит','Теперь он сомневается','Улыбка ничего не объясняет','Решение уже принято'
 ].join(' '));
 assert.ok(calls.every(x=>!/(PERSONA|EDITORIAL|АВТОРСКИЙ МАТЕРИАЛ)/i.test(x)));
 // Generate a completely separate photographic post with no burned title.
 await calendar.locator('[data-calendar-item-id="photo-week-01"]')
  .getByRole('button',{name:'Выбрать тему'}).click();
 await editor.locator('[data-testid="editorial-topic-chooser"]').waitFor();
 await editor.getByRole('button',{name:'Фото-посты'}).click();
 await editor.locator('.personaEditorialSuggestions article').first()
  .getByRole('button',{name:/Выбрать тему/}).click();
 await editor.getByRole('button',{name:'Утвердить тему'}).click();
 await editor.getByRole('textbox',{name:/Короткий титр на фото/}).fill('');
 const photoCaption=(await editor.locator('.personaEditorialCaption').inputValue()).trim();
 await editor.getByRole('button',{name:'Утвердить тексты и подпись'}).click();
 const portrait=editor.locator('[aria-label="Шаг 3. Оформление"]');
 await portrait.locator('input[type=file]').setInputFiles(selected);
 await portrait.getByText('Локально сохранено:').waitFor({timeout:15000});
 await portrait.getByRole('button',{name:'Утвердить оформление'}).click();
 const count=await page.evaluate(()=>window.__personaPublicCanvasText.length);
 const photo=await downloadZip(page,editor.getByRole('button',{name:'Скачать ZIP с PNG и подписью'}),
  join(artifacts,'approved-photo.zip'));
 assert.deepEqual(photo.map(f=>f.name),['slide-01.png','caption.txt']);
 assertPng(photo[0]);assert.equal(photo[1].bytes.toString('utf8'),photoCaption);
 assert.deepEqual(await page.evaluate(n=>window.__personaPublicCanvasText.slice(n),count),[],
  'Author photo without title must contain no burned text');
 // Full lossless archive of both editorial projects, Stories, original images.
 await page.getByText('Сохранность контента · резервная копия').click();
 const backupUI=page.getByRole('region',{name:'Резервная копия Persona'});
 const originalZipPath=join(artifacts,'full-persona-backup.zip');
 const zipEntries=await downloadZip(page,backupUI.getByRole('button',{name:'Сохранить полный архив ZIP'}),originalZipPath);
 assert.equal(zipEntries.length,3);
 assert.equal(zipEntries[0].name,'persona-backup.json');
 const manifest=JSON.parse(zipEntries[0].bytes.toString('utf8'));
 assert.equal(manifest.kind,'life-os-persona-full-backup');
 assert.equal(manifest.version,2);assert.equal(manifest.photos.length,2);
 assert.equal(manifest.stories.length,1);
 assert.ok(manifest.editorial.posts.some(p=>p.id==='PHOTO-001'&&p.approvals.design));
 assert.ok(manifest.editorial.posts.some(p=>p.id==='photo-week-01'&&p.approvals.design));
 // New browser context has EMPTY localStorage + IndexedDB: must restore all bytes.
 const clean=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:900}});
 const fresh=await clean.newPage();
 fresh.on('pageerror',e=>errors.push('restore:'+e.message));
 await fresh.goto(origin+'/#persona',{waitUntil:'domcontentloaded'});
 await fresh.getByText('Сохранность контента · резервная копия').click();
 const importUI=fresh.getByRole('region',{name:'Резервная копия Persona'});
 await importUI.getByLabel('Выбрать резервный архив Persona').setInputFiles(originalZipPath);
 await importUI.getByText(/фотографии — 2/).waitFor({timeout:20000});
 await importUI.getByRole('button',{name:'Восстановить из архива'}).click();
 await importUI.getByText(/ZIP восстановлен/).waitFor({timeout:30000});
 await fresh.reload({waitUntil:'domcontentloaded'});
 const restored=await fresh.evaluate(async()=>{
  const editorial=JSON.parse(localStorage.getItem('lifeos:persona:editorial-posts:v1')||'{}');
  const stories=JSON.parse(localStorage.getItem('lifeos:persona:weekly-stories:v1')||'[]');
  const db=await new Promise((resolve,reject)=>{
   const req=indexedDB.open('persona-editorial-assets-v1',1);
   req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  const photos=await new Promise((resolve,reject)=>{
   const request=db.transaction('images','readonly').objectStore('images').getAll();
   request.onsuccess=()=>resolve(request.result.map(p=>({key:p.key,size:p.blob.size})));
   request.onerror=()=>reject(request.error);
  });
  db.close();return {posts:editorial.posts,stories,photos};
 });
 assert.deepEqual(restored.posts.map(p=>p.id).sort(),['PHOTO-001','photo-week-01']);
 assert.ok(restored.posts.every(p=>p.approvals.design&&p.caption.length>40));
 assert.equal(restored.stories.length,1);
 assert.deepEqual(restored.photos.map(p=>p.key).sort(),['PHOTO-001/slide-2','photo-week-01/slide-1']);
 assert.ok(restored.photos.every(p=>p.size===imageBuffer.length));
 // Re-export requires valid original image blobs in restored IndexedDB.
 await fresh.getByTestId('persona-weekly-calendar').locator('[data-calendar-item-id="PHOTO-001"]')
  .getByRole('button',{name:/Начать работу/}).click();
 const result=await downloadZip(fresh,
  fresh.getByTestId('persona-editorial-studio')
   .getByRole('button',{name:'Скачать ZIP с PNG и подписью'}),
  join(artifacts,'restored-carousel.zip'));
 assert.deepEqual(result.map(x=>x.name),carousel.map(x=>x.name));
 result.slice(0,4).forEach(assertPng);
 assert.equal(result[4].bytes.toString('utf8'),carouselCaption);
 // Baseline v0 is created only after the existing backup assertions, preserving PHOTO-001/010.
 await editor.getByRole('button',{name:'Все темы ↖'}).click();
 await editor.getByTestId('open-carousel-baseline').click();
 await editor.locator('[data-testid="editorial-post-workflow"]').waitFor();
 assert.equal(await editor.locator('.personaEditorialProjectHead h3').textContent(),'Почему пауза сильнее реплики');
 const pending=await page.evaluate(()=>{
  const store=JSON.parse(localStorage.getItem('lifeos:persona:editorial-posts:v1')||'{}');
  return store.posts.find(p=>p.id==='carousel-baseline-pause');
 });
 assert.equal(pending.slides.length,6);
 assert.equal(pending.preset,'chocolate-graphite');
 assert.equal(pending.approvals.content,false,'Caption must still be a draft');
 assert.ok(pending.slides.every(slide=>slide.visual==='background'));
 await editor.getByRole('button',{name:'Утвердить тему'}).click();
 await editor.getByRole('button',{name:'Утвердить тексты и подпись'}).click();
 const baselineButton=editor.getByRole('button',{name:'Утвердить оформление'});
 assert.equal(await baselineButton.isDisabled(),true);
 await completeCarouselChecklist(editor);
 await baselineButton.click();
 const snapshot=await page.evaluate(()=>{
  const store=JSON.parse(localStorage.getItem('lifeos:persona:editorial-posts:v1')||'{}');
  return store.posts.find(p=>p.id==='carousel-baseline-pause').approvals;
 });
 assert.ok(snapshot.topic&&snapshot.content&&snapshot.design);
 assert.ok(snapshot.checkedAt&&Number.isFinite(Date.parse(snapshot.checkedAt)));
 assert.equal(snapshot.checkedBy,'Автор');
 assert.match(snapshot.contentHashAtApproval,/^fnv1a32:[0-9a-f]{8}$/);
 assert.deepEqual(snapshot.checklist,[true,true,true,true,true,true,true]);
 const baseline=await downloadZip(page,editor.getByRole('button',{name:'Скачать ZIP с PNG и подписью'}),
  join(artifacts,'carousel-baseline-pause.zip'));
 assert.deepEqual(baseline.map(file=>file.name),[
  'slide-01.png','slide-02.png','slide-03.png','slide-04.png','slide-05.png','slide-06.png','caption.txt'
 ]);
 baseline.slice(0,6).forEach(assertPng);
 assert.ok(baseline[6].bytes.toString('utf8').includes('Пауза в кадре — это не пустота'));
 await writeFile(join(artifacts,'carousel-baseline-pause-slide-01.png'),baseline[0].bytes);
 await editor.getByRole('button',{name:'Слайд 1'}).click();
 await editor.getByRole('textbox',{name:'Текст выбранного слайда'}).fill('После правки — требуется новое утверждение.');
 assert.equal(await editor.locator('.personaEditorialState').textContent(),'Требует повторного утверждения');
 const revoked=await page.evaluate(()=>{
  const store=JSON.parse(localStorage.getItem('lifeos:persona:editorial-posts:v1')||'{}');
  return store.posts.find(p=>p.id==='carousel-baseline-pause').approvals;
 });
 assert.equal(revoked.content,false);
 assert.equal(revoked.design,false);
 assert.equal(revoked.contentHashAtApproval,snapshot.contentHashAtApproval);
 // Carousel 002 uses the unchanged gate, PNG exporter and isolated Chromium user profile.
 await editor.getByRole('button',{name:'Все темы ↖'}).click();
 await editor.getByTestId('open-carousel-002').click();
 await editor.locator('[data-testid="editorial-post-workflow"]').waitFor();
 assert.equal(await editor.locator('.personaEditorialProjectHead h3').textContent(),
  'Зачем режиссёру оставлять зрителя без ответа');
 const researchDraft=await page.evaluate(()=>{
  const store=JSON.parse(localStorage.getItem('lifeos:persona:editorial-posts:v1')||'{}');
  return store.posts.find(p=>p.id==='carousel-why-director-leaves-question');
 });
 assert.equal(researchDraft.kind,'carousel');
 assert.equal(researchDraft.preset,'chocolate-graphite');
 assert.equal(researchDraft.slides.length,6);
 assert.ok(researchDraft.slides.every(s=>s.visual==='background'));
 assert.equal(researchDraft.researchSourceDoc,'docs/carousel-002-research-sources.md');
 assert.equal(researchDraft.approvals.content,false,'Caption must remain a draft until approved');
 assert.ok(researchDraft.caption.includes('Брук называет пустое пространство приглашением к воображению.'));
 assert.equal(researchDraft.slides[0].text,'Открытый финал — не отсутствие ответа, а другой его адрес.');
 assert.equal(researchDraft.slides[5].text,'Режиссёр оставляет вопрос, когда ответ был бы ложью.');
 await editor.getByRole('button',{name:'Утвердить тему'}).click();
 await editor.getByRole('button',{name:'Утвердить тексты и подпись'}).click();
 assert.equal(await editor.getByRole('button',{name:'Утвердить оформление'}).isDisabled(),true);
 await completeCarouselChecklist(editor);
 await editor.getByRole('button',{name:'Утвердить оформление'}).click();
 const researchApproval=await page.evaluate(()=>{
  const store=JSON.parse(localStorage.getItem('lifeos:persona:editorial-posts:v1')||'{}');
  return store.posts.find(p=>p.id==='carousel-why-director-leaves-question').approvals;
 });
 assert.ok(researchApproval.topic&&researchApproval.content&&researchApproval.design);
 assert.match(researchApproval.contentHashAtApproval,/^fnv1a32:[0-9a-f]{8}$/);
 assert.ok(researchApproval.checkedAt&&Number.isFinite(Date.parse(researchApproval.checkedAt)));
 assert.deepEqual(researchApproval.checklist,[true,true,true,true,true,true,true]);
 const researchZip=await downloadZip(page,editor.getByRole('button',{name:'Скачать ZIP с PNG и подписью'}),
  join(artifacts,'carousel-why-director-leaves-question.zip'));
 assert.deepEqual(researchZip.map(f=>f.name),[
  'slide-01.png','slide-02.png','slide-03.png','slide-04.png','slide-05.png','slide-06.png','caption.txt'
 ]);
 researchZip.slice(0,6).forEach(assertPng);
 assert.equal(researchZip[6].bytes.toString('utf8'),researchDraft.caption);
 await writeFile(join(artifacts,'carousel-why-director-leaves-question-slide-01.png'),researchZip[0].bytes);
 await clean.close();
 assert.deepEqual(errors,[]);
 console.log('PERSONA_P0_FULL_BROWSER_PASS '+JSON.stringify({
  publicPngBrandFree:true,carouselPngs:4,photoPngs:1,
  cleanCaptions:true,originalPhotosRestored:2,editorialPostsRestored:2,
  storiesRestored:1,reexportAfterRestore:true,researchCarouselPngs:6
 }));
}finally{await browser.close()}
