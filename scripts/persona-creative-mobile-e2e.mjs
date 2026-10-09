import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
mkdirSync("artifacts/persona-creative-v1",{recursive:true});
import {chromium,webkit} from "playwright";

const head=process.env.GITHUB_SHA;
const passcode=process.env.PROTOTYPE_ACCESS_CODE;
const frontend=process.env.CREATIVE_FRONTEND_URL||"http://127.0.0.1:4173";
const edge="https://zhehdbhpkcucgcjwuhxm.supabase.co/functions/v1/life-os-runtime-creative-v1";
assert(head?.length===40,"exact HEAD required");
assert(passcode,"authenticated test secret unavailable");
const body=async(token,payload)=>{
 const r=await fetch(edge,{method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({op:"persona",token,payload:{...payload,...(String(payload.action).startsWith("creative_")?{qaNamespace:"CI_V1"}:{})}}),signal:AbortSignal.timeout(30000)});
 return {status:r.status,data:await r.json().catch(()=>({}))};
};
const budget=async token=>body(token,{action:"budget_status"});
for(const [name,engine] of [["chromium",chromium],["webkit",webkit]]){
 const browser=await engine.launch();
 const selectionIndex=name==="webkit"?2:1;
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const errors=[];
  page.on("pageerror",e=>errors.push(String(e.message)));
  const initial=await page.goto(frontend+"/?creative_ci="+Date.now(),{waitUntil:"domcontentloaded"});
  assert(initial?.ok(),"preview frontend unavailable");
  const html=await initial.text();
  assert(html.includes(head),"frontend does not contain exact head "+head);
  await page.locator(".mainNav").getByText("Ещё",{exact:true}).click();
  await page.locator(".moreSheet").getByRole("button",{name:"Контент"}).click();
  const login=page.locator('input[type="password"]');
  if(await login.waitFor({state:"visible",timeout:12000}).then(()=>true).catch(()=>false)){
    await login.fill(passcode);
    await page.getByRole("button",{name:"Подключить и проанализировать"}).click();
  }
  await page.locator('.creativeV1[data-stage="idea"]').waitFor({timeout:30000});
  await page.locator(".creativeIdea").first().waitFor({timeout:30000});
  assert(await page.locator(".creativeStage").count()===1,"more than one workflow stage on screen");
  const stepLabels=await page.locator(".creativeProgress button").allInnerTexts();
  assert(stepLabels.every((x,i)=>x.includes(["Идея","Правки","Съёмка","Материалы","Монтаж"][i])),
    "five-step progress not present");
  for(const term of ["cached","confidence","provenance","revision","asset schema"]){
    const visible=await page.locator(".creativeStage").innerText();
    assert(!visible.toLowerCase().includes(term),"implementation leakage: "+term);
  }
  assert(await page.locator(".creativeIdea").count()===3,"not exactly 3 creative shortlist cards");
  for(const width of [320,375,390,430]){
    await page.setViewportSize({width,height:844});
    const metrics=await page.evaluate(()=>{
      const cards=[...document.querySelectorAll(".creativeIdea")];
      const buttons=cards.map(x=>x.querySelector("button.creativeSelect")?.getBoundingClientRect())
        .filter(Boolean).map(r=>({x:r.x,right:r.right,width:r.width,height:r.height,top:r.top}));
      const header=document.querySelector("main>header")?.getBoundingClientRect();
      return {scroll:document.documentElement.scrollWidth,viewport:innerWidth,
        headerTop:header?.top,buttons};
    });
    assert(metrics.scroll<=width+2,name+" "+width+" horizontal overflow "+JSON.stringify(metrics));
    assert(metrics.headerTop>=-1,name+" "+width+" header collides with safe area");
    assert(metrics.buttons.length===3,name+" "+width+" missing selectable ideas");
    for(const button of metrics.buttons){
      assert(button.width>=100&&button.height>=44&&button.x>=0&&button.right<=width+1,
        name+" "+width+" idea CTA collapsed or clipped "+JSON.stringify(button));
    }
    await page.screenshot({path:"artifacts/persona-creative-v1/"+name+"-"+width+"-shortlist.png"});
    console.log("PASS "+name+" "+width+"px idea CTA geometry and safe-area/overflow");
  }
  await page.setViewportSize({width:390,height:844});
  const titles=await page.locator(".creativeIdea h3").allInnerTexts();
  assert(new Set(titles).size===3,"shortlist alternatives not meaningfully distinct");
  const token=await page.evaluate(()=>localStorage.getItem("life-os:edge-session:v1"));
  assert(token,"real login session token missing");
  const before=await budget(token);
  assert(before.status===200,"budget status unavailable");
  const usage=JSON.stringify(before.data.usage||[]);
  let baseline=await body(token,{action:"creative_state"});
  assert(baseline.status===200,"initial creative state unavailable");
  const pending=baseline.data.items[selectionIndex].pending;
  if(pending){
    const recovered=await body(token,{action:"creative_discard_proposal",
      ideaId:baseline.data.items[selectionIndex].id,
      baseVersion:baseline.data.items[selectionIndex].currentVersion});
    assert(recovered.status===200,"stale QA proposal could not be discarded");
    await page.reload({waitUntil:"domcontentloaded"});
    await page.locator(".mainNav").getByText("Ещё",{exact:true}).click();
    await page.locator(".moreSheet").getByRole("button",{name:"Контент"}).click();
    await page.locator(".creativeIdea").first().waitFor({timeout:30000});
    baseline=await body(token,{action:"creative_state"});
    assert(!baseline.data.items[selectionIndex].pending,"pending approval recovery failed");
  }
  const baseVersion=baseline.data.items[selectionIndex].currentVersion;
  const targetVersion=baseVersion+1;
  // CI namespace is durable across runs; a repeated identical edit must be a no-op.
  // Use a new coherent ending per version, then repeat that SAME request to test idempotence.
  const qaEnding="В конце герой спокойно начинает новую сцену номер "+targetVersion+".";
  const qaInstruction="поменяй финал на "+qaEnding;
  await page.locator(".creativeIdea").nth(selectionIndex).getByRole("button",{name:"Выбрать"}).click();
  await page.locator('.creativeV1[data-stage="edit"]').waitFor({timeout:15000});
  assert(await page.locator(".creativeStage").count()===1,"Edit stage is not isolated");
  await page.getByRole("button",{name:/Обсудить с Эрикой/}).click();
  await page.locator("#creative-erika-input").fill(qaInstruction);
  await page.getByRole("button",{name:"Обсудить с Эрикой"}).click();
  await page.locator(".creativeProposal").waitFor({timeout:30000});
  assert(await page.locator(".creativeStage").count()===1,"proposal must not display other stages");
  assert((await page.locator(".creativeProposal").innerText()).includes("Моё мнение"),"no reasoned Erika assessment");
  await page.screenshot({path:"artifacts/persona-creative-v1/"+name+"-erika-proposed.png"});
  await page.getByRole("button",{name:"Применить"}).click();
  await page.locator(".creativeApplied").waitFor({timeout:30000});
  assert((await page.locator(".creativeApplied").innerText()).includes("Правка применена"),"missing visible applied+success UI");
  assert((await page.locator(".creativeApplied").innerText()).includes("Что изменилось"),"user cannot see applied change summary");
  await page.locator(".creativeApplied summary").click();
  assert((await page.locator(".creativeApplied").innerText()).includes("Стало"),"user cannot inspect detailed applied diff");
  await page.screenshot({path:"artifacts/persona-creative-v1/"+name+"-erika-applied.png"});
  const status=await body(token,{action:"creative_state"});
  assert(status.status===200,"creative state read failed");
  const selected=status.data.items[selectionIndex];
  assert(selected.currentVersion===targetVersion && selected.revisions.length>=2,"new revision not durably reapproved");
  assert(selected.revisions.at(-2).proof!==selected.revisions.at(-1).proof,"approval inherited after edit");
  assert(selected.revisions.at(-1).reason.includes("поменяй финал"),"edit reason not persisted");
  // Adversarial repeat: identical request must not produce another revision or duplicate ending.
  await page.getByRole("button",{name:/Обсудить с Эрикой/}).click();
  await page.locator("#creative-erika-input").fill(qaInstruction);
  await page.getByRole("button",{name:"Обсудить с Эрикой",exact:true}).click();
  await page.locator(".creativeErikaReply").getByText(/уже есть|уже внесена|лишнюю версию/).waitFor({timeout:30000});
  const unchanged=await body(token,{action:"creative_state"});
  assert(unchanged.data.items[selectionIndex].currentVersion===targetVersion,"duplicate edit created phantom version");
  assert(!unchanged.data.items[selectionIndex].pending,"identical edit created duplicate pending version");
  const currentScript=unchanged.data.items[selectionIndex].revisions.at(-1).idea.script;
  assert(currentScript.split(qaEnding).length-1===1,
    "ending concatenated instead of replaced exactly once");
  // A previously signed proof must be invalid for the new current idea revision.
  const old=await body(token,{action:"creative_start_session",ideaId:selected.id,
    version:targetVersion,approvalProof:selected.revisions.at(-2).proof,conditions:""});
  assert(old.status===409,"prior revision proof still actionable");
  const bad=await body(token,{action:"creative_start_session",ideaId:selected.id,
    version:targetVersion,approvalProof:"unsigned",conditions:""});
  assert(bad.status===409,"forged approval still actionable");
  await page.locator(".creativeTake").getByText(/Берём — к съёмке/).click();
  await page.locator('.creativeV1[data-stage="shoot"]').waitFor({timeout:30000});
  await page.getByText("Изменить условия съёмки").click();
  await page.locator("#creative-conditions").fill("нет штатива, плохой свет, снимаю один, есть 7 минут, дома");
  await page.getByRole("button",{name:"Подстроить съёмку"}).click();
  await page.locator(".creativeBrief").waitFor({timeout:30000});
  const readableBrief=await page.locator(".creativeBrief").innerText();
  for(const label of ["Что делать","Что сказать","Куда поставить iPhone","Дублей","Секунд","Свет"]){
    assert(readableBrief.includes(label),"simplified brief missing "+label);
  }
  assert(readableBrief.includes("окну"),"lighting was not adapted");
  await page.screenshot({path:"artifacts/persona-creative-v1/"+name+"-shooting.png"});
  assert(await page.locator(".creativeStage").count()===1,"Shoot stage is not isolated");
  await page.getByRole("button",{name:/Я снял — загрузить материалы/}).click();
  await page.locator('.creativeV1[data-stage="upload"]').waitFor({timeout:20000});
  assert(await page.locator(".creativeStage").count()===1,"Upload stage is not isolated");
  const uploadBounds=await page.locator(".creativePicker").evaluate(node=>{
    const r=node.getBoundingClientRect();const nav=document.querySelector(".mainNav")?.getBoundingClientRect();
    return {top:r.top,bottom:r.bottom,navTop:nav?.top,width:r.width};
  });
  assert(uploadBounds.width>=190,"upload CTA collapsed");
  const fileInput=page.locator('input[aria-label="Загрузить материал"]');
  await fileInput.setInputFiles({name:"take-ci.mov",mimeType:"video/quicktime",buffer:Buffer.from("CI sample media payload: only fake demo binary")});
  try {
    await page.locator(".creativeFeedback").getByText(/Загружено 1 файл/).waitFor({timeout:20000});
  } catch (failure) {
    const diagnostic = await page.evaluate(async () => {
      const error = document.querySelector(".creativeError")?.textContent || "";
      const feedback = document.querySelector(".creativeFeedback")?.textContent || "";
      const assetList = document.querySelector(".creativeAssets")?.textContent || "";
      let storage = "unknown";
      try {
        const req=indexedDB.open("persona-creative-media-v1",1);
        storage=await new Promise(resolve=>{
          req.onsuccess=()=>{const db=req.result;const tx=db.transaction("blobs","readonly");
            const total=tx.objectStore("blobs").count();
            total.onsuccess=()=>resolve("entries:"+total.result);
            total.onerror=()=>resolve("count_failed:"+total.error?.name);
            db.close();
          };
          req.onerror=()=>resolve("open_failed:"+req.error?.name);
        });
      } catch (e) {storage="exception:"+String(e)}
      return {error,feedback,assetList:assetList.slice(0,160),storage};
    });
    console.error("CREATIVE_INTAKE_DIAGNOSTIC",name,JSON.stringify(diagnostic));
    throw failure;
  }
  await page.locator(".creativeUploadStatus").getByText(/Загружено 1 файл/).waitFor({timeout:30000});
  const beforeReload=await page.evaluate(async()=>{
    const open=indexedDB.open("persona-creative-media-v1",2);
    const db=await new Promise((resolve,reject)=>{open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error)});
    try{
      const getAll=store=>new Promise((resolve,reject)=>{
        const req=db.transaction(store,"readonly").objectStore(store).getAll();
        req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
      });
      const records=await getAll("blobs"),chunks=await getAll("chunks");
      return {entries:records.length,chunks:chunks.length,record:records[0],byteLength:chunks.reduce((n,c)=>n+c.bytes.byteLength,0)};
    }finally{db.close();}
  });
  assert(beforeReload.entries>=1,"no committed IndexedDB asset manifest before reload");
  assert(beforeReload.chunks>=1,"no structured-clone ArrayBuffer chunks before reload");
  assert(beforeReload.byteLength>=20,"binary bytes not stored before reload");
  console.log("PASS "+name+" IDB committed manifests:"+beforeReload.entries+" chunks:"+beforeReload.chunks+" bytes:"+beforeReload.byteLength);
  const registered=await body(token,{action:"creative_state"});
  const item=registered.data.items[selectionIndex];
  assert(item.session?.assets.length>=1,"registered media manifest not durable");
  const media=item.session.assets[0];
  for(const key of ["projectId","contentItemId","ideaId","ideaVersion","sessionId","id"]){
    assert(media[key]!==undefined,"media lineage missing "+key);
  }
  assert(["primary_take","alternate_take"].includes(media.role),"video role not automatically inferred");
  assert(media.storage==="device_local"&&media.pipeline.takeScoring==="PENDING",
    "local-only pipeline state lied");
  const reject=await body(token,{action:"creative_register_asset",ideaId:item.id,
   version:targetVersion,approvalProof:item.revisions.at(-1).proof,
   asset:{...media,id:"otherfakeid00001",sessionId:"wrong-session"}});
  assert(reject.status===409,"asset cross-session provenance forgery accepted");
  await page.reload({waitUntil:"domcontentloaded"});
  await page.locator(".mainNav").getByText("Ещё",{exact:true}).click();
  await page.locator(".moreSheet").getByRole("button",{name:"Контент"}).click();
  await page.locator('.creativeV1[data-stage="upload"]').waitFor({timeout:30000});
  await page.locator(".creativeUploadStatus").getByText(/Загружено 1 файл/).waitFor({timeout:30000});
  const persisted=await page.evaluate(async()=>{
    const open=indexedDB.open("persona-creative-media-v1",2);
    const db=await new Promise((resolve,reject)=>{open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error)});
    try{
      const all=store=>new Promise((resolve,reject)=>{
        const req=db.transaction(store,"readonly").objectStore(store).getAll();
        req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
      });
      const records=await all("blobs"),chunks=await all("chunks");
      return {entries:records.length,chunks:chunks.length,bytes:chunks.reduce((n,c)=>n+c.bytes.byteLength,0)};
    }finally{db.close();}
  });
  assert(persisted.entries>=beforeReload.entries&&persisted.chunks>=beforeReload.chunks &&
    persisted.bytes>=beforeReload.byteLength,"WebKit/Chromium binary asset lost after Safari reload");
  console.log("PASS "+name+" IDB binary persisted AFTER RELOAD entries:"+persisted.entries+" chunks:"+persisted.chunks);
  await page.getByRole("button",{name:/Перейти к монтажу/}).click();
  await page.locator('.creativeV1[data-stage="assembly"]').waitFor({timeout:15000});
  assert(await page.locator(".creativeStage").count()===1,"Assembly placeholder not isolated");
  const assemblyText=await page.locator(".creativeStage").innerText();
  assert(assemblyText.includes("Монтаж ещё не собран"),"Future editing stage falsely claims an existing cut");
  await page.screenshot({path:"artifacts/persona-creative-v1/"+name+"-assembly.png"});
  // Physical sleep interaction: one pressed window, save confirmation, persisted after reload.
  await page.locator(".mainNav").getByText("Сегодня",{exact:true}).click();
  const sleepChoices=page.locator(".sleepWindows button");
  await sleepChoices.first().waitFor({state:"visible",timeout:20000});
  await sleepChoices.nth(1).click();
  const firstChoice=await sleepChoices.nth(1).innerText();
  await sleepChoices.nth(2).click();
  const expectedChoice=await sleepChoices.nth(2).innerText();
  assert(firstChoice!==expectedChoice,"sleep windows indistinguishable");
  assert(await page.locator('.sleepWindows button[aria-pressed="true"]').count()===1,"multiple sleep windows pressed");
  assert((await page.locator(".sleepSelectionSummary").innerText()).includes(expectedChoice),
    "sleep selected interval not visible");
  await page.getByRole("button",{name:"Сохранить сон и состояние"}).click();
  await page.locator(".sleepSavedConfirmation").waitFor({timeout:20000});
  assert((await page.locator(".sleepSavedConfirmation").innerText()).includes(expectedChoice),
    "sleep save does not confirm chosen interval");
  await page.reload({waitUntil:"domcontentloaded"});
  await page.locator(".sleepWindows button").first().waitFor({timeout:20000});
  assert(await page.locator('.sleepWindows button[aria-pressed="true"]').count()===1,
    "sleep selection missing or multiple after reload");
  assert((await page.locator(".sleepSelectionSummary").innerText()).includes(expectedChoice),
    "sleep interval lost after reload");
  console.log("PASS "+name+" sleep single selection + visible save + reload persistence");
  await page.screenshot({path:"artifacts/persona-creative-v1/"+name+"-sleep-saved.png"});
  const after=await budget(token);
  assert(JSON.stringify(after.data.usage||[])===usage,"FREE_ONLY spent AI budget");
  assert(errors.length===0,"browser JS error: "+errors.join("; "));
  console.log("PASS "+name+" iPhone 390px: 3 distinct ideas → Erika Critic → v2 signed revision → adaptive shooting → IDB+server intake → reload; stale proofs & forged assets rejected; AI ledger unchanged");
 }finally{await browser.close();}
}
console.log("CREATIVE_V1_MOBILE_E2E_PASS");
