import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, symlink, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {auditProjectAgentSkills} from './skill-agent-local-audit.mjs';
const sample = ['---','name: life-os-skill-discovery',
 'description: Local safe discovery instructions for verified project agents.',
 '---','','# Discovery','No automatic installation.',''].join('\n');
async function fixture(fn){
 const dir=await mkdtemp(join(tmpdir(),'agent-skills-'));
 try {return await fn(dir);}finally{await rm(dir,{force:true,recursive:true});}
}
async function install(root, agent, content=sample){
 const path=join(root,agent,'skills','life-os-skill-discovery');
 await mkdir(path,{recursive:true});
 await writeFile(join(path,'SKILL.md'),content);
}
describe('project-local Codex and Claude manifest audit',()=>{
 it('verifies two matching local instructions without claiming agent auth or runtime',()=>fixture(async root=>{
   await install(root,'.agents');await install(root,'.claude');
   const a=await auditProjectAgentSkills(root);
   assert.equal(a.status,'matching_local_manifests');
   assert.equal(a.contentsMatch,true);
   assert.equal(a.providerAuthorizationVerified,false);
   assert.equal(a.runtimeInvocationVerified,false);
   assert.equal(a.mayInstallAutomatically,false);
   assert.equal(a.agents[0].authorization,'unverified');
   assert.equal(a.agents[0].runtimeLoaded,false);
 }));
 it('does not confuse a missing Claude installation with successful connection',()=>fixture(async root=>{
   await install(root,'.agents');
   const a=await auditProjectAgentSkills(root);
   assert.equal(a.status,'not_ready');
   assert.deepEqual(a.agents.map(x=>x.status),['manifest_present','missing']);
 }));
 it('detects altered content and never reports matching agent skills',()=>fixture(async root=>{
   await install(root,'.agents');await install(root,'.claude',sample+'Extra instructions');
   const a=await auditProjectAgentSkills(root);
   assert.equal(a.status,'not_ready');assert.equal(a.contentsMatch,false);
 }));
 it('rejects symlinked skill directories, even if contents appear valid',()=>fixture(async root=>{
   await install(root,'.agents');await mkdir(join(root,'.claude','skills'),{recursive:true});
   try {
     await symlink(join(root,'.agents','skills','life-os-skill-discovery'),
       join(root,'.claude','skills','life-os-skill-discovery'),'dir');
   } catch (e) {
     if (['EPERM','EACCES','ENOTSUP'].includes(e.code)) return;
     throw e;
   }
   const a=await auditProjectAgentSkills(root);
   assert.equal(a.agents[1].status,'unsafe_path');
 }));
 it('rejects incorrect manifest name and invalid frontmatter',()=>fixture(async root=>{
   await install(root,'.agents',sample.replace('name: life-os-skill-discovery','name: another-skill'));
   await install(root,'.claude','hello');
   const a=await auditProjectAgentSkills(root);
   assert.deepEqual(a.agents.map(x=>x.status),['invalid_manifest','invalid_manifest']);
 }));
 it('rejects arbitrary paths and malformed skill IDs before touching files',()=>fixture(async root=>{
   await assert.rejects(auditProjectAgentSkills(root,'../secret'),/Unsafe/);
 }));
});
