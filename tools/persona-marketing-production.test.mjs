import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildMarketingProductionPack} from './persona-marketing-production.mjs';
const csv='id,format,impressions,views,watch_seconds,likes,comments,shares,saves,profile_visits,inquiries,production_minutes\nA,reel,1000,500,4500,30,4,5,6,20,2,60\n';
test('one command creates traceable metrics and production pack without publishing',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-marketing-pack-'));
 try{
  const input=join(dir,'stats.csv'),output=join(dir,'pack');
  await writeFile(input,csv);
  const result=await buildMarketingProductionPack({input,output,weeklyPosts:2,productionMinutesPerWeek:120});
  assert.equal(result.status,'DRAFT_AWAITING_AUTHOR_APPROVAL');
  assert.equal(result.networkRequests,0);
  assert.equal(result.experiments,2);
  const manifest=JSON.parse(await readFile(join(output,'manifest.json'),'utf8'));
  assert.match(manifest.inputSha256,/^[a-f0-9]{64}$/);
  const plan=JSON.parse(await readFile(join(output,'production-plan.json'),'utf8'));
  assert.equal(plan.experiments[0].maxProductionMinutes,60);
  assert.equal(plan.publicationApproved,false);
  await assert.rejects(buildMarketingProductionPack({input,output}),/EEXIST/);
  assert.equal(await readFile(input,'utf8'),csv);
 }finally{await rm(dir,{recursive:true,force:true})}
});
