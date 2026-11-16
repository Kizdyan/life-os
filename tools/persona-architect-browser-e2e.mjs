#!/usr/bin/env node
/** Real browser: seed ten Architect Reels on explicit link and test every card. */
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright';

const origin=process.env.PERSONA_PREVIEW_URL||'http://127.0.0.1:4173';
const output=resolve(process.env.PERSONA_ARCHITECT_SCREENSHOT_DIR||'artifacts/persona-architect-10');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:width===390?844:900},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/#persona/seed10',{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('.personaProjectList').waitFor({timeout:25000});
  await page.getByText(/Загружено 10 сценариев Архитектора/).waitFor({timeout:15000});
  let state=await page.evaluate(()=>{
   const projects=JSON.parse(localStorage.getItem('lifeos:persona:projects:v1')||'null')?.projects||[];
   return projects.filter(p=>/^reel-(0[1-9]|10)$/.test(p.id)).map(p=>({
    id:p.id,title:p.title,stage:p.stage,step:p.lastOpenStep,
    script:p.scenarioWorkspace?.script?.currentRevision?.beats?.length,
    shots:p.shootingPlan?.materials?.shotList?.length,
    approval:p.shootingPlan?.statuses?.READY_FOR_SHOOT,
   }));
  });
  assert.equal(state.length,10,'Ten browser project records required');
  for(const [i,entry] of state.entries()){
   assert.equal(entry.id,'reel-'+String(i+1).padStart(2,'0'));
   assert.equal(entry.stage,'needs_assets');
   assert.equal(entry.step,'script');
   assert.equal(entry.script,5);
   assert.equal(entry.shots,5);
   assert.equal(entry.approval,'pending');
  }
  const cards=page.getByTestId('persona-creative-card');
  assert.equal(await cards.count(),10,'exactly ten cards required in isolated browser');
  await page.screenshot({path:join(output,'architect-10-cards-'+width+'.png'),fullPage:true,animations:'disabled'});
  const first=cards.filter({hasText:'Последняя сцена'});
  assert.equal(await first.count(),1);
  await first.getByRole('button',{name:/Продолжить сценарий/}).click();
  await page.locator('.personaPreparationStudio').waitFor({timeout:20000});
  await page.getByRole('button',{name:/Открыть аниматик/}).click();
  await page.locator('.personaPreparationSceneList').waitFor({timeout:15000});
  assert.equal(await page.locator('.personaPreparationSceneList li').count(),5);
  await page.screenshot({path:join(output,'architect-01-storyboard-'+width+'.png'),fullPage:true,animations:'disabled'});
  await page.getByRole('navigation',{name:'Пять этапов создания Reels'}).getByRole('button',{name:/Съёмка/}).click();
  await page.locator('.personaShootNow').waitFor({timeout:20000});
  const lightingToggle=page.getByRole('button',{name:'Схема света'});
  assert.equal(await lightingToggle.count(),1,'shoot screen must expose lighting planner');
  await lightingToggle.click();
  const lighting=page.getByRole('region',{name:'Планировщик света'});
  await lighting.waitFor({timeout:10000});
  assert.match(await lighting.innerText(),/Quiet Luxury/i);
  assert.match(await lighting.innerText(),/Рисующий \\/ Key/);
  assert.match(await lighting.innerText(),/Заполняющий \\/ Fill/);
  assert.match(await lighting.innerText(),/Контровой \\/ Back/);
  assert.match(await lighting.innerText(),/рояля/);
  await page.screenshot({path:join(output,'architect-01-lighting-'+width+'.png'),fullPage:true,animations:'disabled'});
  await page.goto(origin+'/#persona/seed10',{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('.personaProjectList').waitFor({timeout:15000});
  const repeat=await page.evaluate(()=>JSON.parse(localStorage.getItem('lifeos:persona:projects:v1')||'null')?.projects?.filter(p=>/^reel-(0[1-9]|10)$/.test(p.id)).length);
  assert.equal(repeat,10,'repeat import must be idempotent');
  assert.deepEqual(errors,[],'browser runtime errors detected');
  console.log('PASS: 10 real cards + status, 5 shots, script, animatic, idempotent reload at '+width+'px');
  await page.close();
 }
}finally{await browser.close()}
