import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {verifySkillCheckout} from './skill-source-verify-git.mjs';
function git(root,args){
 const r=spawnSync('git',['-C',root,...args],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr); return r.stdout.trim();
}
async function fixture(fn){
 const root=await mkdtemp(join(tmpdir(),'verified-skill-'));
 try{
  git(root,['init','-q']);
  const skillDir=join(root,'skills','test-skill');
  await mkdir(skillDir,{recursive:true});
  await writeFile(join(skillDir,'SKILL.md'),'# Local skill\n[Documentation](./instructions.md)\n');
  await writeFile(join(skillDir,'instructions.md'),'Safe local instructions.\n');
  git(root,['add','.']);
  git(root,['-c','user.name=QA','-c','user.email=qa@example.invalid','commit','-qm','fixture']);
  const sha=git(root,['rev-parse','HEAD']);
  return await fn(root,skillDir,sha);
 }finally{await rm(root,{recursive:true,force:true});}
}
test('Verified clean checkout gives measured content hashes and pinned local commit',()=>fixture(async(root,skillDir,sha)=>{
 const before=await readFile(join(skillDir,'SKILL.md'));
 const r=await verifySkillCheckout(root,'skills/test-skill',sha);
 assert.equal(r.revisionVerified,true);
 assert.equal(r.staticCheckPassed,true);
 assert.equal(r.manifestSha256.length,64);
 assert.equal(r.bundleSha256.length,64);
 assert.equal(r.scannedFiles,2);
 assert.equal(r.upstreamPublisherAuthenticated,false);
 assert.equal(r.reviewerApproved,false);
 assert.deepEqual(await readFile(join(skillDir,'SKILL.md')),before);
}));
test('Tampered tracked file is rejected against Git object',()=>fixture(async(root,dir,sha)=>{
 await writeFile(join(dir,'instructions.md'),'Modified after checkout\n');
 await assert.rejects(()=>verifySkillCheckout(root,'skills/test-skill',sha),/Git blob mismatch/);
}));
test('Untracked extra file blocks attestation',()=>fixture(async(root,dir,sha)=>{
 await writeFile(join(dir,'hidden.md'),'Unexpected\n');
 await assert.rejects(()=>verifySkillCheckout(root,'skills/test-skill',sha),/inventory differs/);
}));
test('HEAD must be exact pinned revision, never a mutable branch',()=>fixture(async(root,dir,sha)=>{
 await assert.rejects(()=>verifySkillCheckout(root,'skills/test-skill','a'.repeat(40)),/HEAD is not the pinned commit/);
 await assert.rejects(()=>verifySkillCheckout(root,'skills/test-skill','main'),/40-character commit/);
}));
test('Symlinks cannot be used to smuggle data from outside',()=>fixture(async(root,dir,sha)=>{
 await symlink('/etc/passwd',join(dir,'secret.md'));
 await assert.rejects(()=>verifySkillCheckout(root,'skills/test-skill',sha),/inventory differs/);
}));
test('Cannot verify another repository path by traversal',()=>fixture(async(root,dir,sha)=>{
 await assert.rejects(()=>verifySkillCheckout(root,'../test-skill',sha),/Unsafe skill subdirectory/);
}));

test('Embedded nested Git metadata is rejected rather than omitted',()=>fixture(async(root,dir,sha)=>{
 await mkdir(join(dir,'.git'));
 await writeFile(join(dir,'.git','config'),'untrusted metadata');
 await assert.rejects(()=>verifySkillCheckout(root,'skills/test-skill',sha),/inventory differs/);
}));

test('Hostile Git environment variables cannot redirect local read-only verification',()=>fixture(async(root,dir,sha)=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./skill-source-verify-git.mjs',import.meta.url)),root,'skills/test-skill',sha],{
  encoding:'utf8',timeout:30000,env:{...process.env,GIT_DIR:'/nonexistent/fake-git-dir',GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'core.fsmonitor',GIT_CONFIG_VALUE_0:'!false'},
 });
 assert.equal(result.status,0,result.stderr);
 assert.equal(JSON.parse(result.stdout).revisionVerified,true);
}));
