#!/usr/bin/env node
/** Real Chromium: five user video lessons become persistent, actionable work
 * in existing Persona; content and reference data survive a clean-profile ZIP restore.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const origin=process.env.PERSONA_PREVIEW_URL||'http://127.0.0.1:4173';
const artifacts=resolve('artifacts/persona-reference-workflows');
await mkdir(artifacts,{recursive:true});
function entries(buf){
 const out=[];let at=0;
 while(at+30<=buf.length&&buf.readUInt32LE(at)===0x04034b50){
  const size=buf.readUInt32LE(at+18),n=buf.readUInt16LE(at+26),e=buf.readUInt16LE(at+28),
   start=at+30+n+e;
  out.push({name:buf.subarray(at+30,at+30+n).toString('utf8'),bytes:buf.subarray(start,start+size)});
  at=start+size;
 }return out;
}
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:1280,height:920},acceptDownloads:true});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/#persona',{waitUntil:'domcontentloaded'});
 const lab=page.getByTestId('persona-reference-lab');
 await lab.waitFor({timeout:25000});
 assert.equal(await lab.locator('.personaReferenceSources').evaluate(x=>x.open),false);
 await lab.getByText('Что перенесено из 5 видео').click();
 assert.equal(await lab.locator('.personaReferenceSources article').count(),5);
 await lab.getByLabel('Тема', {exact:true}).fill('Почему актёрская пауза меняет смысл');
 await lab.getByLabel('Проверенные находки, наблюдения и ограничения автора')
  .fill('Реальный источник должен быть проверен до публикации');
 await lab.getByLabel('Ссылка на источник').fill('https://about.fb.com/news/2024/12/trial-reels-try-content-non-followers-first-see-what-perfoms-best/');
 await lab.getByLabel('Что подтверждает').fill('Meta описывает пробные Reels и первые метрики');
 await lab.getByRole('button',{name:'Добавить источник'}).click();
 assert.match(await lab.textContent(),/Не проверено/);
 await lab.getByRole('button',{name:'Не проверено'}).click();
 assert.match(await lab.textContent(),/Отмечено как проверенное автором/);
 // A real editorial project is created from the researcher, not a parallel fake editor.
 await lab.getByRole('button',{name:'Создать карусель-черновик'}).click();
 const editorial=page.getByTestId('persona-editorial-studio');
 await editorial.locator('[data-testid="editorial-post-workflow"]').waitFor();
 assert.match(await editorial.textContent(),/Почему актёрская пауза/);
 await editorial.getByRole('button',{name:'Утвердить тему'}).click();
 assert.match(await editorial.textContent(),/Основной текст/);
 // Change of source does not make the generated copy automatically approved.
 assert.equal(await editorial.getByRole('button',{name:'Утвердить тексты и подпись'}).isDisabled(),true);
 await lab.getByText('02 · Пакетное производство').click();
 await lab.getByLabel(/Темы, по одной/).fill('Роль без костюма\nМузыка вместо диалога');
 await lab.getByRole('button',{name:'Сформировать очередь идей'}).click();
 assert.equal(await lab.locator('.personaReferenceQueue>div').count(),2);
 await lab.getByText('03 · Trial Reels').click();
 await lab.getByLabel('Название экспериментального ролика').fill('Пять разных первых секунд');
 await lab.getByRole('button',{name:'Создать 5 гипотез первых секунд'}).click();
 assert.equal(await lab.locator('.personaReferenceVariant').count(),5);
 await lab.getByLabel('views V1').fill('100');
 await lab.getByLabel('shares V1').fill('3');
 await lab.getByLabel('views V2').fill('200');
 await lab.getByLabel('shares V2').fill('2');
 assert.match(await lab.textContent(),/V1: 3%/);
 await lab.getByText('04 · Съёмка в Blackmagic Camera').click();
 await lab.getByLabel('Кодек').selectOption('prores');
 assert.match(await lab.textContent(),/ProRes может быть недоступен/);
 await lab.getByText('05 · Claude Code + Edits').click();
 assert.match(await lab.textContent(),/Windows: используем существующий FFmpeg/);
 await lab.getByLabel('На каком компьютере выполняется монтаж?').selectOption('mac');
 assert.match(await lab.textContent(),/Edits Desktop MCP доступен/);
 await lab.getByLabel('На каком компьютере выполняется монтаж?').selectOption('windows');
 await page.screenshot({path:join(artifacts,'five-lessons-desktop.png'),fullPage:true,animations:'disabled'});
 // Full backup must INCLUDE research, trials and capture settings, not silently skip them.
 await page.getByText('Сохранность контента · резервная копия').click();
 const backup=page.getByRole('region',{name:'Резервная копия Persona'});
 const pending=page.waitForEvent('download',{timeout:45000});
 await backup.getByRole('button',{name:'Сохранить полный архив ZIP'}).click();
 const downloaded=await pending,archive=join(artifacts,'persona-five-lessons-backup.zip');
 await downloaded.saveAs(archive);
 const zip=entries(await readFile(archive));
 const manifest=JSON.parse(zip.find(f=>f.name==='persona-backup.json').bytes.toString('utf8'));
 assert.equal(manifest.referenceLab.topic,'Почему актёрская пауза меняет смысл');
 assert.equal(manifest.referenceLab.sources.length,1);
 assert.equal(manifest.referenceLab.batch.length,2);
 assert.equal(manifest.referenceLab.trials.length,1);
 assert.equal(manifest.referenceLab.trials[0].variants.length,5);
 assert.equal(manifest.referenceLab.capture.codec,'prores');
 assert.ok(manifest.editorial.posts.some(x=>x.origin==='researched-topic'&&x.approvals.topic));
 assert.equal(manifest.referenceLab.trials[0].variants.every(x=>x.state==='draft'),true);
 // Restore in second independent Chromium context, confirming not just localStorage labels.
 const clean=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
 const restored=await clean.newPage();
 await restored.goto(origin+'/#persona',{waitUntil:'domcontentloaded'});
 await restored.getByText('Сохранность контента · резервная копия').click();
 const ui=restored.getByRole('region',{name:'Резервная копия Persona'});
 await ui.getByLabel('Выбрать резервный архив Persona').setInputFiles(archive);
 await ui.getByRole('button',{name:'Восстановить из архива'}).click();
 await ui.getByText(/ZIP восстановлен/).waitFor({timeout:30000});
 await restored.reload({waitUntil:'domcontentloaded'});
 const model=await restored.evaluate(()=>{
  const research=JSON.parse(localStorage.getItem('lifeos:persona:reference-workflows:v1')||'{}');
  const editor=JSON.parse(localStorage.getItem('lifeos:persona:editorial-posts:v1')||'{}');
  return {research,editor};
 });
 assert.equal(model.research.topic,'Почему актёрская пауза меняет смысл');
 assert.equal(model.research.batch.length,2);
 assert.equal(model.research.trials[0].variants.length,5);
 assert.equal(model.research.capture.codec,'prores');
 assert.ok(model.editor.posts.some(x=>x.origin==='researched-topic'));
 await restored.getByTestId('persona-reference-lab').waitFor();
 await restored.screenshot({path:join(artifacts,'five-lessons-restored-mobile.png'),
  fullPage:true,animations:'disabled'});
 await clean.close();
 assert.deepEqual(errors,[]);
 console.log('PERSONA_REFERENCE_WORKFLOWS_BROWSER_PASS '+JSON.stringify({
  sourceVideos:5,researchedCarousel:true,batchIdeas:2,trialVariants:5,
  cameraProfilePersisted:true,macEditsGuard:true,windowsFallback:true,
  fullZipRestoredInCleanBrowser:true,mobile:true
 }));
}finally{await browser.close()}
