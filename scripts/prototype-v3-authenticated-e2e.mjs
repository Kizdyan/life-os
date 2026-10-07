// Live prototype-only authenticated E2E. Never prints passcode or session token.
const endpoint = process.env.PROTOTYPE_EDGE_URL || 'https://zhehdbhpkcucgcjwuhxm.supabase.co/functions/v1/life-os-runtime-prototype-v3';
const frontend = process.env.PROTOTYPE_FRONTEND_URL || 'https://life-os-persona-prototype.onrender.com';
const passcode = process.env.PROTOTYPE_ACCESS_CODE;
if (!passcode) { console.error('E2E_BLOCKED: PROTOTYPE_ACCESS_CODE missing'); process.exit(2); }
const assert = (ok, message) => { if (!ok) throw new Error(message); };
async function post(body) {
  const r = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(120000) });
  const data = await r.json().catch(()=>({}));
  return {status:r.status,data};
}
try {
  const expectedHead = process.env.GITHUB_SHA || '';
  let html = '';
  for (let attempt = 0; attempt < 18; attempt++) {
    const response = await fetch(frontend+'/?e2e='+Date.now(),{signal:AbortSignal.timeout(30000),cache:'no-store'});
    assert(response.ok,'frontend unavailable HTTP '+response.status);
    html = await response.text();
    if (html.includes('life-os-build') && (!expectedHead || html.includes(expectedHead))) break;
    if (attempt===17) throw Error('frontend exact-head deploy not live');
    await new Promise(resolve=>setTimeout(resolve,10000));
  }
  console.log('PASS frontend exact-head build identity');
  const asset = html.match(/src=["']([^"']*\/assets\/index-[^"']+\.js)["']/)?.[1];
  assert(asset,'frontend JS asset missing');
  const js = await (await fetch(new URL(asset,frontend))).text();
  assert(js.includes('life-os-runtime-prototype-v3'),'live frontend does not target v3');
  console.log('PASS frontend exact runtime target v3');
  const login=await post({op:'login',passcode});
  assert(login.status===200 && login.data.authenticated===true && typeof login.data.token==='string','login failed HTTP '+login.status);
  console.log('PASS login');
  const token=login.data.token;
  const status=await post({op:'status',token});
  assert(status.status===200 && status.data.authenticated===true,'authenticated status failed HTTP '+status.status);
  console.log('PASS status authenticated');
  const recommendation=await post({op:'persona',token,payload:{action:'recommend',context:{profession:['actor','musician'],availableMinutes:15,solo:true},history:[],priorIdeas:[]}});
  assert(recommendation.status===200,'recommend failed HTTP '+recommendation.status+' '+String(recommendation.data.error||''));
  const rec=recommendation.data.recommendation;
  assert(rec && recommendation.data.degraded===false,'non-actionable/degraded recommendation');
  assert(Number(rec.qualityVerdict?.score)>=80,'quality score below 80');
  assert(Number(rec.estimatedMinutes)>=5 && Number(rec.estimatedMinutes)<=15,'shoot minutes outside 5-15');
  assert(Number(rec.estimatedDurationSeconds)>=15 && Number(rec.estimatedDurationSeconds)<=30,'duration outside 15-30');
  assert(Array.isArray(rec.marketEvidence) && rec.marketEvidence.some(e=>e.source&&e.finding&&e.url&&e.asOf),'missing market evidence');
  console.log('PASS recommendation + server quality fields');
  const shoot=await post({op:'persona',token,payload:{action:'shooting',idea:rec}});
  assert(shoot.status===200,'shooting failed HTTP '+shoot.status+' '+String(shoot.data.error||''));
  const b=shoot.data.brief;
  for(const key of ['title','orientation','resolution','audio','lighting','background']) assert(String(b?.[key]||'').trim(),'missing brief '+key);
  assert(Number.isFinite(Number(b.fps)) && Array.isArray(b.shots) && b.shots.length>0,'invalid brief shots/fps');
  for(const s of b.shots) for(const key of ['id','purpose','shotSize','angle','cameraPosition','cameraHeight','distance','composition','movement','action']) assert(String(s[key]||'').trim(),'missing shot '+key);
  console.log('PASS Take -> shooting brief, '+b.shots.length+' shots');
  console.log('E2E_PASS');
} catch(e) { console.error('E2E_FAIL:',e.message); process.exitCode=1; }
