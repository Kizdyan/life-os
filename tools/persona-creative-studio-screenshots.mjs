#!/usr/bin/env node
/** Capture actual Vite UI at user-requested 390px/1440px. Never handles user media. */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';

const origin=process.env.PERSONA_PREVIEW_URL||'http://127.0.0.1:4173';
const dir=resolve(process.env.PERSONA_SCREENSHOT_OUTPUT_DIR||'artifacts/persona-creative-studio');
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 for(const width of [390,1440]){
  const height=width===390?844:900;
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  page.on('pageerror',error=>console.error('UI page error:',error.message));
  await page.goto(origin+'/#persona',{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('.personaCreativeHero').waitFor({timeout:20000});
  await page.screenshot({path:join(dir,'dashboard-empty-'+width+'.png'),fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:/Новый Reels/}).first().click();
  await page.locator('.personaCreativeWorkspace').waitFor({timeout:20000});
  await page.goto(origin+'/#persona',{waitUntil:'domcontentloaded',timeout:30000});
  const card=page.getByTestId('persona-creative-card').first();
  await card.waitFor({timeout:20000});
  await page.screenshot({path:join(dir,'dashboard-project-'+width+'.png'),fullPage:true,animations:'disabled'});
  await card.getByRole('button').click();
  await page.locator('.personaCreativeWorkspace').waitFor({timeout:20000});
  await page.screenshot({path:join(dir,'workspace-'+width+'.png'),fullPage:true,animations:'disabled'});
  if(width===390){
   const footer=await page.locator('.personaWorkspaceFooter').evaluate(element=>getComputedStyle(element).position);
   assert.equal(footer,'fixed','mobile production navigation must remain fixed at 390px');
  }
  console.log('captured actual Persona UI at '+width+'px');
  await page.close();
 }
}finally{await browser.close()}
