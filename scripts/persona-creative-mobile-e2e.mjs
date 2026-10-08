import assert from "node:assert/strict";
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
  await page.locator(".creativeIdea").first().waitFor({timeout:30000});
  assert(await page.locator(".creativeIdea").count()===3,"not exactly 3 creative shortlist cards");
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
  await page.locator(".creativeIdea").nth(selectionIndex).getByRole("button",{name:/Выбрать идею/}).click();
  await page.locator("#creative-erika-input").fill("Мне нравится идея 2, но поменяй финал");
  await page.getByRole("button",{name:"Обсудить с Эрикой"}).click();
  await page.locator(".creativeProposal").waitFor({timeout:30000});
  assert((await page.locator(".creativeProposal").innerText()).includes("Critic"),"no reasoned critic");
  await page.getByRole("button",{name:/Утверждаю v\d+/}).click();
  await page.waitForFunction((version)=>document.querySelector(".creativeEditor small")?.textContent?.includes("v"+version),targetVersion,{timeout:30000});
  const status=await body(token,{action:"creative_state"});
  assert(status.status===200,"creative state read failed");
  const selected=status.data.items[selectionIndex];
  assert(selected.currentVersion===targetVersion && selected.revisions.length>=2,"new revision not durably reapproved");
  assert(selected.revisions.at(-2).proof!==selected.revisions.at(-1).proof,"approval inherited after edit");
  assert(selected.revisions.at(-1).reason.includes("поменяй финал"),"edit reason not persisted");
  // A previously signed proof must be invalid for the new current idea revision.
  const old=await body(token,{action:"creative_start_session",ideaId:selected.id,
    version:targetVersion,approvalProof:selected.revisions.at(-2).proof,conditions:""});
  assert(old.status===409,"prior revision proof still actionable");
  const bad=await body(token,{action:"creative_start_session",ideaId:selected.id,
    version:targetVersion,approvalProof:"unsigned",conditions:""});
  assert(bad.status===409,"forged approval still actionable");
  await page.locator("#creative-conditions").fill("нет штатива, плохой свет, снимаю один, есть 7 минут, дома");
  await page.getByRole("button",{name:/Берём v\d+ — создать съёмку/}).click();
  await page.locator(".creativeBrief").waitFor({timeout:30000});
  assert((await page.locator(".creativeBrief").innerText()).includes("окну"),"lighting was not adapted");
  const fileInput=page.locator('input[aria-label="Загрузить материал"]');
  await fileInput.setInputFiles({name:"take-ci.mov",mimeType:"video/quicktime",buffer:Buffer.from("CI sample media payload: only fake demo binary")});
  try {
    await page.locator(".creativeFeedback").getByText(/Метаданные синхронизированы: 1/).waitFor({timeout:20000});
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
  await page.getByText(/Сохранённые исходники на этом iPhone: 1/).waitFor({timeout:30000});
  const registered=await body(token,{action:"creative_state"});
  const item=registered.data.items[selectionIndex];
  assert(item.session?.assets.length>=1,"registered media manifest not durable");
  const media=item.session.assets[0];
  for(const key of ["projectId","contentItemId","ideaId","ideaVersion","sessionId","id"]){
    assert(media[key]!==undefined,"media lineage missing "+key);
  }
  assert(media.storage==="device_local"&&media.pipeline.takeScoring==="PENDING",
    "local-only pipeline state lied");
  const reject=await body(token,{action:"creative_register_asset",ideaId:item.id,
   version:targetVersion,approvalProof:item.revisions.at(-1).proof,
   asset:{...media,id:"otherfakeid00001",sessionId:"wrong-session"}});
  assert(reject.status===409,"asset cross-session provenance forgery accepted");
  await page.reload({waitUntil:"domcontentloaded"});
  await page.locator(".mainNav").getByText("Ещё",{exact:true}).click();
  await page.locator(".moreSheet").getByRole("button",{name:"Контент"}).click();
  await page.locator(".creativeIdea").nth(selectionIndex).getByRole("button",{name:/Выбрать идею/}).click();
  await page.getByText(/Сохранённые исходники на этом iPhone: 1/).waitFor({timeout:30000});
  const after=await budget(token);
  assert(JSON.stringify(after.data.usage||[])===usage,"FREE_ONLY spent AI budget");
  assert(errors.length===0,"browser JS error: "+errors.join("; "));
  console.log("PASS "+name+" iPhone 390px: 3 distinct ideas → Erika Critic → v2 signed revision → adaptive shooting → IDB+server intake → reload; stale proofs & forged assets rejected; AI ledger unchanged");
 }finally{await browser.close();}
}
console.log("CREATIVE_V1_MOBILE_E2E_PASS");
