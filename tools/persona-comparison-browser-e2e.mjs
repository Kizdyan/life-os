#!/usr/bin/env node
/**
 * Browser acceptance test for Comparison Studio V1.
 * Uses actual FFmpeg-generated MP4 files, the real React UI and a real Chrome.
 * No direct mutations of localStorage or React internals.
 *
 * Prerequisites: running Vite app and playwright-core (CI installs it transiently).
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright-core';
import {createColorVariants} from './persona-color-variants.mjs';

const baseUrl=process.env.E2E_URL??'http://127.0.0.1:4173';
const artifacts=resolve(process.env.E2E_ARTIFACTS??'artifacts/persona-comparison-e2e');
const browserPath=process.env.CHROME_PATH||undefined;
const summary={name:'persona-comparison-v1',browser:'Chrome',source:'real synthetic FFmpeg MP4',steps:[],passed:false,errors:[]};
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
 const overflow=await page.evaluate(()=>({
  client:document.documentElement.clientWidth,
  scroll:document.documentElement.scrollWidth,
 }));
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
 step('FFmpeg created source, three actual MP4 variants and manifest');

 browser=await chromium.launch({headless:true,executablePath:browserPath,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1280,height:860},acceptDownloads:false});
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
 assert.equal(await comparison.locator('video').count(),2);
 await comparison.getByRole('button',{name:'Warm Cinematic'}).click();
 await comparison.getByRole('textbox',{name:'Комментарий к выбору'})
  .fill('Тест: естественный оттенок кожи, без изменения лица');
 await comparison.getByRole('button',{name:/Сохранить выбор: Warm Cinematic/}).click();
 await waitForImport(page,'Авторский выбор сохранён в проекте');
 await comparison.getByText(/Автор выбрал Warm Cinematic/).waitFor();
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

 await sourceMp4(second,880);
 const next=await createColorVariants({inputPath:second,outputDir:join(root,'comparison-2')});
 await afterReload.getByLabel('Выбрать оригинал, три MP4 и COMPARISON.json')
  .setInputFiles(fileSet(next));
 await waitForImport(page,'SHA-256 оригинала и трёх вариантов подтверждены');
 await afterReload.getByText(/Ожидает решения автора/).waitFor();
 assert.equal(await afterReload.getByText(/Автор выбрал Warm Cinematic/).count(),0);
 step('Different source SHA invalidated the earlier author choice');

 await page.setViewportSize({width:390,height:844});
 await checkNoOverflow(page);
 await page.screenshot({path:join(artifacts,'mobile-comparison.png'),fullPage:true});
 step('Mobile 390px comparison has no horizontal overflow');

 await afterReload.getByRole('button',{name:/Сохранить выбор: Natural Clean/}).click();
 await waitForImport(page,'Авторский выбор сохранён в проекте');
 await page.reload({waitUntil:'domcontentloaded'});
 const finalReview=await openComparison(page);
 await finalReview.getByText(/Автор выбрал Natural Clean/).waitFor();
 assert.equal(summary.errors.length,0,'Browser errors: '+summary.errors.join('; '));
 await page.screenshot({path:join(artifacts,'desktop-or-mobile-reviewed.png'),fullPage:true});
 step('Second source author choice survived reload; browser pageerror count is zero');

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
