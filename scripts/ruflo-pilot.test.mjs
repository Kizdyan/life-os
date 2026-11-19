import { test } from 'vitest';
import assert from 'node:assert/strict';
import { assessRufloPilotRequest, evaluateRufloAgainstBaseline } from '../packages/core/src/ruflo-pilot.ts';
import { review } from './ruflo-pilot-report.mjs';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const req = { experimentId:'ruflo-smoke', pinnedRuntimeVersion:'3.66.2', domain:'engineering', dataClass:'public',
  taskIds:['review-code','test-code'],taskDescription:'Synthetic code-quality fixture',
  fixtureOnly:true,containsSecrets:false,networkRequested:false,writesToUserWorkspace:false,
  changesProduction:false,risks:['read_only'],independentObserverAssigned:true,
  ownerApprovedThirdPartyExecution:false,rollbackDocumented:true,
  maxEstimatedCostUsd:1,maxDurationSeconds:90 };
const metrics = {runId:'baseline',independentObserver:'independent-qa',
  sourceSnapshotSha256:'a'.repeat(64),outputEvidenceSha256:'b'.repeat(64),
  measured:true,testCases:10,passedCases:9,criticalDefects:0,elapsedSeconds:100,costUsd:1,tokens:1000};

test('requires owner approval for third-party runtime',()=>{
  const d=assessRufloPilotRequest(req);assert.equal(d.status,'approval_required');assert.equal(d.mayExecute,false);
});
test('approved public sandbox creates plan but never executes or installs',()=>{
  const d=assessRufloPilotRequest({...req,ownerApprovedThirdPartyExecution:true});
  assert.equal(d.status,'sandbox_ready'); assert.equal(d.mayExecute,false);assert.equal(d.approvedInstall,false);
});
test('blocks real personal or internal data',()=>{
  for(const dataClass of ['internal','personal','restricted'])assert.equal(assessRufloPilotRequest({...req,dataClass}).status,'blocked');
});
test('blocks secret-bearing experiments',()=>assert.equal(assessRufloPilotRequest({...req,containsSecrets:true}).status,'blocked'));
test('blocks workspace, production or elevated risk',()=>{
  for(const override of [{writesToUserWorkspace:true},{changesProduction:true},{risks:['external']},{risks:['financial']}])
    assert.equal(assessRufloPilotRequest({...req,...override}).status,'blocked');
});
test('network access requires separate approval',()=>assert.equal(assessRufloPilotRequest({...req,ownerApprovedThirdPartyExecution:true,networkRequested:true}).status,'approval_required'));
test('blocks cost and runtime above limits',()=>{
  assert.equal(assessRufloPilotRequest({...req,maxEstimatedCostUsd:6}).status,'blocked');
  assert.equal(assessRufloPilotRequest({...req,maxDurationSeconds:601}).status,'blocked');
});
test('blocks missing independent QA and rollback',()=>{
  assert.equal(assessRufloPilotRequest({...req,independentObserverAssigned:false}).status,'blocked');
  assert.equal(assessRufloPilotRequest({...req,rollbackDocumented:false}).status,'blocked');
});
test('rejects noncomparable fixture snapshots',()=>{
  const r=evaluateRufloAgainstBaseline(metrics,{...metrics,runId:'pilot',sourceSnapshotSha256:'c'.repeat(64)});
  assert.equal(r.decision,'insufficient_evidence');
});
test('rejects unverified metrics and too few cases',()=>{
  assert.equal(evaluateRufloAgainstBaseline(metrics,{...metrics,runId:'pilot',measured:false}).decision,'insufficient_evidence');
  assert.equal(evaluateRufloAgainstBaseline(metrics,{...metrics,runId:'pilot',testCases:2,passedCases:2}).decision,'insufficient_evidence');
});
test('rejects regressions and critical defects',()=>{
  const r=evaluateRufloAgainstBaseline(metrics,{...metrics,runId:'pilot',passedCases:8,criticalDefects:1});
  assert.equal(r.decision,'reject');assert.equal(r.productionApproved,false);
});
test('permits expanding cheaper pilot without authorizing deployment',()=>{
  const r=evaluateRufloAgainstBaseline(metrics,{...metrics,runId:'pilot',elapsedSeconds:75,costUsd:.5});
  assert.equal(r.decision,'worth_expanding');assert.equal(r.productionApproved,false);
});
test('rejects no improvement and cost overruns',()=>{
  assert.equal(evaluateRufloAgainstBaseline(metrics,{...metrics,runId:'pilot'}).decision,'reject');
  assert.equal(evaluateRufloAgainstBaseline(metrics,{...metrics,runId:'pilot',costUsd:6,elapsedSeconds:70}).decision,'reject');
});

test('requires exact pinned Ruflo security-reviewed version',()=>{
  for(const version of ['latest','3.16.2','3.65.1','3.66.1','v3.66.2',''])
    assert.equal(assessRufloPilotRequest({...req,pinnedRuntimeVersion:version,ownerApprovedThirdPartyExecution:true}).status,'blocked');
});

test('does not mistake faster, cheaper, low-quality results for a useful agent',()=>{
  const weakBaseline={...metrics,passedCases:5};
  const fastButWeak={...metrics,runId:'ruflo-fast',passedCases:6,elapsedSeconds:25,costUsd:.1};
  const r=evaluateRufloAgainstBaseline(weakBaseline,fastButWeak);
  assert.equal(r.decision,'reject');
  assert.equal(r.productionApproved,false);
  assert.ok(r.reasons.some(reason=>reason.includes('90%')));
});

test('comparison requires real fixture/output files with matching SHA-256 bytes',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ruflo-evidence-'));
  const sha=x=>createHash('sha256').update(x).digest('hex');
  const data=[['fixture.json','synthetic fixture: 3 questions'],['baseline-output.json','9/10 correct'],['pilot-output.json','10/10 correct']];
  try {
    for(const [name,bytes] of data)await writeFile(join(dir,name),bytes);
    const [fixture,baseFile,pilotFile]=data.map(x=>join(dir,x[0]));
    const common={...metrics,sourceSnapshotSha256:sha(data[0][1])};
    const base={...common,outputEvidenceSha256:sha(data[1][1])};
    const pilot={...common,runId:'ruflo',passedCases:10,elapsedSeconds:72,
      outputEvidenceSha256:sha(data[2][1])};
    const baseJson=join(dir,'baseline.json'),pilotJson=join(dir,'pilot.json');
    await writeFile(baseJson,JSON.stringify(base));
    await writeFile(pilotJson,JSON.stringify(pilot));
    const args=[baseJson,pilotJson,fixture,baseFile,pilotFile];
    const ok=await review('compare',args);
    assert.equal(ok.artifactHashesVerified,true);
    assert.equal(ok.decision,'worth_expanding');
    await writeFile(pilotFile,'tampered output');
    const tampered=await review('compare',args);
    assert.equal(tampered.decision,'insufficient_evidence');
    assert.equal(tampered.artifactHashesVerified,false);
    await assert.rejects(review('compare',[baseJson,pilotJson]),/Usage/);
  } finally {
    await rm(dir,{recursive:true,force:true});
  }
});
