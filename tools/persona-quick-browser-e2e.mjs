#!/usr/bin/env node
/** Real Chromium one-click flow with real FFmpeg and injectable test-only model.
 * No user footage, no third-party API calls or fabricated model PASS claims.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,rm,stat,copyFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createPersonaMediaWorker} from './persona-media-worker.mjs';

const origin=process.env.PERSONA_PREVIEW_URL||'http://127.0.0.1:4173';
const output=resolve(process.env.PERSONA_QUICK_SCREENSHOT_DIR||'artifacts/persona-one-click');
await mkdir(output,{recursive:true});
const temp=await mkdtemp(join(tmpdir(),'persona-one-click-browser-'));
const source=join(temp,'browser-source.mp4');
const generated=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i',
 'testsrc2=size=192x320:rate=24:duration=15','-f','lavfi','-i','sine=frequency=440:duration=15',
 '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest','-y',source],
 {encoding:'utf8',timeout:60000});
assert.equal(generated.status,0,generated.stderr);
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const original=hash(await readFile(source));
const second=join(temp,'IMG_8303.mp4');
await copyFile(source,second); // a second distinct named input, synthetic bytes only
let plannerCalls=0,styleDirectorCalls=0;
const worker=createPersonaMediaWorker({
 port:47832,outputRoot:join(temp,'media-worker'),quickRenderRoot:join(temp,'jobs'),
 quickStyleDirector:async({frames,jpegs})=>{
  styleDirectorCalls++;
  assert.ok(frames.length>=3&&frames.length<=5);
  assert.equal(frames.length,jpegs.length);
  assert.ok(jpegs.every(frame=>frame[0]===0xff&&frame[1]===0xd8));
  return {mood:'funny',reason:'Visible lively framing and upbeat visual rhythm'};
 },
 quickPlanner:async({candidates,frames})=>{
  plannerCalls++;
  assert.ok(frames.length>=2&&frames[0].subarray(0,2).equals(Buffer.from([0xff,0xd8])));
  const secondCandidate=candidates.find(candidate=>candidate.fileIndex===1);
  assert.ok(secondCandidate,'both uploaded files must supply verified candidate frames');
  return {stylePack:'Commercial',creativeIntent:'Actor reaction to object detail',
   choices:[{candidateId:candidates[0].id,role:'actor',caption:'КОГДА ВСЁ МЕНЯЕТСЯ'},
            {candidateId:secondCandidate.id,role:'broll',caption:'ОДНА ПАУЗА'}]};
 },
 quickStrategy:async()=>({status:'WARNING',recommendation:'Усилить актёрскую реакцию на последнем крупном плане'}),
 quickLighting:async()=>({style:'Quiet Luxury',key:'45°',fill:'по необходимости',back:'контровой при драме'}),
 ollamaModel:'none-for-this-integration-test'
});
const port=await worker.start();assert.equal(port,47832);
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin+'/#persona',{waitUntil:'domcontentloaded'});
 const block=page.getByTestId('persona-quick-auto-render');
 await block.waitFor({timeout:20000});
 assert.equal(await block.locator('textarea').count(),1);
 assert.equal(await block.locator('input[type=file]').count(),1);
 assert.equal(await block.locator('select').count(),0,'manual style is hidden by default');
 assert.equal(await block.locator('#persona-quick-auto-style').isChecked(),true,'AI Auto Style defaults on');
 assert.equal(await block.locator('#persona-quick-fast-draft').isChecked(),true,'Fast Draft defaults on');
 await block.locator('#persona-quick-auto-style').uncheck();
 assert.equal(await block.locator('select').count(),2,'manual color and title selects appear when AI is disabled');
 await page.locator('#persona-quick-style').selectOption('signature-gold');
 await page.locator('#persona-quick-color').selectOption('SoftCinematic');
 await block.locator('#persona-quick-auto-style').check();
 assert.equal(await block.locator('select').count(),0,'manual selectors disappear when AI re-enabled');
 await page.screenshot({path:join(output,'before-1440.png'),fullPage:true,animations:'disabled'});
 await page.locator('#persona-quick-files').setInputFiles([source,second]);
 assert.match(await page.locator('#persona-quick-prompt').inputValue(),/если Vision доступен/,'one click must work without typing a brief');
 await block.getByRole('button',{name:/Сделать всё/}).click();
 const job=block.locator('[data-quick-status="completed"]');
 await job.waitFor({timeout:210000});
 await job.getByText('Готов к скачиванию').waitFor();
 assert.match(await job.textContent(),/Detail Cinematic/);
 assert.doesNotMatch(await job.textContent(),/PRODUCTIONJOB/);
 const dirs=(await readdir(join(temp,'jobs'))).filter(name=>name.startsWith('quick-'));
 assert.equal(dirs.length,1);
 const jobRoot=join(temp,'jobs',dirs[0]);
 const result=JSON.parse(await readFile(join(jobRoot,'output','RESULT.json'),'utf8'));
 const plan=JSON.parse(await readFile(join(jobRoot,'output','edit-plan.json'),'utf8'));
 const timeline=JSON.parse(await readFile(join(jobRoot,'output','edited.mp4.persona.json'),'utf8'));
 assert.equal(result.visualPreset,'DetailCinematic');
 assert.equal(result.fastDraft,true);
 assert.equal(result.renderProfile,'fast-draft');
 assert.equal(plannerCalls,1);
 assert.equal(result.stylePack,'Dynamic','AI mood should override Commercial model styling');
 assert.equal(result.styleChoice,'dynamic');
 assert.equal(result.subtitlePreset,'dynamic-interview');
 assert.equal(result.visualPreset,'DetailCinematic');
 assert.equal(result.autoStyle,true);
 assert.equal(result.styleDecision.mode,'test-injected');
 assert.equal(result.styleDecision.mood,'funny');
 assert.equal(styleDirectorCalls,1,'one Director call for the entire job');
 assert.equal(plan.styleDecision.mood,'funny');
 assert.equal(timeline.settings.visualPreset,'DetailCinematic');
 assert.deepEqual(plan.choices.map(c=>c.fileIndex),[0,1]);
 const download=job.getByRole('link',{name:'Скачать черновик 720p'});
 assert.equal(await download.count(),1);
 await page.screenshot({path:join(output,'ready-1440.png'),fullPage:true,animations:'disabled'});
 const pending=page.waitForEvent('download',{timeout:120000});
 await download.click();
 const file=await pending;
 assert.match(file.suggestedFilename(),/\.mp4$/);
 const destination=join(output,'real-one-click-qa.mp4');
 await file.saveAs(destination);
 assert.ok((await stat(destination)).size>20000);
 const check=spawnSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',destination],{encoding:'utf8'});
 assert.equal(check.status,0,check.stderr);
 const parsed=JSON.parse(check.stdout);
 assert.equal(parsed.streams.find(s=>s.codec_type==='video').width,720);
 assert.equal(parsed.streams.find(s=>s.codec_type==='video').height,1280);
 assert.ok(Number(parsed.format.duration)>7);
 assert.equal(hash(await readFile(source)),original,'original user media untouched');
 assert.equal(hash(await readFile(second)),original,'second source remains untouched');
 const promotion=job.getByRole('button',{name:'Сделать в полном качестве (1080p)'});
 await promotion.click();
 const fullLink=job.getByRole('link',{name:'Скачать MP4 в полном качестве (1080p)'});
 await fullLink.waitFor({timeout:240000});
 assert.equal(plannerCalls,1,'high-quality export does not call model or reselect moments');
 assert.equal(styleDirectorCalls,1,'full-resolution upgrade must not repeat mood selection');
 const receipt=JSON.parse(await readFile(join(jobRoot,'output','RESULT-FULL.json'),'utf8'));
 assert.equal(receipt.visionRequests,0);assert.equal(receipt.cloudCalls,0);
 assert.equal(receipt.reusedEditPlanSha256,result.editPlanSha256);
 const fullDownload=page.waitForEvent('download',{timeout:90000});
 await fullLink.click();
 const fullFile=await fullDownload;
 const fullDestination=join(output,'real-full-1080p-qa.mp4');
 await fullFile.saveAs(fullDestination);
 const fullProbe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_type,width,height','-of','json',fullDestination],{encoding:'utf8'});
 assert.equal(fullProbe.status,0,fullProbe.stderr);
 const fullVideo=JSON.parse(fullProbe.stdout).streams.find(stream=>stream.codec_type==='video');
 assert.equal(fullVideo.width,1080);assert.equal(fullVideo.height,1920);
 assert.equal(hash(await readFile(source)),original,'full render must not mutate source');

 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByTestId('persona-quick-auto-render').locator('[data-quick-status="completed"]').waitFor({timeout:15000});
 const mobile=await browser.newPage({viewport:{width:390,height:844}});
 await mobile.goto(origin+'/#persona',{waitUntil:'domcontentloaded'});
 await mobile.getByTestId('persona-quick-auto-render').waitFor({timeout:20000});
 await mobile.screenshot({path:join(output,'dashboard-390.png'),fullPage:true,animations:'disabled'});
 assert.deepEqual(errors,[]);
 await mobile.close();await page.close();
 console.log('PASS default-on AI Auto Style + manual toggle + Fast Draft and 1080p reuse; one Director decision, real FFmpeg MP4 downloads');
}finally{
 await browser.close();await new Promise(resolve=>worker.server.close(resolve));
 await rm(temp,{recursive:true,force:true});
}
