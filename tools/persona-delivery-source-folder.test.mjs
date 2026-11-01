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
 const result=classifyFiles([...scenes].reverse());
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
test('21 recorded takes yield only seven unreviewed first-take defaults and 14 alternatives',()=>{
 const names=scenes.flatMap(name=>[name,name.replace('take01','take02'),name.replace('take01','take03')]);
 const mapping=classifyFiles(names);
 assert.equal(mapping.files.length,7);
 assert.equal(mapping.alternatives.length,14);
 assert.equal(mapping.layout,'scene-takes');
 assert.ok(mapping.files.every(item=>item.id.endsWith('_take01')));
 assert.match(mapping.note,/UNREVIEWED/);
});
test('multi-take folder does not silently exceed the underlying 12-video input limit',async t=>{
 const base=await mkdtemp(join(tmpdir(),'persona-many-takes-'));
 t.after(()=>rm(base,{recursive:true,force:true}));
 const src=join(base,'selected-takes'),dst=join(base,'output');
 await mkdir(src);
 for(const name of scenes)
  for(const suffix of ['take01','take02','take03'])
   await writeFile(join(src,name.replace('take01',suffix)),'test fixture');
 const created=await makeManifest({sourceFolder:src,outputFolder:dst});
 const manifest=JSON.parse(await readFile(created.manifest,'utf8'));
 const report=JSON.parse(await readFile(created.report,'utf8'));
 assert.equal(manifest.sources.length,7);
 assert.equal(report.alternateTakes.length,14);
 assert.equal(report.status,'filenames-only-unverified');
});
test('selected folder is scanned once, never recursively or uploaded; manifest is local',async t=>{
 const base=await mkdtemp(join(tmpdir(),'persona-selected-folder-'));
 t.after(()=>rm(base,{recursive:true,force:true}));
 const src=join(base,'user-selected'),out=join(base,'nested','manifest');
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
test('intake cannot write an output directory inside the source folder',async t=>{
 const base=await mkdtemp(join(tmpdir(),'persona-no-in-place-output-'));
 t.after(()=>rm(base,{recursive:true,force:true}));
 const source=join(base,'captures');await mkdir(source);
 for(const name of scenes)await writeFile(join(source,name),'not-a-video');
 const nested=join(source,'capture-reports');
 await assert.rejects(makeManifest({sourceFolder:source,outputFolder:nested}),/outside the selected source folder/);
 await assert.rejects(readFile(join(nested,'sources.json')),/ENOENT/);
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


test('published Windows handoff requires exported brief, explicit FFmpeg bin and fail-fast QA',async()=>{
 const instructions=await readFile(new URL('../docs/persona-delivery/first-real-reel-shooting-pack.md',import.meta.url),'utf8');
 const first=instructions.split('## Первый запуск на Windows')[1]?.split('## Возврат смонтированного MP4')[0];
 assert.ok(first,'Windows first-run section exists');
 assert.match(first,/\$brief\s*=\s*'[^\n]*persona-production-brief\.json'/);
 assert.doesNotMatch(first,/\$brief\s*=\s*'[^\n]*editorial-candidate-production-brief\.json'/);
 assert.match(first,/npm run media:first-reel:draft --[^\n]*\$brief[^\n]*\$ffmpegBin strict/);
 assert.match(first,/node tools\\persona-video-quality\.mjs[^\n]*\$ffmpegBin/);
 const failFast=(first.match(/if \(\$LASTEXITCODE -ne 0\) \{ throw/g)||[]).length;
 assert.equal(failFast,3,'intake, draft and QA must each stop on native command failure');
 const finish=instructions.split('## Локальная финишная сборка')[1]?.split('## Возврат финишного MP4')[0];
 assert.ok(finish,'Final-stage instructions exist');
 assert.match(finish,/npm run media:finish:reel --[^\n]*\$ffmpegBin/);
 assert.match(finish,/if \(\$LASTEXITCODE -ne 0\) \{ throw/);
});
