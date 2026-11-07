import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {analyze,parseCSV} from './persona-marketing-audit.mjs';
import {planExperiments,toMarkdown,run} from './persona-experiment-planner.mjs';
const csv='id,format,impressions,views,watch_seconds,likes,comments,shares,saves,profile_visits,inquiries,production_minutes\nA,reel,1000,500,4500,30,4,5,6,20,2,60\nB,reel,1000,600,5000,20,3,2,5,15,1,60\nC,reel,1000,700,6000,25,4,3,6,25,3,60\nD,photo,200,100,0,2,0,0,0,0,,30\n';
test('creates three production briefs without approving publishing',()=>{
 const plan=planExperiments(analyze(parseCSV(csv)));
 assert.equal(plan.experiments.length,3);
 assert.equal(plan.inputs.productionMinutesPerWeek,240);
 assert.equal(plan.experiments[0].maxProductionMinutes,80);
 assert.equal(plan.publicationApproved,false);
 assert.equal(plan.externalActionsPerformed,0);
 assert.equal(plan.evidence.observedLeader,'reel');
 assert.equal(plan.evidence.formatComparisons.find(x=>x.format==='photo').eligibleForComparison,false);
 assert.match(toMarkdown(plan),/производственный план/);
});
test('insufficient or missing data does not imply winning format',()=>{
 const plan=planExperiments(analyze([{id:'a',format:'reel',views:'100',impressions:'200'}]));
 assert.equal(plan.evidence.observedLeader,null);
 assert.match(plan.evidence.warning,/No format meets/);
});
test('rejects invalid budget and untrusted report schema',()=>{
 const report=analyze(parseCSV(csv));
 assert.throws(()=>planExperiments(report,{weeklyPosts:0}),/weeklyPosts/);
 assert.throws(()=>planExperiments(report,{productionMinutesPerWeek:-1}),/budget/);
 assert.throws(()=>planExperiments({...report,status:'PUBLISHED'}),/Expected/);
});
test('writes production plan artifacts without external side effects',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-experiments-'));
 try{
  const input=join(dir,'input.json'),output=join(dir,'out');
  await writeFile(input,JSON.stringify(analyze(parseCSV(csv))));
  const result=await run({input,output,weeklyPosts:2,productionMinutesPerWeek:100});
  assert.equal(result.experiments,2);
  const plan=JSON.parse(await readFile(join(output,'persona-experiment-plan.json'),'utf8'));
  assert.equal(plan.experiments[0].maxProductionMinutes,50);
  assert.equal(plan.status,'DRAFT_NOT_PUBLISHED');
  assert.match(await readFile(join(output,'persona-experiment-plan.md'),'utf8'),/съёмки/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
