#!/usr/bin/env node
/**
 * Browser acceptance test for Comparison Studio V1.
 * Uses actual FFmpeg-generated MP4 files and the real React UI in Chrome or WebKit.
 * No direct mutations of localStorage or React internals.
 *
 * Prerequisites: running Vite app and playwright-core (CI installs it transiently).
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {chromium,webkit} from 'playwright-core';
import {createColorVariants} from './persona-color-variants.mjs';
import {inspectPersonaComparisonPackage} from './persona-comparison-quality.mjs';

const baseUrl=process.env.E2E_URL??'http://127.0.0.1:4173';
const artifacts=resolve(process.env.E2E_ARTIFACTS??'artifacts/persona-comparison-e2e');
const browserPath=process.env.CHROME_PATH||undefined;
const browserKind=process.env.E2E_BROWSER??'chromium';
if(browserKind!=='chromium'&&browserKind!=='webkit')throw Error('Unsupported E2E_BROWSER: '+browserKind);
const browserLabel=browserKind==='webkit'?'WebKit (Linux; simulated mobile viewport)':'Chrome';
const summary={name:'persona-comparison-v1',browser:browserLabel,source:'real synthetic FFmpeg MP4',steps:[],passed:false,errors:[]};
function step(name){summary.steps.push(name);process.stdout.write('PASS '+name+'\n')}
async function command(name,args){
 return await new Promise((done,fail)=>{
  const child=spawn(name,args,{shell:false,windowsHide:true,stdio:['ignore','ignore','pipe']});
  let stderr='';
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-10000)});
  child.on('error',fail);
  child.on('close',code=>code===0?done():fail(Error(name+' exited '+code+': '+stderr)));
 });
}
async function sourceMp4(path,frequency){
 await command('ffmpeg',['-v','error','-y','-f','lavfi','-i',
  'testsrc2=size=320x568:rate=30:duration=2',
  '-f','lavfi','-i','sine=frequency='+frequency+':sample_rate=48000:duration=2',
  '-c:v','libx264','-threads','2','-preset','veryfast','-pix_fmt','yuv420p',
  '-c:a','aac','-shortest',path]);
}
function fileSet(manifest){
 return [manifest.source.path,...manifest.variants.map(v=>v.path),
  join(resolve(manifest.source.path,'..'),'COMPARISON.json')];
}
async function waitForImport(page,word){
 await page.getByRole('status').filter({hasText:word}).first().waitFor({state:'visible',timeout:45000});
}
async function openComparison(page){
 await page.getByRole('navigation',{name:'Этапы производства'})
  .getByRole('button',{name:/Монтаж/}).click();
 await page.getByRole('region',{name:'Persona Comparison Studio'}).waitFor();
 return page.getByRole('region',{name:'Persona Comparison Studio'});
}
async function checkNoOverflow(page){
 const overflow=await page.evaluate(()=>{
  const client=document.documentElement.clientWidth;
  return {
   client,
   scroll:document.documentElement.scrollWidth,
   offenders:Array.from(document.querySelectorAll('body *')).map(element=>{
    const box=element.getBoundingClientRect();
    return {
     node:element.tagName.toLowerCase(),
     className:typeof element.className==='string'?element.className.slice(0,100):'',
     right:Math.round(box.right),left:Math.round(box.left),
     width:Math.round(box.width),
    };
   }).filter(box=>box.width>0&&box.right>client+2)
    .sort((a,b)=>b.right-a.right).slice(0,12),
  };
 });
 assert.ok(overflow.scroll<=overflow.client+2,'horizontal overflow: '+JSON.stringify(overflow));
}

let browser,page,root;
try{
 await mkdir(artifacts,{recursive:true});
 root=await mkdtemp(join(tmpdir(),'persona-comparison-e2e-'));
 const original=join(root,'original.mp4'),second=join(root,'second-original.mp4');
 await sourceMp4(original,440);
 const first=await createColorVariants({inputPath:original,outputDir:join(root,'comparison-1')});
 assert.equal(first.variants.length,3);
 const qcPath=join(root,'comparison-qc.json');
 const qc=await inspectPersonaComparisonPackage({comparisonDir:join(root,'comparison-1'),outputPath:qcPath});
 assert.equal(qc.technicalStatus,'pass');
 assert.equal(qc.publicationApproved,false);
 step('FFmpeg created source, three actual MP4 variants, manifest and original-vs-grade QC');

 browser=browserKind==='webkit'
  ?await webkit.launch({headless:true})
  :await chromium.launch({headless:true,executablePath:browserPath,args:['--no-sandbox']});
 const context=await browser.newContext(browserKind==='webkit'
  ?{viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,acceptDownloads:false}
  :{viewport:{width:1280,height:860},acceptDownloads:false});
 page=await context.newPage();
 page.on('pageerror',error=>summary.errors.push(error.message));
 await page.goto(baseUrl+'/#persona',{waitUntil:'domcontentloaded',timeout:45000});
 await page.getByRole('button',{name:'Создать Reels'}).click();
 const comparison=await openComparison(page);
 assert.equal(await comparison.count(),1,'Comparison Studio should not be duplicated in DOM');
 step('Created a Reels project and opened a single Comparison Studio panel');

 await comparison.getByLabel('Выбрать оригинал, три MP4 и COMPARISON.json')
  .setInputFiles(fileSet(first));
 await waitForImport(page,'SHA-256 оригинала и трёх вариантов подтверждены');
 await comparison.getByLabel('Выбрать технический QC-отчёт').setInputFiles(qcPath);
 await waitForImport(page,'Технический QC загружен');
 await comparison.locator('[aria-label="Технический QC"]').getByText(/Технический QC: PASS/).waitFor();
 assert.equal(await comparison.locator('[aria-label="Технический QC"] li').count(),3);
 await comparison.getByText(/анализ мерцания \(12 кадр\/с\): выполнен/).first().waitFor();
 step('Browser imported and displayed SHA-bound technical QC without artistic approval');
 assert.equal(await comparison.locator('video').count(),2);
 // Checking two <video> nodes alone does not prove the browser can decode or play them.
 // Exercise the native HTMLVideoElement pipeline on real FFmpeg-generated media.
 for(const [index,label] of [[0,'original'],[1,'Natural Clean']]){
  const player=comparison.locator('video').nth(index);
  await player.evaluate(async video=>{
   if(video.readyState<1)await new Promise((ok,fail)=>{
    const timer=setTimeout(()=>fail(Error('video metadata timeout')),12000);
    video.addEventListener('loadedmetadata',()=>{clearTimeout(timer);ok()},{once:true});
    video.addEventListener('error',()=>{clearTimeout(timer);fail(Error('video decode error'))},{once:true});
   });
   if(video.videoWidth!==320||video.videoHeight!==568||!Number.isFinite(video.duration)||video.duration<1)
    throw Error('unexpected real MP4 metadata');
   video.muted=true;
   await video.play();
  });
  await page.waitForFunction(index=>{
   const video=document.querySelectorAll('.personaComparisonVideos video')[index];
   return video instanceof HTMLVideoElement&&video.currentTime>=0.2;
  },index,{timeout:12000});
  await player.evaluate(video=>video.pause());
  step(browserLabel+' decoded and played '+label+' MP4');
 }
 await comparison.getByRole('button',{name:'Warm Cinematic'}).click();
 const warm=comparison.getByLabel('Обработанное видео');
 await warm.evaluate(async video=>{
  video.muted=true;
  await video.play();
 });
 await page.waitForFunction(()=>{
  const video=document.querySelector('.personaComparisonVideos video[aria-label="Обработанное видео"]');
  return video instanceof HTMLVideoElement&&video.currentTime>=0.2;
 },null,{timeout:12000});
 await warm.evaluate(video=>video.pause());
 step(browserLabel+' played the selected Warm Cinematic MP4');
 await comparison.getByRole('textbox',{name:'Комментарий к выбору'})
  .fill('Тест: естественный оттенок кожи, без изменения лица');
 await comparison.getByRole('button',{name:/Сохранить выбор: Warm Cinematic/}).click();
 await waitForImport(page,'Авторский выбор сохранён в проекте');
 await comparison.getByText(/Автор выбрал Warm Cinematic/).waitFor();
 await comparison.getByText(/История художественных решений \(1\)/).waitFor();
 await page.screenshot({path:join(artifacts,'desktop-warm-cinematic.png'),fullPage:true});
 step('Imported five SHA-verified files and saved Warm Cinematic through UI');

 await page.reload({waitUntil:'domcontentloaded'});
 const afterReload=await openComparison(page);
 await afterReload.getByText(/Автор выбрал Warm Cinematic/).waitFor();
 await afterReload.locator('p').filter({hasText:'Комментарий: Тест: естественный оттенок кожи'}).waitFor();
 assert.equal(await afterReload.locator('video').count(),0,'MP4s must not survive reload as browser assets');
 assert.equal(await afterReload.getByRole('button',{name:/Сохранить выбор/}).isDisabled(),true);
 assert.equal(await afterReload.getByRole('textbox',{name:'Комментарий к выбору'}).isDisabled(),true);
 step('Reload restored author choice without pretending MP4 bytes are persisted');

 await afterReload.getByLabel('Выбрать оригинал, три MP4 и COMPARISON.json')
  .setInputFiles(fileSet(first));
 await waitForImport(page,'Те же файлы подтверждены повторно');
 await afterReload.getByText(/Автор выбрал Warm Cinematic/).waitFor();
 assert.equal(await afterReload.locator('video').count(),2);
 step('Reimported the same five files, retained the SHA-bound choice and restored players');

 // A rejected import must not erase a previously verified author choice or its players.
 const picker=afterReload.getByLabel('Выбрать оригинал, три MP4 и COMPARISON.json');
 await picker.setInputFiles(fileSet(first).slice(0,4));
 await waitForImport(page,'Импорт отклонён: Выберите ровно пять файлов');
 await afterReload.getByText(/Автор выбрал Warm Cinematic/).waitFor();
 assert.equal(await afterReload.locator('video').count(),2);
 step('Incomplete reimport was rejected without losing the saved decision');

 // Keep the four genuine MP4s, but forge the source hash inside COMPARISON.json.
 // The UI must independently hash real file bytes and refuse the forged manifest.
 const fakeManifest={...first,source:{...first.source,sha256:'0'.repeat(64)}};
 const forgedFolder=join(root,'forged-manifest');
 await mkdir(forgedFolder);
 const forgedPath=join(forgedFolder,'COMPARISON.json');
 await writeFile(forgedPath,JSON.stringify(fakeManifest));
 await picker.setInputFiles([...fileSet(first).slice(0,4),forgedPath]);
 await waitForImport(page,'Импорт отклонён: Comparison Studio: original MP4 SHA-256 differs from manifest');
 await afterReload.getByText(/Автор выбрал Warm Cinematic/).waitFor();
 assert.equal(await afterReload.locator('video').count(),2);
 step('Forged SHA-256 manifest was rejected without clobbering author choice');

 // A PASS must never force approval: author can attach a problem to a
 // timestamp, reject every grade with a reason, and keep it after reload.
 await afterReload.getByText('Зафиксировать замечание по текущему кадру').click();
 await afterReload.getByRole('textbox',{name:'Комментарий к кадру'}).fill('Skin cast around the opening frame');
 await afterReload.getByRole('button',{name:'Сохранить наблюдение на текущем таймкоде'}).click();
 await waitForImport(page,'Замечание по кадру сохранено');
 await afterReload.getByText(/Замечания по кадрам \(1\)/).waitFor();
 await afterReload.getByRole('textbox',{name:'Комментарий к выбору'})
  .fill('All three grades need more natural skin tones');
 await afterReload.getByRole('button',{name:'Отклонить все три обработки'}).click();
 await waitForImport(page,'Все три варианта отклонены автором');
 await afterReload.getByText(/Автор отклонил все три обработки/).waitFor();
 step('Author independently rejected all grades with a reason despite technical PASS');

 await page.reload({waitUntil:'domcontentloaded'});
 const rejectedReload=await openComparison(page);
 await rejectedReload.getByText(/Автор отклонил все три обработки/).waitFor();
 await rejectedReload.getByText(/Замечания по кадрам \(1\)/).waitFor();
 assert.equal(await rejectedReload.locator('video').count(),0);
 step('Reload persisted both rejection and timecoded note without persisting media bytes');

 await sourceMp4(second,880);
 const next=await createColorVariants({inputPath:second,outputDir:join(root,'comparison-2')});
 await rejectedReload.getByLabel('Выбрать оригинал, три MP4 и COMPARISON.json')
  .setInputFiles(fileSet(next));
 await waitForImport(page,'SHA-256 оригинала и трёх вариантов подтверждены');
 await rejectedReload.getByText(/Ожидает решения автора/).waitFor();
 assert.equal(await rejectedReload.getByText(/Автор отклонил все три обработки/).count(),0);
 assert.equal(await rejectedReload.getByText(/Замечания по кадрам \(1\)/).count(),0);
 assert.equal(await rejectedReload.locator('[aria-label="Технический QC"]').count(),0,
  'QC imported for the previous SHA must disappear when a different media package is imported');
 assert.equal(await rejectedReload.getByText(/Автор выбрал Warm Cinematic/).count(),0);
 step('Different source SHA invalidated the earlier author choice');

 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:join(artifacts,'mobile-comparison.png'),fullPage:true});
 await checkNoOverflow(page);
 step(browserLabel+' mobile 390px comparison has no horizontal overflow');

 await rejectedReload.getByRole('button',{name:/Сохранить выбор: Natural Clean/}).click();
 await waitForImport(page,'Авторский выбор сохранён в проекте');
 await page.reload({waitUntil:'domcontentloaded'});
 const finalReview=await openComparison(page);
 await finalReview.getByText(/Автор выбрал Natural Clean/).waitFor();
 assert.equal(summary.errors.length,0,'Browser errors: '+summary.errors.join('; '));
 await page.screenshot({path:join(artifacts,'desktop-or-mobile-reviewed.png'),fullPage:true});
 step(browserLabel+' restored the second source choice; browser pageerror count is zero');

 summary.passed=true;
}catch(error){
 summary.errors.push(error instanceof Error?error.stack||error.message:String(error));
 if(page){
  try{await page.screenshot({path:join(artifacts,'failure.png'),fullPage:true})}catch{}
 }
 process.stderr.write('Persona Comparison E2E FAILED: '+String(error?.stack||error)+'\n');
 process.exitCode=1;
}finally{
 try{await mkdir(artifacts,{recursive:true});await writeFile(join(artifacts,'report.json'),JSON.stringify(summary,null,2)+'\n')}catch{}
 if(browser)await browser.close();
 if(root)await rm(root,{recursive:true,force:true});
}
