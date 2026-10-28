import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRemotionSkillReviewPacket,REMOTION_SKILL_PIN} from './remotion-skill-review.mjs';

const HASH='a'.repeat(64);
const files=Object.entries(REMOTION_SKILL_PIN.extensions).flatMap(([ext,count])=>
  Array.from({length:count},(_,i)=>({
    path:'folder/'+ext+'-'+i+'.'+ext,
    sizeBytes:1,sha256:HASH,
  })));
files[0].path='SKILL.md';
files[0].sizeBytes+=REMOTION_SKILL_PIN.bytes-files.length;
function fixture(extra={}) {
  return {
    schemaVersion:1,
    revisionVerified:true,
    verificationMethod:'pinned-local-git-tree-blob',
    sourceRevision:REMOTION_SKILL_PIN.commit,
    sourceSkillPath:REMOTION_SKILL_PIN.path,
    inventoryComplete:true,staticCheckPassed:true,
    scannedFiles:REMOTION_SKILL_PIN.files,
    totalBytes:REMOTION_SKILL_PIN.bytes,
    manifestSha256:HASH,bundleSha256:HASH,
    installationPerformed:false,executionPerformed:false,
    files,findings:[],
    ...extra,
  };
}
test('Exact synthetic attestation is still manual-review-only, never approval',()=>{
  const a=buildRemotionSkillReviewPacket(fixture());
  assert.equal(a.status,'manual_review_required');
  assert.equal(a.inventory.files,144);
  assert.equal(a.inventory.executableCodeFiles,20);
  assert.equal(a.mayInstallAutomatically,false);
  assert.equal(a.mayExecuteAutomatically,false);
  assert.equal(a.mayPublishAutomatically,false);
  assert.equal(a.reviewerApproved,false);
  assert.ok(a.checklist.length>=5);
});
test('Unpinned or mismatched checkout is blocked',()=>{
  assert.equal(buildRemotionSkillReviewPacket(fixture({revisionVerified:false})).status,'blocked');
  assert.equal(buildRemotionSkillReviewPacket(fixture({sourceRevision:'b'.repeat(40)})).status,'blocked');
  assert.equal(buildRemotionSkillReviewPacket(fixture({sourceSkillPath:'another/path'})).status,'blocked');
});
test('Packaged file count and byte length must match pinned tree',()=>{
  assert.equal(buildRemotionSkillReviewPacket(fixture({scannedFiles:143})).status,'blocked');
  assert.equal(buildRemotionSkillReviewPacket(fixture({totalBytes:REMOTION_SKILL_PIN.bytes+1})).status,'blocked');
});
test('Drift in file type counts and missing attestations blocks report',()=>{
  const modified=files.map(f=>({...f}));
  modified[1].path='folder/replaced.bin';
  assert.equal(buildRemotionSkillReviewPacket(fixture({files:modified})).status,'blocked');
  assert.equal(buildRemotionSkillReviewPacket(fixture({bundleSha256:null})).status,'blocked');
  assert.equal(buildRemotionSkillReviewPacket(fixture({files:[]})).status,'blocked');
});
test('Executable helper flag is for human review, not automatic install',()=>{
  const packet=buildRemotionSkillReviewPacket(fixture({
    staticCheckPassed:false,
    findings:[{path:'prep-geo.mjs',rule:'executable_helper_requires_review',severity:'review'}],
  }));
  assert.equal(packet.status,'manual_review_required');
  assert.equal(packet.inventory.manuallyFlagged,1);
  assert.deepEqual(packet.manualFindings[0],{
    path:'prep-geo.mjs',rule:'executable_helper_requires_review',severity:'review',
  });
  assert.equal(packet.reviewerApproved,false);
});
test('A blocking finding cannot be acknowledged away by this tool',()=>{
  assert.equal(buildRemotionSkillReviewPacket(fixture({
    staticCheckPassed:false,
    findings:[{path:'SKILL.md',rule:'remote_shell',severity:'block'}],
  })).status,'blocked');
});
test('Invalid findings, unverified prior execution and absent report are blocked',()=>{
  assert.equal(buildRemotionSkillReviewPacket(fixture({
    findings:[{path:'SKILL.md',rule:'unknown',severity:'safe'}],
  })).status,'blocked');
  assert.equal(buildRemotionSkillReviewPacket(fixture({executionPerformed:true})).status,'blocked');
  assert.equal(buildRemotionSkillReviewPacket(fixture({installationPerformed:true})).status,'blocked');
  assert.equal(buildRemotionSkillReviewPacket(null).status,'blocked');
});
