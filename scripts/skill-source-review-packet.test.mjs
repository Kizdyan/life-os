import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compileSkillSourceReviewPacket } from './skill-source-review-packet.mjs';
const base = () => ({ revisionVerified:true,verificationMethod:'pinned-local-git-tree-blob',
  upstreamPublisherAuthenticated:false,reviewerApproved:false,installationPerformed:false,executionPerformed:false,
  sourceRevision:'a'.repeat(40),sourceSkillPath:'skills/find-skills',bundleSha256:'b'.repeat(64),manifestSha256:'c'.repeat(64),
  files:[{path:'SKILL.md',sizeBytes:5,sha256:'c'.repeat(64)}],findings:[],scannedFiles:1,
  inventoryComplete:true,staticCheckPassed:true,totalBytes:5 });
describe('pinned evidence human review packet',()=>{
  it('never grants installation or execution even with clean verification',()=>{
    const p=compileSkillSourceReviewPacket(base());
    assert.equal(p.status,'manual_review_required');
    assert.equal(p.reviewerApproved,false);
    assert.equal(p.sourcePublisherAuthenticated,false);
    assert.equal(p.mayInstallAutomatically,false);
    assert.equal(p.mayExecuteAutomatically,false);
  });
  it('requires manual acknowledgement for unattended global install review finding',()=>{
    const p=compileSkillSourceReviewPacket({...base(),staticCheckPassed:false,findings:[{path:'SKILL.md',rule:'unattended_global_install',severity:'review'}]});
    assert.equal(p.outstandingReviewFindings[0].acknowledged,false);
    assert.equal(p.status,'manual_review_required');
  });
  it('blocks any blocking, unknown or incomplete finding',()=>{
    for(const update of [{findings:[{path:'SKILL.md',rule:'approval_bypass',severity:'block'}]},
       {findings:[{path:'SKILL.md',rule:'unexpected',severity:'unknown'}]},
       {inventoryComplete:false,staticCheckPassed:false}]){
      const p=compileSkillSourceReviewPacket({...base(),...update,staticCheckPassed:false});assert.equal(p.status,'blocked');
    }
  });
  it('rejects missing Git attestation, forged approval or inconsistent file inventory',()=>{
    for(const update of [{revisionVerified:false},{verificationMethod:'user-asserted'},
      {reviewerApproved:true},{installationPerformed:true},{scannedFiles:2},{bundleSha256:'wrong'},
      {staticCheckPassed:false}] )
      assert.throws(()=>compileSkillSourceReviewPacket({...base(),...update}),/evidence/);
  });
});
