import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {cachedFfprobe,cachedMp4,cachedWhisper,stageFileSha} from './persona-stage-cache.mjs';

async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'persona-stage-cache-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const env={...process.env,PERSONA_STAGE_CACHE:'1',PERSONA_STAGE_CACHE_DB:join(root,'stage.sqlite3')};
 const input=join(root,'input'),binary=join(root,'tool.exe');
 await writeFile(input,'source');
 await writeFile(binary,'test tool');
 return {root,env,input,binary};
}

test('FFprobe reuses bytes at a new path and invalidates changed tool and arguments',async t=>{
 const {root,env,input,binary}=await fixture(t);
 const copy=join(root,'copy.mov');
 await writeFile(copy,await readFile(input));
 let calls=0;
 const run=async(_,args)=>{
  calls++;
  return JSON.stringify({format:{filename:args.at(-1),duration:'7'}});
 };
 assert.equal((await cachedFfprobe(input,{env,binary,run})).format.filename,input);
 assert.equal((await cachedFfprobe(copy,{env,binary,run})).format.filename,copy);
 assert.equal(calls,1);
 await cachedFfprobe(copy,{env,binary,run,args:['-show_format','-of','json']});
 await writeFile(binary,'different binary');
 await cachedFfprobe(input,{env,binary,run});
 assert.equal(calls,3);
});

test('Whisper only reuses validated output for the same model and settings',async t=>{
 const {root,env,input,binary}=await fixture(t);
 const model=join(root,'model');
 await writeFile(model,'first model');
 let calls=0;
 const run=async()=>{
  calls++;
  if(calls===1)throw Error('ASR failed');
  return {transcription:[]};
 };
 const invoke=language=>cachedWhisper(input,{env,binary,model,params:{language},run});
 await assert.rejects(invoke('ru'),/ASR failed/);
 assert.equal((await invoke('ru')).status,'MISS');
 assert.equal((await invoke('ru')).status,'HIT');
 assert.equal((await invoke('en')).status,'MISS');
 await writeFile(model,'second model');
 assert.equal((await invoke('ru')).status,'MISS');
 assert.equal(calls,4);
});

test('cached render materializes identical bytes at a fresh destination',async t=>{
 const {root,env,input,binary}=await fixture(t);
 const sourceSha=await stageFileSha(input);
 let calls=0;
 const render=path=>cachedMp4({path,sourceSha,params:{font:'test'},env,binary,render:async()=>{
  calls++;
  await writeFile(path,'verified render bytes');
 }});
 const first=join(root,'first.mp4'),second=join(root,'second.mp4');
 assert.equal(await render(first),'MISS');
 assert.equal(await render(second),'HIT');
 assert.deepEqual(await readFile(first),await readFile(second));
 await assert.rejects(render(second),{code:'EEXIST'});
 assert.equal(calls,1);
});
