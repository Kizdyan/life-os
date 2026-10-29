import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {validateSkillQueue,renderSkillReviewDashboard} from './skill-review-dashboard.mjs';
const script = fileURLToPath(new URL('./skill-review-dashboard.mjs',import.meta.url));
function skill(patch={}) {
  return {id:'vercel-labs/skills/find-skills',name:'<img src=x onerror=alert(1)>',
    sourceUrl:'https://github.com/vercel-labs/skills',
    catalogUrl:'https://skills.sh/vercel-labs/skills/find-skills',
    matchedTopics:['persona-video'],installsReported:9,possibleDuplicate:false,
    discoveryScore:101,sourceRevision:null,license:null,status:'discovery_only',
    approved:false,installed:false,verifiedWorking:false,
    mayInstallAutomatically:false,mayExecuteAutomatically:false,
    requiredNextChecks:['Source review'],...patch};
}
function queue(skills=[skill()]) {
  return {schemaVersion:1,kind:'skill-review-queue',source:'skills.sh',
    topicCount:1,totalUniqueCandidates:skills.length,queue:skills,
    humanReviewRequired:true,mayInstallAutomatically:false,mayExecuteAutomatically:false,
    installationPerformed:false,executionPerformed:false};
}
describe('offline skill dashboard',()=>{
  it('accepts valid discovery-only queue and renders a mobile HTML page',()=>{
    const html=renderSkillReviewDashboard(queue());
    assert.match(html,/viewport/);assert.match(html,/max-width:390px/);
    assert.match(html,/Content-Security-Policy/);
    assert.match(html,/Только найдено/);
  });
  it('escapes malicious Skill titles without any executable scripts',()=>{
    const html=renderSkillReviewDashboard(queue());
    assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(html,/<img src=x onerror=/);
    assert.doesNotMatch(html,/<script\b/);
  });
  it('rejects falsely promoted, installed or activated candidates',()=>{
    for(const patch of [{approved:true},{installed:true},{verifiedWorking:true},
      {status:'approved'},{mayInstallAutomatically:true},{sourceRevision:'a'.repeat(40)}])
      assert.throws(()=>validateSkillQueue(queue([skill(patch)])),/Unsafe/);
  });
  it('rejects arbitrary URLs and duplicate IDs',()=>{
    assert.throws(()=>validateSkillQueue(queue([skill({catalogUrl:'javascript:alert(1)'})])),/Untrusted/);
    assert.throws(()=>validateSkillQueue(queue([skill({sourceUrl:'https://evil.example'})])),/Untrusted/);
    assert.throws(()=>validateSkillQueue(queue([skill(),skill()])),/Invalid|Unsafe/);
  });
  it('rejects invalid envelope, size, malformed topics and uncontrolled notes',()=>{
    assert.throws(()=>validateSkillQueue({...queue(),humanReviewRequired:false}),/Invalid/);
    assert.throws(()=>validateSkillQueue(queue([skill({matchedTopics:['../../evil']})])),/Unsafe/);
    assert.throws(()=>validateSkillQueue(queue([skill({requiredNextChecks:['<'.repeat(1000)]})])),/Unsafe/);
  });
  it('supports empty but valid queue without inventing candidates',()=>{
    const html=renderSkillReviewDashboard(queue([]));
    assert.match(html,/нет/);
    assert.doesNotMatch(html,/href=/);
  });
  it('CLI writes a valid HTML file and refuses to overwrite it',()=>{
    const dir=mkdtempSync(join(tmpdir(),'skill-dashboard-'));
    try{
      const input=join(dir,'queue.json'),out=join(dir,'dashboard.html');
      writeFileSync(input,JSON.stringify(queue()));
      const one=spawnSync(process.execPath,[script,input,out],{encoding:'utf8'});
      assert.equal(one.status,0,one.stderr);
      const prior=readFileSync(out,'utf8');
      const two=spawnSync(process.execPath,[script,input,out],{encoding:'utf8'});
      assert.equal(two.status,1);
      assert.equal(readFileSync(out,'utf8'),prior);
    }finally{rmSync(dir,{force:true,recursive:true})}
  });
});
