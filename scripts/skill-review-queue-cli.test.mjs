import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('./skill-review-queue.mjs', import.meta.url));
const candidate = {
  id:'vercel-labs/skills/find-skills', source:'vercel-labs/skills',slug:'find-skills',
  name:'Find Skills', installsReported:42, status:'discovery_only', approved:false,
  installed:false,verifiedWorking:false,sourceRevision:null,license:null,
  manifestSha256:null,bundleSha256:null,sourceUrl:'https://github.com/vercel-labs/skills',
  catalogUrl:'https://skills.sh/vercel-labs/skills/find-skills',
};
const report = {schemaVersion:1,kind:'skill-discovery-batch',source:'skills.sh',
  reports:[{schemaVersion:1,source:'skills.sh',topic:'ai-agents',query:'agent skill discovery',
    returned:1,candidates:[candidate],humanReviewRequired:true,
    installationPerformed:false,executionPerformed:false,
    mayInstallAutomatically:false,mayExecuteAutomatically:false}],
  installationPerformed:false,executionPerformed:false,
  mayInstallAutomatically:false,mayExecuteAutomatically:false};

describe('offline CLI real JSON roundtrip',()=>{
  it('writes the review queue as a UTF-8 file without installing anything',()=>{
    const dir=mkdtempSync(join(tmpdir(),'skill-queue-'));
    try {
      const input=join(dir,'input.json'),out=join(dir,'queue.json');
      writeFileSync(input,JSON.stringify(report));
      const run=spawnSync(process.execPath,[cli,input,'--out',out],{encoding:'utf8',cwd:dir});
      assert.equal(run.status,0,run.stderr);
      const queue=JSON.parse(readFileSync(out,'utf8'));
      assert.equal(queue.queue[0].id,candidate.id);
      assert.equal(queue.mayInstallAutomatically,false);
      assert.equal(queue.queue[0].approved,false);
      assert.equal(run.stdout,'');
    } finally { rmSync(dir,{recursive:true,force:true}); }
  });
  it('refuses to overwrite an existing queue file',()=>{
    const dir=mkdtempSync(join(tmpdir(),'skill-queue-'));
    try {
      const input=join(dir,'input.json'),out=join(dir,'queue.json');
      writeFileSync(input,JSON.stringify(report));writeFileSync(out,'sentinel');
      const run=spawnSync(process.execPath,[cli,input,'--out',out],{encoding:'utf8'});
      assert.equal(run.status,1);
      assert.equal(readFileSync(out,'utf8'),'sentinel');
    } finally { rmSync(dir,{recursive:true,force:true}); }
  });
});
