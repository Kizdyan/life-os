#!/usr/bin/env node
/** Browser E2E: sourced Persona carousel draft → author evidence review → real PNG ZIP.
 * No paid provider, user media or live publication. This is an eight-slide synthetic fixture only. It must not be reported as verified real-world sources or approved artwork. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const origin=process.env.PERSONA_PREVIEW_URL||'http://127.0.0.1:4173';
const artifacts=resolve('artifacts/persona-research-browser');
await mkdir(artifacts,{recursive:true});
const packet={
 title:'Что делает звук в кино',
 angle:'Редакторский тест работы с фактами и источниками',
 caption:'Тестовая подпись без настоящей публикации.',
 slides:[
  {text:'Первый проверяемый тезис\n\nПодробность объясняет, почему это важно зрителю.\n\nНебольшой авторский акцент.',sources:[{title:'Источник A',url:'https://example.org/a'}]},
  {text:'Второе проверяемое утверждение',sources:[{title:'Источник B',url:'https://example.org/b'}]},
  {text:'Третий новый факт',sources:[{title:'Источник C',url:'https://example.org/c'}]},
  {text:'Четвёртый факт',sources:[{title:'Источник D',url:'https://example.org/d'}]},
  {text:'Авторский вывод без фактических утверждений',interpretation:true},
  {text:'Пятая независимая деталь',sources:[{title:'Источник E',url:'https://example.org/e'}]},
  {text:'Шестая независимая деталь',sources:[{title:'Источник F',url:'https://example.org/f'}]},
  {text:'Неожиданное заключительное наблюдение',sources:[{title:'Источник G',url:'https://example.org/g'}]}
 ]
};
function unzipEntries(buf){
 const entries=[];let i=0;
 while(i+30<=buf.length&&buf.readUInt32LE(i)===0x04034b50){
  const size=buf.readUInt32LE(i+18),nl=buf.readUInt16LE(i+26),el=buf.readUInt16LE(i+28);
  const at=i+30+nl+el;
  assert.ok(at+size<=buf.length,'Truncated ZIP content');
  entries.push({name:buf.subarray(i+30,i+30+nl).toString('utf8'),bytes:buf.subarray(at,at+size)});
  i=at+size;
 }
 return entries;
}
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin+'/#persona',{waitUntil:'domcontentloaded'});
 const chooser=page.getByTestId('editorial-topic-chooser');
 await chooser.waitFor({timeout:25000});
 const intake=chooser.getByTestId('editorial-research-import');
 await intake.locator('summary').click();
 await intake.locator('textarea').fill(JSON.stringify(packet));
 await intake.getByRole('button',{name:'Импортировать как черновик'}).click();
 const editor=page.getByTestId('persona-editorial-studio');
 await editor.getByTestId('editorial-post-workflow').waitFor({timeout:15000});
 await editor.getByRole('button',{name:'Утвердить тему'}).click();
 const approve=editor.getByRole('button',{name:'Утвердить тексты и подпись'});
 const reviews=editor.getByTestId('editorial-source-review');
 assert.equal(await approve.isDisabled(),true,'No citation is automatically reviewed');
 for(let i=0;i<7;i++)await reviews.getByRole('checkbox',{name:'Проверено по оригиналу'}).nth(i).check();
 assert.equal(await approve.isDisabled(),true,'Public title/caption not reviewed');
 await reviews.getByTestId('research-public-copy-review').check();
 assert.equal(await approve.isEnabled(),true,'All evidence is now manually reviewed');
 await editor.getByRole('button',{name:'Слайд 2'}).click();
 await editor.getByLabel('Текст выбранного слайда').fill('Изменённый текст — требуется повторная проверка');
 assert.equal(await approve.isDisabled(),true,'Changing a claim invalidates its earlier approval');
 assert.equal(await reviews.getByRole('checkbox',{name:'Проверено по оригиналу'}).nth(1).isChecked(),false);
 await reviews.getByRole('checkbox',{name:'Проверено по оригиналу'}).nth(1).check();
 assert.equal(await approve.isEnabled(),true);
 await approve.click();
 const preview=editor.getByTestId('research-exact-preview');
 await preview.waitFor({timeout:20000});
 const dimensions=await preview.evaluate(async img=>{
  await img.decode();return [img.naturalWidth,img.naturalHeight];
 });
 assert.deepEqual(dimensions,[1080,1350],'Exact preview is a real exported-resolution PNG');
 const checklist=editor.getByTestId('carousel-acceptance-checklist');
 for(let i=1;i<=6;i++)await checklist.getByRole('checkbox',{name:'Пункт '+i}).check();
 assert.equal(await checklist.getByRole('checkbox',{name:'Пункт 7'}).isChecked(),true);
 await editor.getByRole('button',{name:'Утвердить оформление'}).click();
 const file=join(artifacts,'research-fixture.zip');
 const pending=page.waitForEvent('download',{timeout:45000});
 await editor.getByRole('button',{name:'Скачать ZIP с PNG и подписью'}).click();
 const download=await pending;await download.saveAs(file);
 const entries=unzipEntries(await readFile(file));
 assert.equal(entries.filter(e=>/^slide-\d\d\.png$/.test(e.name)).length,8);
 assert.ok(entries.some(e=>e.name==='research-sources.json'));
 const caption=entries.find(e=>e.name==='caption.txt');
 assert.equal(caption?.bytes.toString('utf8'),packet.caption);
 for(const entry of entries.filter(e=>e.name.endsWith('.png'))){
  assert.ok(entry.bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
  assert.equal(entry.bytes.readUInt32BE(16),1080);
  assert.equal(entry.bytes.readUInt32BE(20),1350);
 }
 // Real 8-slide contact sheet from exported Persona PNG bytes (not a CSS mock).
 const thumbs=entries.filter(e=>/^slide-\d\d\.png$/.test(e.name)).sort((a,b)=>a.name.localeCompare(b.name))
  .map(e=>e.bytes.toString('base64'));
 const sheet=await page.evaluate(async pngs=>{
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=2160;
  const c=canvas.getContext('2d');if(!c)throw Error('Contact sheet Canvas unavailable');
  c.fillStyle='#121417';c.fillRect(0,0,1080,2160);
  await Promise.all(pngs.map(async(b64,i)=>{
   const image=new Image();image.src='data:image/png;base64,'+b64;await image.decode();
   const x=132+(i%2)*416,y=8+Math.floor(i/2)*540;
   c.drawImage(image,x,y,400,500);
   c.font='24px sans-serif';c.textAlign='center';c.fillStyle='#e9e2d5';
   c.fillText(String(i+1).padStart(2,'0'),x+200,y+528);
  }));
  return canvas.toDataURL('image/png').split(',')[1];
 },thumbs);
 await writeFile(join(artifacts,'persona-research-eight-contact-sheet.png'),Buffer.from(sheet,'base64'));
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
 assert.equal(overflow,false,'390px viewport must not overflow horizontally');
 assert.deepEqual(errors,[],'No browser runtime errors');
 await page.screenshot({path:join(artifacts,'reviewed-research-mobile.png'),fullPage:true,animations:'disabled'});
 console.log('PERSONA_RESEARCH_BROWSER_E2E_PASS '+JSON.stringify({slides:8,pngSize:'1080x1350',sources:7,viewport:390}));
}finally{await browser.close()}
