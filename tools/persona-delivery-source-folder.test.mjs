import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {classifyFiles,makeManifest} from './persona-delivery-source-folder.mjs';

const scenes=[
 'A01_actor_hook_take01.mp4','B01_composer_problem_take01.mp4',
 'A02_actor_audition_take01.mp4','B02_composer_deadline_take01.mp4',
 'A03_actor_sleep_take01.mp4','B03_composer_lullaby_take01.mp4',
 'A04_actor_payoff_take01.mp4'
];
test('maps seven clearly named takes in screenplay order',()=>{
 const result=classifyFiles(scenes.reverse().slice().reverse());
 assert.equal(result.layout,'scene-takes');
 assert.deepEqual(result.files.map(x=>x.id),[
  'A01_take01','B01_take01','A02_take01','B02_take01',
  'A03_take01','B03_take01','A04_take01'
 ]);
});
test('allows precisely two explicitly named long role recordings; does not invent beat labels',()=>{
 const result=classifyFiles(['composer_full_take01.mov','actor_long.mp4']);
 assert.equal(result.layout,'two-long-roles');
 assert.deepEqual(result.files.map(x=>x.id),['actor_long','composer_long']);
 assert.match(result.note,/NO beat assignments/);
});
test('fails closed on missing scenes, unclear names, duplicated take IDs',()=>{
 assert.throws(()=>classifyFiles(scenes.slice(0,6)),/missing required scene/);
 assert.throws(()=>classifyFiles(['actor_long.mp4','ambiguous.mp4']),/ambiguous names/);
 assert.throws(()=>classifyFiles([...scenes,'A01_take01.mov']),/duplicate take number/);
});
test('selected folder is scanned once, never recursively or uploaded; manifest is local',async t=>{
 const base=await mkdtemp(join(tmpdir(),'persona-selected-folder-'));
 t.after(()=>rm(base,{recursive:true,force:true}));
 const src=join(base,'user-selected'),out=join(base,'manifest');
 await mkdir(src);
 for(const name of scenes)await writeFile(join(src,name),'sample fixture, NOT a video');
 await writeFile(join(src,'notes.txt'),'Not media');
 const result=await makeManifest({sourceFolder:src,outputFolder:out});
 const data=JSON.parse(await readFile(result.manifest,'utf8'));
 const report=JSON.parse(await readFile(result.report,'utf8'));
 assert.equal(data.sources.length,7);
 assert.equal(report.layout,'scene-takes');
 assert.equal(report.status,'filenames-only-unverified');
 assert.equal(report.recursiveScan,false);
 assert.equal(report.sourceOriginalsModified,false);
 assert.equal(report.autoApproval,false);
 assert.ok(data.sources.every(s=>s.path.startsWith(src)));
 await assert.rejects(makeManifest({sourceFolder:src,outputFolder:out}),/EEXIST/);
});
test('unrelated nested videos and symlinks are not silently imported',async t=>{
 const base=await mkdtemp(join(tmpdir(),'persona-no-recursive-'));
 t.after(()=>rm(base,{recursive:true,force:true}));
 const selected=join(base,'selected'),nested=join(selected,'nested');
 await mkdir(selected);await mkdir(nested);
 await writeFile(join(nested,'actor_long.mp4'),'nested fixture');
 await writeFile(join(selected,'composer_long.mp4'),'top-level fixture');
 await assert.rejects(makeManifest({sourceFolder:selected,outputFolder:join(base,'out')}),/ambiguous names|expected 1/);
});
