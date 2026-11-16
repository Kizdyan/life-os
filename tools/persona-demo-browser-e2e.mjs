#!/usr/bin/env node
/** Real-browser smoke: seed demo on link visit, open card and display all scenes. */
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright';

const origin=process.env.PERSONA_PREVIEW_URL||'http://127.0.0.1:4173';
const output=resolve(process.env.PERSONA_DEMO_SCREENSHOT_DIR||'artifacts/persona-demo');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:width===390?844:900},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/#persona/demo',{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('.personaProjectList .personaCreativeCard').first().waitFor({timeout:20000});
  const demo=page.getByTestId('persona-creative-card').filter({hasText:'ДЕМО · Между клавишами и камерой'});
  assert.equal(await demo.count(),1,'demo card should appear automatically after visiting link');
  await demo.getByRole('button',{name:/Продолжить сценарий/}).waitFor();
  const before=await page.evaluate(()=>{
   const collection=JSON.parse(localStorage.getItem('lifeos:persona:projects:v1')||'null');
   return collection?.projects.filter(project=>project.id==='persona-demo-three-scenes-v1');
  });
  assert.equal(before?.length,1,'demo must be saved exactly once in browser storage');
  assert.equal(before[0].stage,'strategy');
  assert.equal(before[0].scenarioWorkspace.script.currentRevision.beats.length,3);
  assert.equal(before[0].shootingPlan.materials.shotList.length,3);
  assert.equal(before[0].shootingPlan.statuses.READY_FOR_SHOOT,'pending');
  await page.screenshot({path:join(output,'demo-project-list-'+width+'.png'),fullPage:true,animations:'disabled'});
  await demo.getByRole('button',{name:/Продолжить сценарий/}).click();
  await page.locator('.personaPreparationStudio').waitFor({timeout:20000});
  await page.getByRole('button',{name:/Открыть аниматик/}).click();
  await page.locator('.personaPreparationSceneList li').first().waitFor();
  assert.equal(await page.locator('.personaPreparationSceneList li').count(),3);
  await page.screenshot({path:join(output,'demo-storyboard-'+width+'.png'),fullPage:true,animations:'disabled'});
  await page.reload({waitUntil:'domcontentloaded'});
  const after=await page.evaluate(()=>{
   const collection=JSON.parse(localStorage.getItem('lifeos:persona:projects:v1')||'null');
   return collection?.projects.filter(project=>project.id==='persona-demo-three-scenes-v1');
  });
  assert.equal(after?.length,1,'demo must survive reload without duplication');
  assert.deepEqual(errors,[],'no uncaught UI errors expected');
  console.log('PASS: demo card, script, 3 shots, animatic and reload at '+width+'px');
  await page.close();
 }
}finally{await browser.close()}
