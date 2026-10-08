import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const url = 'https://life-os-persona-prototype.onrender.com';
const expected = process.env.EXPECTED_HEAD || process.env.GITHUB_SHA;
const passcode = process.env.PROTOTYPE_ACCESS_CODE;
assert(expected && /^[a-f0-9]{40}$/.test(expected), 'exact HEAD required');
assert(passcode, 'prototype automation access secret required');
await mkdir('artifacts/persona-iphone', { recursive: true });
const sleep = (ms) => new Promise(resolve=>setTimeout(resolve,ms));
let ready=false, html='';
for(let i=0;i<30;i++){
 const r=await fetch(url+'/?acceptance='+Date.now(),{signal:AbortSignal.timeout(15000),cache:'no-store'});
 assert(r.ok, 'prototype frontend HTTP '+r.status);
 html=await r.text();
 if(html.includes('life-os-build') && html.includes(expected)){ready=true;break;}
 await sleep(10000);
}
assert(ready,'Render prototype exact HEAD not deployed: '+expected);
console.log('PASS Render frontend exact HEAD '+expected);
const asset=html.match(/src=["']([^"']*\/assets\/index-[^"']+\.js)["']/)?.[1];
assert(asset,'bundle path missing');
const js=await (await fetch(new URL(asset,url))).text();
assert(js.includes('life-os-runtime-prototype-v3'),'prototype frontend not using V3 Edge');
console.log('PASS v3 Edge target in live bundle');

for (const [engine,browserType] of [['chromium',chromium],['webkit',webkit]]) {
  const browser=await browserType.launch({headless:true});
  try{
    for(const width of [320,390]){
      const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
      const errors=[];
      page.on('pageerror',e=>errors.push(String(e.message)));
      await page.goto(url+'/?mobile_acceptance='+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
      await page.locator('.sleepWindows button').first().waitFor({state:'visible',timeout:25000});
      const boxes=await page.locator('.sleepWindows button').evaluateAll(buttons=>buttons.map(x=>{
        const r=x.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height};
      }));
      const region=await page.locator('.sleepWindows').evaluate(x=>{const r=x.getBoundingClientRect();return {left:r.left,right:r.right}});
      const full=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
      assert(boxes.length>=5,engine+' '+width+' missing time intervals');
      for(const [idx,b] of boxes.entries()){
        assert(b.w>=80&&b.h>=42,engine+' '+width+' chip '+idx+' too small');
        assert(b.x>=region.left-1&&b.right<=region.right+1,engine+' '+width+' chip '+idx+' clipped');
        for(const [j,c] of boxes.entries())if(j>idx){
          const dx=Math.max(0,Math.min(b.right,c.right)-Math.max(b.x,c.x));
          const dy=Math.max(0,Math.min(b.bottom,c.bottom)-Math.max(b.y,c.y));
          assert(dx*dy<0.5,engine+' '+width+' chips '+idx+'/'+j+' overlap');
        }
      }
      assert(full.scroll<=full.viewport+2,engine+' '+width+' horizontal page overflow '+JSON.stringify(full));
      await page.screenshot({path:'artifacts/persona-iphone/sleep-'+engine+'-'+width+'.png',fullPage:false});
      console.log('PASS sleep chips '+engine+' '+width+'px no clipping/overlap/horizontal overflow');
      if(width===390){
        await page.locator('.mainNav').getByText('Ещё',{exact:true}).click();
        await page.locator('.moreSheet').getByRole('button',{name:'Контент'}).click();
        const input=page.locator('input[type="password"]');
        if(await input.isVisible({timeout:15000}).catch(()=>false)){
          await input.fill(passcode);
          await page.getByRole('button',{name:'Подключить и проанализировать'}).click();
        }
        await page.locator('.todayIdea h3').waitFor({state:'visible',timeout:30000});
        const idea=await page.locator('.todayIdea h3').innerText();
        assert(idea.includes('Одна фраза'),engine+' no real signed FREE_ONLY recommendation visible');
        await page.getByRole('button',{name:'Берём — открыть съёмку'}).click();
        const build=page.getByRole('button',{name:/Сделать материал|Открыть съёмочное задание/});
        await build.click();
        await page.locator('.shootScreen').waitFor({state:'visible',timeout:30000});
        await page.locator('.shootScreen .shotCard').waitFor({state:'visible'});
        assert(await page.locator('.shootScreen .shootSetup').getByText(/Вертикально 9:16/).count(), 'brief technical setup missing');
        await page.screenshot({path:'artifacts/persona-iphone/shooting-'+engine+'-'+width+'.png',fullPage:false});
        assert(errors.length===0,engine+' unhandled browser errors: '+errors.join(','));
        console.log('PASS '+engine+' iPhone UI signed FREE_ONLY → Берём → HTTP shooting brief; no browser errors');
      }
      await page.close();
    }
  }finally{await browser.close();}
}
console.log('READY_MOBILE_ACCEPTANCE_PROTOTYPE_PASS');
