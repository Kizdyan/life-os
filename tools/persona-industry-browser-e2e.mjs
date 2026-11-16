#!/usr/bin/env node
/** Actual Chromium: actor and music-sync routes, persistence, PDF and screenshots. */
import assert from 'node:assert/strict';
import {mkdir,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright';

const origin=process.env.PERSONA_PREVIEW_URL||'http://127.0.0.1:4173';
const directory=resolve(process.env.PERSONA_INDUSTRY_SCREENSHOT_DIR||'artifacts/persona-industry-portfolios');
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin+'/#persona/actor-portfolio',{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'Художественная визитка'}).waitFor();
 await page.getByRole('button',{name:'Собрать сценарий, раскадровку и свет'}).click();
 const story=page.getByRole('region',{name:'Сценарий художественной визитки'});
 await story.waitFor();
 assert.equal(await story.locator('.personaIndustryShots article').count(),6);
 assert.match(await story.innerText(),/45 SEC/);
 assert.match(await story.innerText(),/контровой/);
 assert.match(await story.innerText(),/Match Cut/);
 await page.screenshot({path:join(directory,'actor-portfolio-1440.png'),fullPage:true,animations:'disabled'});
 const edit=page.getByRole('textbox',{name:'Реплика P01'});
 await edit.fill('Я хочу вернуть твоё доверие.');
 await page.getByRole('button',{name:'Сохранить правки'}).click();
 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:/Художественная визитка · Проба/}).click();
 assert.equal(await page.getByRole('textbox',{name:'Реплика P01'}).inputValue(),'Я хочу вернуть твоё доверие.');

 await page.goto(origin+'/#persona/music-sync',{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'Музыка для лицензирования'}).waitFor();
 await page.getByRole('textbox',{name:'Название трека'}).fill('Тема для кинодрамы');
 await page.getByRole('textbox',{name:'Жанр'}).fill('Кинодрама');
 await page.getByRole('textbox',{name:'Настроение'}).fill('Тревожное');
 await page.getByRole('textbox',{name:'Владелец прав'}).fill('Автор композиции');
 await page.getByRole('textbox',{name:'Ссылка на трек'}).fill('https://example.com/music/demo');
 await page.getByRole('button',{name:'Сохранить трек в локальную базу'}).click();
 await page.getByRole('heading',{name:'Каталог треков (1)'}).waitFor();
 const inDb=await page.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('lifeos-persona-music-sync',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  return new Promise((resolve,reject)=>{const tx=db.transaction('tracks','readonly'),r=tx.objectStore('tracks').getAll();r.onsuccess=()=>{db.close();resolve(r.result)};r.onerror=()=>reject(r.error)});
 });
 assert.equal(inDb.length,1);
 assert.equal(inDb[0].rightsStatus,'unverified');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'Каталог треков (1)'}).waitFor();
 await page.screenshot({path:join(directory,'music-sync-1440.png'),fullPage:true,animations:'disabled'});
 await page.evaluate(()=>{window.__personaPrintCalled=false;window.print=()=>{window.__personaPrintCalled=true}});
 await page.getByRole('button',{name:'PDF-пакет с треками и ссылками'}).click();
 assert.equal(await page.evaluate(()=>window.__personaPrintCalled),true);
 await page.pdf({path:join(directory,'music-sync-real-print.pdf'),format:'A4',printBackground:true});
 const pdf=await stat(join(directory,'music-sync-real-print.pdf'));
 assert.ok(pdf.size>3000,'real PDF should contain styles and Unicode text');
 await page.close();

 const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
 await mobile.goto(origin+'/#persona/actor-portfolio',{waitUntil:'domcontentloaded'});
 await mobile.getByRole('heading',{name:'Художественная визитка'}).waitFor();
 await mobile.screenshot({path:join(directory,'actor-portfolio-390.png'),fullPage:true,animations:'disabled'});
 await mobile.goto(origin+'/#persona/music-sync',{waitUntil:'domcontentloaded'});
 await mobile.getByRole('heading',{name:'Музыка для лицензирования'}).waitFor();
 await mobile.screenshot({path:join(directory,'music-sync-390.png'),fullPage:true,animations:'disabled'});
 assert.deepEqual(errors,[]);
 console.log('PASS actor 6 shots, real persistence, local IndexedDB catalog, browser print action, real A4 PDF, mobile screenshots');
}finally{await browser.close()}
