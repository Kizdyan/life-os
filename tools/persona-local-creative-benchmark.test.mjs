import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CREATIVE_CASES,benchmarkPersonaLocalModel} from './persona-local-creative-benchmark.mjs';

test('three distinctive creative briefs contain nine non-empty dramatic elements',()=>{
 assert.deepEqual(CREATIVE_CASES.map(x=>x.key),['acting-comedy','music-comedy','cinematic']);
 for(const item of CREATIVE_CASES){
  assert.equal(item.input.kind,'persona-scenario-local-input-v1');
  assert.equal(item.input.idea.format,'reel');
  assert.equal(Object.values(item.input.storyOutline).length,9);
  assert.ok(Object.values(item.input.storyOutline).every(x=>x.trim().length>10));
 }
});
test('offline mocked benchmark writes technical results, never invents artistic ratings',async(t)=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-creative-benchmark-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const called=[];
 const fake=async(input,options)=>{
  called.push([input.idea.id,options.model]);
  return {brief:{script:[{line:'Тест'}],adaptations:{reels:{durationSec:20}}},
   review:{notes:{dramaturg:['Замечание'],director:['Замечание'],producer:['Замечание']}}};
 };
 const result=await benchmarkPersonaLocalModel({model:'local-test:7b',outputDirectory:dir,generator:fake});
 assert.equal(result.cases.length,3);
 assert.equal(result.cases.filter(x=>x.state==='generated').length,3);
 assert.ok(result.cases.every(x=>x.humanReview.status==='pending'&&x.humanReview.originality===null));
 assert.ok(result.cases.every(x=>x.elapsedMs>=0));
 assert.deepEqual(called.map(x=>x[0]),CREATIVE_CASES.map(x=>x.input.idea.id));
 const list=await readdir(dir);
 assert.equal(list.length,14);
 for(const item of CREATIVE_CASES){
  assert.deepEqual(JSON.parse(await readFile(join(dir,item.key+'.input.json'),'utf8')),item.input);
 }
 assert.equal(JSON.parse(await readFile(join(dir,'benchmark-report.json'),'utf8')).cases.length,3);
 await assert.rejects(benchmarkPersonaLocalModel({outputDirectory:dir,generator:fake}),/должен быть пустым/);
});
test('model failure is recorded as failed and never faked as success',async(t)=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-benchmark-failure-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const result=await benchmarkPersonaLocalModel({outputDirectory:dir,
  generator:async()=>{throw Error('Ollama не запущена')}});
 assert.equal(result.cases.filter(x=>x.state==='failed').length,3);
 assert.equal((await readdir(dir)).length,5);
 assert.match(result.cases[0].error,/Ollama/);
 assert.equal(JSON.parse(await readFile(join(dir,'benchmark-state.json'),'utf8')).state,'FAILED');
});
test('invalid model output is preserved locally for diagnosis but never accepted as a draft',async(t)=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-benchmark-invalid-output-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const error=Error('Некорректный кадр 4');
 error.rawResponse='{"beats":[{"durationSec":0}]}';
 const result=await benchmarkPersonaLocalModel({outputDirectory:dir,cases:[CREATIVE_CASES[0]],generator:async()=>{throw error}});
 assert.equal(result.cases[0].state,'failed');
 assert.equal(await readFile(join(dir,'acting-comedy.raw-response.txt'),'utf8'),error.rawResponse);
});
test('benchmark preserves the raw local answer and generation settings for later creative review',async(t)=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-benchmark-evidence-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const fake=async()=>({
  brief:{script:[{line:'Тест'}],adaptations:{reels:{durationSec:20}}},
  review:{notes:{dramaturg:['Замечание'],director:['Замечание'],producer:['Замечание']}},
  rawResponse:'{"beats":["необработанный ответ"]}',
  generationConfig:{temperature:0.6,numPredict:3500,systemPrompt:'Системный промпт'}
 });
 const result=await benchmarkPersonaLocalModel({model:'local-test:7b',outputDirectory:dir,generator:fake});
 assert.equal(result.cases[0].generation.temperature,0.6);
 assert.equal(await readFile(join(dir,'acting-comedy.raw-response.txt'),'utf8'),'{"beats":["необработанный ответ"]}');
 assert.deepEqual(JSON.parse(await readFile(join(dir,'acting-comedy.generation.json'),'utf8')),{temperature:0.6,numPredict:3500,systemPrompt:'Системный промпт'});
});
test('benchmark records a durable running state before a local model is asked to generate',async(t)=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-benchmark-state-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 let runningState;
 const fake=async()=>{
  runningState=JSON.parse(await readFile(join(dir,'benchmark-state.json'),'utf8'));
  return {brief:{script:[{line:'Тест'}],adaptations:{reels:{durationSec:20}}},review:{notes:{dramaturg:['Замечание'],director:['Замечание'],producer:['Замечание']}}};
 };
 const result=await benchmarkPersonaLocalModel({model:'local-test:7b',outputDirectory:dir,generator:fake,cases:[CREATIVE_CASES[0]]});
 assert.equal(runningState.state,'RUNNING');
 assert.equal(runningState.caseKey,'acting-comedy');
 assert.equal(runningState.model,'local-test:7b');
 const completed=JSON.parse(await readFile(join(dir,'benchmark-state.json'),'utf8'));
 assert.equal(completed.state,'GENERATED');
 assert.equal(completed.completedCases,1);
 assert.equal(result.cases.length,1);
});
