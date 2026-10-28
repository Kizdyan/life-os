import { describe,it } from 'node:test';
import assert from 'node:assert/strict';
import { createSkillReviewQueue } from './skill-review-queue.mjs';
const candidate = (id='vercel-labs/skills/find-skills',extras={}) => {
  const [owner,repo,slug]=id.split('/');return {
    id,source:owner+'/'+repo,slug,name:slug,installsReported:12345,
    status:'discovery_only',approved:false,installed:false,verifiedWorking:false,
    sourceRevision:null,manifestSha256:null,bundleSha256:null,license:null,
    sourceUrl:'https://github.com/'+owner+'/'+repo,catalogUrl:'https://skills.sh/'+id,
    ...extras,
  };
};
const report = (topic, candidates)=>({ schemaVersion:1,topic,source:'skills.sh',query:'test query',
  returned:candidates.length,candidates, humanReviewRequired:true,
  mayInstallAutomatically:false,mayExecuteAutomatically:false,
  installationPerformed:false,executionPerformed:false });
const batch = reports => ({schemaVersion:1,kind:'skill-discovery-batch',source:'skills.sh',reports,
  installationPerformed:false,executionPerformed:false,mayInstallAutomatically:false,mayExecuteAutomatically:false});
describe('offline skill review queue',()=>{
  it('deduplicates across topics and prefers independently matched tasks',()=>{
    const a=candidate(),b=candidate('other/repo/one');
    const r=createSkillReviewQueue(batch([report('video',[a,b]),report('code',[a])]));
    assert.equal(r.totalUniqueCandidates,2);
    assert.equal(r.queue[0].id,a.id);
    assert.deepEqual(r.queue[0].matchedTopics,['code','video']);
    assert.equal(r.queue[0].sourceRevision,null);
    assert.equal(r.queue[0].approved,false);
    assert.equal(r.mayInstallAutomatically,false);
  });
  it('does not promote high installation count into approval',()=>{
    const r=createSkillReviewQueue(batch([report('code',[candidate('popular/repo/a',{installsReported:1000000000})])]));
    assert.equal(r.queue[0].verifiedWorking,false);
    assert.equal(r.queue[0].mayExecuteAutomatically,false);
  });
  it('rejects catalog fields already claiming approved, installed or pinned sources',()=>{
    for(const extras of [{approved:true},{installed:true},{verifiedWorking:true},{sourceRevision:'a'.repeat(40)},{license:'MIT'}]){
      assert.throws(()=>createSkillReviewQueue(batch([report('code',[candidate(undefined,extras)])])),/Untrusted/);
    }
  });
  it('rejects forged destination URLs, malformed id, and suspicious repo paths',()=>{
    for(const extras of [{sourceUrl:'https://evil.example'},{catalogUrl:'https://evil.example'},{id:'../../x'},{source:'../evil'}])
      assert.throws(()=>createSkillReviewQueue(batch([report('code',[candidate(undefined,extras)])])),/Untrusted/);
  });
  it('rejects promoted batch and topic flags',()=>{
    assert.throws(()=>createSkillReviewQueue({...batch([report('code',[])]),mayInstallAutomatically:true}),/Unsafe/);
    assert.throws(()=>createSkillReviewQueue(batch([{...report('code',[]),mayExecuteAutomatically:true}])),/Unsafe/);
  });
  it('rejects report count drift and duplicate topic',()=>{
    assert.throws(()=>createSkillReviewQueue(batch([{...report('code',[]),returned:1}])),/Unsafe/);
    assert.throws(()=>createSkillReviewQueue(batch([report('code',[]),report('code',[])])),/Unsafe/);
  });
  it('orders ties deterministically by id',()=>{
    const r=createSkillReviewQueue(batch([report('code',[candidate('z/repo/one'),candidate('a/repo/one')])]));
    assert.deepEqual(r.queue.map(c=>c.id),['a/repo/one','z/repo/one']);
  });
});
