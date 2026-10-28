import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, symlink, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import { inspectLocalSkillDirectory } from './skill-source-inspect.mjs';
async function fixture(fn){const dir=await mkdtemp(join(tmpdir(),'skills-inspect-'));try{return await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
test('Clean read-only skill returns stable real SHA-256',async()=>fixture(async dir=>{
 await writeFile(join(dir,'SKILL.md'),'# Local Skill\n[Doc](./notes.md)\n');
 await writeFile(join(dir,'notes.md'),'No scripts.\n');
 const before=await readFile(join(dir,'SKILL.md'));
 const a=await inspectLocalSkillDirectory(dir),b=await inspectLocalSkillDirectory(dir);
 assert.equal(a.staticCheckPassed,true);
 assert.equal(a.manifestSha256,b.manifestSha256);
 assert.equal(a.bundleSha256,b.bundleSha256);
 assert.match(a.bundleSha256,/^[0-9a-f]{64}$/);
 assert.equal(a.revisionVerified,false);
 assert.equal(a.humanReviewRequired,true);
 assert.equal(a.executionPerformed,false);
 assert.deepEqual(await readFile(join(dir,'SKILL.md')),before);
}));
test('Remotion-style broken sibling relative path blocks inspection',async()=>fixture(async dir=>{
 await writeFile(join(dir,'SKILL.md'),'[Create](./remotion-create/SKILL.md)\n');
 const a=await inspectLocalSkillDirectory(dir);
 assert.equal(a.staticCheckPassed,false);
 assert.ok(a.findings.some(x=>x.rule.startsWith('missing_linked_resource:')));
}));
test('Traversal links and instructions to auto-install are reported',async()=>fixture(async dir=>{
 await writeFile(join(dir,'SKILL.md'),'[Escape](../other/SKILL.md)\nnpx skills add x/y -g -y\n');
 const a=await inspectLocalSkillDirectory(dir);
 assert.ok(a.findings.some(x=>x.rule==='link_escapes_skill'));
 assert.ok(a.findings.some(x=>x.rule==='unattended_global_install'));
}));
test('Rejects symlinks without following them or reading outside content',async()=>fixture(async dir=>{
 await writeFile(join(dir,'SKILL.md'),'# safe\n');
 await symlink('/etc/passwd',join(dir,'outside.md'));
 const a=await inspectLocalSkillDirectory(dir);
 assert.equal(a.inventoryComplete,false);
 assert.ok(a.findings.some(x=>x.rule==='symlink_not_allowed'));
 assert.equal(a.scannedFiles,1);
}));
test('Package change affects bundle hash but not the untouched manifest',async()=>fixture(async dir=>{
 await mkdir(join(dir,'references'));
 await writeFile(join(dir,'SKILL.md'),'# safe\n');
 await writeFile(join(dir,'references','rules.md'),'alpha');
 const a=await inspectLocalSkillDirectory(dir);
 await writeFile(join(dir,'references','rules.md'),'beta');
 const b=await inspectLocalSkillDirectory(dir);
 assert.notEqual(a.bundleSha256,b.bundleSha256);
 assert.equal(a.manifestSha256,b.manifestSha256);
}));
test('Cannot skip binary payloads and pretend complete security scan',async()=>fixture(async dir=>{
 await writeFile(join(dir,'SKILL.md'),'# safe\n');
 await writeFile(join(dir,'payload.bin'),Buffer.from([0,1,2]));
 const a=await inspectLocalSkillDirectory(dir);
 assert.equal(a.inventoryComplete,false);
 assert.equal(a.staticCheckPassed,false);
 assert.ok(a.findings.some(x=>x.rule==='unsupported_binary_or_extension'));
}));
