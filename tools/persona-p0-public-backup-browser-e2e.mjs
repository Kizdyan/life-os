#!/usr/bin/env node
/** P0 real Chromium acceptance without FFmpeg: authored public PNGs, exact
 * caption.txt, full original IndexedDB backup and clean-profile restoration.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const activeBaselineCaption=JSON.parse(await readFile(resolve(
 'config/carousel-baseline-pause-captions.json'),'utf8')).variants.medium;

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

async function completeArchiveCarouselChecklist(editor){
 const checks=editor.getByTestId('carousel-acceptance-checklist');
 const approve=editor.getByRole('button',{name:'Утвердить оформление'});
 assert.equal(await approve.isDisabled(),true);
 for(let i=1;i<=5;i++)await checks.getByRole('checkbox',{name:'Пункт '+i}).check();
 assert.equal(await checks.getByRole('checkbox',{name:'Пункт 6'}).isDisabled(),true);
 assert.equal(await checks.getByRole('checkbox',{name:'Пункт 6'}).isChecked(),true,
  'Archive reference or explicit background fallback is verified automatically');
 assert.equal(await checks.getByRole('checkbox',{name:'Пункт 7'}).isChecked(),true);
 await approve.waitFor({state:'visible'});
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
 const approvedPhotoRefs=manifest.editorial.posts.flatMap(p=>p.slides.filter(s=>s.visual==='archive-photo').map(s=>s.photoRef)).sort();
 assert.equal(approvedPhotoRefs.length,2);
 assert.ok(approvedPhotoRefs.every(ref=>/^(PHOTO-001|photo-week-01)\/photo-[0-9a-f-]{36}$/.test(ref)),
  'New uploads have immutable references, not overwriteable slide-id keys');
 assert.deepEqual(manifest.photos.map(p=>p.key).sort(),approvedPhotoRefs);
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
 assert.deepEqual(restored.photos.map(p=>p.key).sort(),approvedPhotoRefs);
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

 // Review UI must show EXACT 1080x1350 exported pixels, not a similar HTML mock.
 const baselineShot=editor.getByTestId('baseline-exact-preview');
 await baselineShot.waitFor({timeout:18000});
 const bitmapProof=await baselineShot.evaluate(async image=>{
  const source=await fetch((image).src).then(r=>r.arrayBuffer());
  const sum=await crypto.subtle.digest('SHA-256',source);
  return Array.from(new Uint8Array(sum)).map(x=>x.toString(16).padStart(2,'0')).join('');
 });
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
 assert.equal(bitmapProof,createHash('sha256').update(baseline[0].bytes).digest('hex'),
  'Editorial Desk PNG preview must be byte-identical with exported first slide');
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

 // Carousel 003/004 P0: use 3 tiny synthetic PNG fixtures, upscaled into the
 // EXISTING IndexedDB store. No new media library, and no real user files.
 const archivePngs=await Promise.all([1,2,3].map(i=>readFile(resolve(
  'apps/web/src/fixtures/carousel-archive-test-0'+i+'.png'))));
 const seeds=archivePngs.map(buf=>buf.toString('base64'));
 const inserted=await page.evaluate(async samples=>{
  const photos=[];
  for(const [i,b64] of samples.entries()){
   const image=new Image();image.src='data:image/png;base64,'+b64;await image.decode();
   const canvas=document.createElement('canvas');canvas.width=480;canvas.height=600;
   const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
   ctx.imageSmoothingEnabled=false;ctx.drawImage(image,0,0,480,600);
   const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Missing test PNG')),'image/png'));
   photos.push({key:'fixture-carousel/slide-'+(i+1),name:'fixture-carousel-0'+(i+1)+'.png',
    mime:'image/png',bytes:blob.size,blob});
  }
  const db=await new Promise((resolve,reject)=>{
   const req=indexedDB.open('persona-editorial-assets-v1',1);
   req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('images'))
    req.result.createObjectStore('images',{keyPath:'key'})};
   req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  try{
   await new Promise((resolve,reject)=>{
    const tx=db.transaction('images','readwrite');
    for(const item of photos)tx.objectStore('images').put(item);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
   });
  }finally{db.close()}
  return photos.map(x=>({key:x.key,size:x.bytes}));
 },seeds);
 assert.equal(inserted.length,3);
 assert.ok(inserted.every(x=>x.size>1024));
 await editor.getByRole('button',{name:'Все темы ↖'}).click();
 await editor.getByTestId('open-carousel-003').click();
 await editor.locator('[data-testid="editorial-post-workflow"]').waitFor();
 await editor.getByRole('button',{name:'Утвердить тему'}).click();
 await editor.getByRole('button',{name:'Утвердить тексты и подпись'}).click();
 const design003=editor.locator('[aria-label="Шаг 3. Оформление"]');
 const picker003=editor.getByTestId('editorial-archive-picker');
 for(let i=1;i<=3;i++){
  await design003.getByRole('button',{name:new RegExp('^'+i+' · Фон')}).click();
  await picker003.locator('[data-archive-key="fixture-carousel/slide-'+i+'"]').click();
  await picker003.getByTestId('editorial-selected-photo').waitFor();
 }
 const selectedRecord=await page.evaluate(()=>{
  const posts=JSON.parse(localStorage.getItem('lifeos:persona:editorial-posts:v1')).posts;
  return posts.find(p=>p.id==='carousel-photo-archive');
 });
 assert.equal(selectedRecord.carouselFormat,'photo-led');
 assert.deepEqual(selectedRecord.slides.slice(0,3).map(s=>s.photoRef),
  inserted.map(x=>x.key));
 // Change order without changing the authored caption/meaning of slides.
 await picker003.getByRole('button',{name:'Выбранное фото выше'}).click();
 const movedRecord=await page.evaluate(()=>JSON.parse(localStorage.getItem(
  'lifeos:persona:editorial-posts:v1')).posts.find(p=>p.id==='carousel-photo-archive'));
 assert.deepEqual(movedRecord.slides.slice(0,3).map(s=>s.photoRef),
  [inserted[0].key,inserted[2].key,inserted[1].key]);
 await completeArchiveCarouselChecklist(editor);
 await editor.getByRole('button',{name:'Утвердить оформление'}).click();
 await editor.getByText('Оформление утверждено ✓').waitFor({timeout:15000});
 const approved003=await page.evaluate(()=>JSON.parse(localStorage.getItem(
  'lifeos:persona:editorial-posts:v1')).posts.find(p=>p.id==='carousel-photo-archive'));
 assert.ok(approved003.approvals.design&&approved003.approvals.contentHashAtApproval);
 const carousel003=await downloadZip(page,editor.getByRole('button',{name:'Скачать ZIP с PNG и подписью'}),
  join(artifacts,'carousel-photo-archive.zip'));
 assert.deepEqual(carousel003.map(x=>x.name),[
  'slide-01.png','slide-02.png','slide-03.png','slide-04.png','slide-05.png','slide-06.png','caption.txt']);
 carousel003.slice(0,6).forEach(assertPng);
 assert.equal(carousel003[6].bytes.toString('utf8'),approved003.caption);
 const photoPixels=[];
 for(const png of carousel003.slice(0,3)){
  const pixels=await page.evaluate(async b64=>{
   const image=new Image();image.src='data:image/png;base64,'+b64;await image.decode();
   const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;
   const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
   return Array.from(ctx.getImageData(200,100,1,1).data).slice(0,3);
  },png.bytes.toString('base64'));
  photoPixels.push(pixels);
 }
 // The existing Canvas photo renderer deliberately applies a 14% dark
 // gradient even at the top edge. Compare the exact blended source colors
 // with a small raster-rounding tolerance, not raw ungraded input pixels.
 const originalColors=[[80,112,93],[142,83,88],[79,89,123]];
 for(let i=0;i<3;i++){
  const blended=originalColors[i].map((v,c)=>Math.round(v*.86+[5,8,12][c]*.14));
  assert.ok(photoPixels[i].every((v,c)=>Math.abs(v-blended[c])<=3),
   'PNG '+i+' must retain corresponding original archive photo pixels under overlay');
 }
 assert.equal(new Set(photoPixels.map(x=>x.join(','))).size,3);
 await writeFile(join(artifacts,'carousel-photo-archive-slide-01.png'),carousel003[0].bytes);
 // Change a photo after approval: existing reviseEditorialPost must revoke design
 // and the immutable approval hash cannot silently validate the new photo.
 await design003.getByRole('button',{name:/1 · Фото/}).click();
 await picker003.locator('[data-archive-key="fixture-carousel/slide-2"]').click();
 const changed003=await page.evaluate(()=>JSON.parse(localStorage.getItem(
  'lifeos:persona:editorial-posts:v1')).posts.find(p=>p.id==='carousel-photo-archive'));
 assert.equal(changed003.approvals.design,false);
 assert.notEqual(changed003.approvals.contentHashAtApproval,changed003.approvals.design?
  changed003.approvals.contentHashAtApproval:'', 'Hash remains audit evidence, not a fresh approval');
 assert.equal(changed003.approvals.contentHashAtApproval,approved003.approvals.contentHashAtApproval);
 // Carousel 004: no image chosen, all 6 photo/text positions remain text fallback;
 // the same approval gate and same PNG exporter must still work.
 await editor.getByRole('button',{name:'Все темы ↖'}).click();
 await editor.getByTestId('open-carousel-004').click();
 await editor.locator('[data-testid="editorial-post-workflow"]').waitFor();
 await editor.getByRole('button',{name:'Утвердить тему'}).click();
 await editor.getByRole('button',{name:'Утвердить тексты и подпись'}).click();
 const mixed=await page.evaluate(()=>JSON.parse(localStorage.getItem(
  'lifeos:persona:editorial-posts:v1')).posts.find(p=>p.id==='carousel-mixed-narrative'));
 assert.equal(mixed.carouselFormat,'mixed');
 assert.equal(mixed.slides.length,6);
 assert.ok(mixed.slides.every(x=>x.visual==='background'&&!x.photoRef));
 await completeArchiveCarouselChecklist(editor);
 await editor.getByRole('button',{name:'Утвердить оформление'}).click();
 await editor.getByText('Оформление утверждено ✓').waitFor({timeout:15000});
 const carousel004=await downloadZip(page,editor.getByRole('button',{name:'Скачать ZIP с PNG и подписью'}),
  join(artifacts,'carousel-mixed-fallback.zip'));
 carousel004.slice(0,6).forEach(assertPng);
 assert.equal(carousel004[6].bytes.toString('utf8'),mixed.caption);
 assert.equal(carousel004.length,7);
 // An empty archive is explicit, never fabricated. New browser context has no
 // indexed photos; author can still approve the text-only carousel.
 const emptyCtx=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:900}});
 try{
  const empty=await emptyCtx.newPage();
  await empty.goto(origin+'/#persona',{waitUntil:'domcontentloaded'});
  await empty.getByTestId('persona-weekly-calendar').locator('[data-calendar-item-id="PHOTO-001"]')
   .getByRole('button',{name:/Начать работу/}).click();
  const emptyEditor=empty.getByTestId('persona-editorial-studio');
  await emptyEditor.getByRole('button',{name:'Все темы ↖'}).click();
  await emptyEditor.getByTestId('open-carousel-003').click();
  await emptyEditor.getByRole('button',{name:'Утвердить тему'}).click();
  await emptyEditor.getByRole('button',{name:'Утвердить тексты и подпись'}).click();
  await emptyEditor.getByTestId('editorial-archive-empty').waitFor({timeout:15000});
  await completeArchiveCarouselChecklist(emptyEditor);
  await emptyEditor.getByRole('button',{name:'Утвердить оформление'}).click();
  await emptyEditor.getByText('Оформление утверждено ✓').waitFor({timeout:15000});
  const fallback=await downloadZip(empty,emptyEditor.getByRole('button',
   {name:'Скачать ZIP с PNG и подписью'}),join(artifacts,'carousel-003-empty-fallback.zip'));
  fallback.slice(0,6).forEach(assertPng);
  assert.equal(fallback.length,7);
 }finally{await emptyCtx.close()}


 // P0 publication package: existing gate is never bypassed by download.
 await editor.getByRole('button',{name:'Все темы ↖'}).click();
 await editor.getByTestId('open-publication-package').click();
 const publicationPage=editor.getByTestId('editorial-publication-package');
 await publicationPage.waitFor({timeout:10000});
 const expectedIds=[
  'carousel-baseline-pause','carousel-why-director-leaves-question',
  'carousel-photo-archive','carousel-mixed-narrative'
 ];
 assert.equal(await publicationPage.locator('[data-publish-carousel-id]').count(),4);
 const carousel3Row=publicationPage.locator('[data-publish-carousel-id="carousel-photo-archive"]');
 assert.equal(await carousel3Row.locator('.personaEditorialPublishStatus').textContent(),
  'Текст утверждён · оформление ожидает просмотра');
 assert.equal(await carousel3Row.getByRole('button',{name:'Скачать пакет'}).isDisabled(),true);
 await carousel3Row.getByRole('status').getByText(
  'Оформление не утверждено. Посмотрите PNG и подтвердите').waitFor();
 assert.equal(await publicationPage.getByRole('button',{name:'Скачать все четыре одним архивом'}).isDisabled(),true);
 // Complete approval in the original Editorial Desk; no extra publish gate.
 await carousel3Row.getByRole('button',{name:'Утвердить',exact:true}).click();
 await editor.locator('[data-testid="editorial-post-workflow"]').waitFor();
 await completeArchiveCarouselChecklist(editor);
 await editor.getByRole('button',{name:'Утвердить оформление'}).click();
 await editor.getByText('Оформление утверждено ✓').waitFor({timeout:15000});
 await editor.getByRole('button',{name:'Пакет для публикации'}).click();
 await publicationPage.waitFor();
 // The earlier baseline regression deliberately edited its text and revoked
 // approval. Re-approve its content/design through the same existing gate.
 const baselineRow=publicationPage.locator('[data-publish-carousel-id="carousel-baseline-pause"]');
 assert.equal(await baselineRow.locator('.personaEditorialPublishStatus').textContent(),'Черновик');
 await baselineRow.getByRole('button',{name:'Утвердить',exact:true}).click();
 await editor.getByRole('button',{name:'Утвердить тексты и подпись'}).click();
 await completeCarouselChecklist(editor);
 await editor.getByRole('button',{name:'Утвердить оформление'}).click();
 await editor.getByText('Оформление утверждено ✓').waitFor({timeout:15000});
 await editor.getByRole('button',{name:'Пакет для публикации'}).click();
 await publicationPage.waitFor();
 for(const id of expectedIds){
  const row=publicationPage.locator('[data-publish-carousel-id="'+id+'"]');
  assert.equal(await row.locator('.personaEditorialPublishStatus').textContent(),'Утверждена');
  assert.equal(await row.locator('.personaEditorialPublishCover').count(),1);
 }
 const individual=await downloadZip(page,publicationPage.locator(
  '[data-publish-carousel-id="carousel-baseline-pause"]'
 ).getByRole('button',{name:'Скачать пакет'}),join(artifacts,'carousel-baseline-publish.zip'));
 assert.deepEqual(individual.map(x=>x.name),[
  ...Array.from({length:6},(_,i)=>'carousel-baseline-pause/slide-'+String(i+1).padStart(2,'0')+'.png'),
  'carousel-baseline-pause/caption.txt',
  'carousel-baseline-pause/publish-instructions.txt',
  'carousel-baseline-pause/checklist.json'
 ]);
 individual.slice(0,6).forEach(assertPng);
 const individualGate=JSON.parse(individual[8].bytes.toString('utf8'));
 assert.equal(individualGate.status,'approved');
 assert.equal(individualGate.published,false);
 assert.equal(individualGate.checks.length,7);
 assert.ok(individualGate.checks.every(x=>x.pass));
 assert.equal(individual[6].bytes.toString('utf8'),activeBaselineCaption);
 const complete=await downloadZip(page,publicationPage.getByRole('button',
  {name:'Скачать все четыре одним архивом'}),join(artifacts,'persona-four-carousels-publish.zip'));
 assert.equal(complete.length,36);
 assert.deepEqual(complete.map(x=>x.name),expectedIds.flatMap(id=>[
  ...Array.from({length:6},(_,i)=>id+'/slide-'+String(i+1).padStart(2,'0')+'.png'),
  id+'/caption.txt',id+'/publish-instructions.txt',id+'/checklist.json'
 ]));
 for(const id of expectedIds){
  const folder=complete.filter(x=>x.name.startsWith(id+'/'));
  assert.equal(folder.length,9);
  folder.slice(0,6).forEach(assertPng);
  assert.ok(folder[6].bytes.length>80);
  assert.match(folder[7].bytes.toString('utf8'),/Instagram/);
  const json=JSON.parse(folder[8].bytes.toString('utf8'));
  assert.equal(json.carouselId,id);
  assert.equal(json.status,'approved');
  assert.equal(json.published,false);
  assert.ok(json.checks.every(x=>x.pass));
 }
 assert.equal(JSON.parse(complete.find(x=>x.name==='carousel-mixed-narrative/checklist.json')
  .bytes.toString('utf8')).textFallback,true);
 assert.match(complete.find(x=>x.name==='carousel-mixed-narrative/publish-instructions.txt')
  .bytes.toString('utf8'),/Это текстовая версия. Чтобы добавить фотографии/);
 console.log('PERSONA_FOUR_PUBLICATION_ZIP_PASS '+JSON.stringify({
  folders:4,slidePngs:24,files:36,dimensions:[1080,1350],approvedOnly:true,
  manualInstagram:true,textOnlyFallback:true
 }));

 await clean.close();

// An independent clean browser has chat-approved text, but NO visual approval.
const reviewCtx=await browser.newContext({acceptDownloads:true,viewport:{width:1200,height:900}});
try{
 const review=await reviewCtx.newPage();
 await review.goto(origin+'/#persona',{waitUntil:'domcontentloaded'});
 await review.getByTestId('persona-weekly-calendar').locator('[data-calendar-item-id="PHOTO-001"]')
  .getByRole('button',{name:/Начать работу/}).click();
 const gate=review.getByTestId('persona-editorial-studio');
 await gate.getByRole('button',{name:'Все темы ↖'}).click();
 await gate.getByTestId('open-publication-package').click();
 const row=gate.locator('[data-publish-carousel-id="carousel-baseline-pause"]');
 assert.equal(await row.getByRole('button',{name:'Скачать пакет'}).isDisabled(),true);
 await row.getByRole('status').getByText('Оформление не утверждено. Посмотрите PNG и подтвердите').waitFor();
 await row.getByRole('button',{name:'Утвердить оформление'}).click();
 assert.equal(await row.getByRole('button',{name:'Скачать пакет'}).isEnabled(),true);
 const packed=await downloadZip(review,row.getByRole('button',{name:'Скачать пакет'}),
  join(artifacts,'chat-author-reviewed-baseline.zip'));
 assert.equal(packed.length,9);packed.slice(0,6).forEach(assertPng);
 console.log('PERSONA_CHAT_TEXT_ONLY_DESIGN_GATE_PASS');
}finally{await reviewCtx.close()}

 assert.deepEqual(errors,[]);
 console.log('PERSONA_P0_FULL_BROWSER_PASS '+JSON.stringify({
  publicPngBrandFree:true,carouselPngs:4,photoPngs:1,
  cleanCaptions:true,originalPhotosRestored:2,editorialPostsRestored:2,
  storiesRestored:1,reexportAfterRestore:true,researchCarouselPngs:6
 }));
}finally{await browser.close()}
