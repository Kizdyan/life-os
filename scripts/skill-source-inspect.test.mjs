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


test('Supports a 144-file Remotion-shaped text package with bounded audit',async()=>fixture(async dir=>{
 await writeFile(join(dir,'SKILL.md'),'# Router\n[Reference](./remotion-create/REFERENCE.md)\n');
 await mkdir(join(dir,'remotion-create'));
 await writeFile(join(dir,'remotion-create','REFERENCE.md'),'# Create\n');
 await writeFile(join(dir,'remotion-create','sample.geojson'),JSON.stringify({type:'FeatureCollection',features:[],padding:'x'.repeat(330_000)}));
 await writeFile(join(dir,'remotion-create','icon.svg'),'<svg xmlns="http://www.w3.org/2000/svg"></svg>');
 for(let i=0;i<140;i++) await writeFile(join(dir,'sample-'+i+'.md'),'# Read only\n'+'x'.repeat(6000));
 const r=await inspectLocalSkillDirectory(dir);
 assert.equal(r.scannedFiles,144);
 assert.ok(r.totalBytes>1_000_000);
 assert.equal(r.inventoryComplete,true);
 assert.equal(r.staticCheckPassed,true);
 assert.equal(r.humanReviewRequired,true);
 assert.equal(r.revisionVerified,false);
}));
test('SVG event handlers and script content are rejected',async()=>fixture(async dir=>{
 await writeFile(join(dir,'SKILL.md'),'# Router\n');
 await writeFile(join(dir,'icon.svg'),'<svg onload="alert(1)" xmlns="http://www.w3.org/2000/svg"></svg>');
 const r=await inspectLocalSkillDirectory(dir);
 assert.ok(r.findings.some(x=>x.rule==='embedded_svg_script'));
 assert.equal(r.staticCheckPassed,false);
}));

test('Rejects invalid UTF-8 without treating corrupt file as inspected',async()=>fixture(async dir=>{
 await writeFile(join(dir,'SKILL.md'),'# Safe\\n');
 await writeFile(join(dir,'corrupt.md'),Buffer.from([0x23,0x20,0xc3,0x28,0x0a]));
 const result=await inspectLocalSkillDirectory(dir);
 assert.equal(result.inventoryComplete,false);
 assert.equal(result.scannedFiles,1);
 assert.equal(result.staticCheckPassed,false);
 assert.ok(result.findings.some(x=>x.rule==='invalid_utf8'));
}));
test('An HTML script mentioned in Markdown is not misclassified as active SVG',async()=>fixture(async dir=>{
 await writeFile(join(dir,'SKILL.md'),'# Safe\\n');
 await writeFile(join(dir,'documentation.md'),'Discuss the HTML tag <script>, do not execute it.\\n');
 const result=await inspectLocalSkillDirectory(dir);
 assert.equal(result.staticCheckPassed,true);
}));
test('An SVG event handler is blocked, even if not named onload',async()=>fixture(async dir=>{
 await writeFile(join(dir,'SKILL.md'),'# Safe\\n');
 await writeFile(join(dir,'icon.svg'),'<svg><rect onclick="alert(1)"/></svg>');
 const result=await inspectLocalSkillDirectory(dir);
 assert.ok(result.findings.some(x=>x.rule==='embedded_svg_script'));
 assert.equal(result.staticCheckPassed,false);
}));
