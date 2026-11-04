import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createGenericTakeManifest,isGenericTakeFolder} from './persona-generic-takes.mjs';
import {readPersonaAiReelArgs} from './persona-ai-reel.mjs';

test('one-command AI editor accepts only actual explicit model + media inputs',()=>{
 const values=['--takes','C:\\Videos','--brief','C:\\brief.json','--out','C:\\new-output',
  '--whisper-cli','C:\\whisper-cli.exe','--whisper-model','C:\\ggml-medium.bin',
  '--ollama-model','qwen3:4b-instruct','--variation','humor'];
 const args=readPersonaAiReelArgs(values);
 assert.equal(args.aiEditorModel,'qwen3:4b-instruct');
 assert.equal(args.aiVariation,'humor');
 assert.equal(args.mode,'strict');
 assert.throws(()=>readPersonaAiReelArgs([...values,'--variation','invalid']),/duplicate|Invalid/);
 assert.throws(()=>readPersonaAiReelArgs(values.slice(0,-4)),/Missing/);
 assert.throws(()=>readPersonaAiReelArgs([...values,'--server','https://example.com']),/Invalid/);
});
test('new dynamically generated story accepts labeled real takes, without touching footage',async()=>{
 const d=await mkdtemp(join(tmpdir(),'persona-generic-'));
 try{
  const input=join(d,'takes'),output=join(d,'work');
  await mkdir(input);await mkdir(output);
  await writeFile(join(input,'S01_take01.mp4'),Buffer.alloc(1200,10));
  await writeFile(join(input,'S01_take02.mov'),Buffer.alloc(1200,11));
  await writeFile(join(input,'S02_take01.mp4'),Buffer.alloc(1200,12));
  await writeFile(join(input,'notes.txt'),'untouched');
  assert.equal(await isGenericTakeFolder(input),true);
  const result=await createGenericTakeManifest({folderPath:input,manifestPath:join(output,'sources.json')});
  assert.equal(result.layout,'variable-scenes');
  assert.equal(result.count,3);
  const data=JSON.parse(await readFile(result.manifest,'utf8'));
  assert.deepEqual(data.sources.map(x=>x.id),['s01_t01','s01_t02','s02_t01']);
  assert.ok(data.sources.every(x=>x.path.startsWith(input)));
  assert.equal((await readFile(join(input,'S01_take01.mp4'))).length,1200);
  await assert.rejects(createGenericTakeManifest({
   folderPath:input,manifestPath:join(output,'sources.json'),
  }),/EEXIST/);
  await assert.rejects(createGenericTakeManifest({
   folderPath:input,manifestPath:join(input,'forbidden.json'),
  }),/outside/);
  await writeFile(join(input,'another.mp4'),Buffer.alloc(1200,13));
  assert.equal(await isGenericTakeFolder(input),false);
  await assert.rejects(createGenericTakeManifest({
   folderPath:input,manifestPath:join(output,'bad.json'),
  }),/every video must be named/);
 }finally{await rm(d,{recursive:true,force:true})}
});
test('symlinked videos are not processed as input files',async t=>{
 const d=await mkdtemp(join(tmpdir(),'persona-link-'));
 try{
  const folder=join(d,'takes');await mkdir(folder);
  const outside=join(d,'outside.mp4');await writeFile(outside,Buffer.alloc(1200,1));
  await writeFile(join(folder,'S01_take01.mp4'),Buffer.alloc(1200,2));
  try{await symlink(outside,join(folder,'S02_take01.mp4'))}
  catch(error){
   // Windows without Developer Mode or elevated symlink privileges cannot create
   // the attack fixture. Do not convert that OS restriction into a false failure.
   if(error&&typeof error==='object'&&'code'in error&&error.code==='EPERM'){
    t.skip('Windows session has no symlink creation privilege');return;
   }
   throw error;
  }
  assert.equal(await isGenericTakeFolder(folder),false);
  await assert.rejects(createGenericTakeManifest({
   folderPath:folder,manifestPath:join(d,'source.json'),
  }),/no mixed layouts or links/);
 }finally{await rm(d,{recursive:true,force:true})}
});
