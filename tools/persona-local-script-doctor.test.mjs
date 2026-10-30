import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runLocalScriptDoctor,runLocalScriptDoctorFiles,validateDoctorTask} from './persona-local-script-doctor.mjs';

const beats=[
 {purpose:'hook',line:'Я прихожу на кастинг с папкой нот.',action:'Останавливаюсь перед дверью кастинга.',durationSec:3},
 {purpose:'development',line:'Режиссёр просит сыграть одну ноту.',action:'Пытаюсь найти аккорд, скрывая растерянность.',durationSec:5},
 {purpose:'development',line:'Но пианино отвечает вместо меня.',action:'Отодвигаю руки и слушаю звук.',durationSec:6},
 {purpose:'ending',line:'На роль утвердили пианино, а не меня.',action:'Закрываю крышку и пожимаю плечами.',durationSec:4},
];
const task={kind:'persona-local-doctor-input-v1',version:1,script:{
 idea:{id:'idea-audition-01',title:'Неправильные пробы',originalConflict:'Актёр хочет получить роль, но внимание режиссёра достаётся пианино'},
 currentRevisionId:'scenario-r3',currentRevision:{id:'scenario-r3',beats},approval:{revisionId:'scenario-r3',author:'Тестовый автор'}},
 targetIndices:[2,3],lockedIndices:[0],instruction:'Усилить финальную неожиданность, но оставить начало неизменным',
 authorFeedback:'В текущем финале нет драматургического поворота.'};
const diagnosis={summary:'Финальный поворот не подготовлен.',storyMap:beats.map((beat,beatIndex)=>({beatIndex,sceneFunction:beatIndex===0?'hook':beatIndex===beats.length-1?'payoff':'escalation',causedByBeatIndex:beatIndex===0?null:beatIndex-1,changedCondition:beatIndex===0?'Герой просит пробу.':'Обстоятельства меняются после действия героя.',goalObstacleRelation:'Герой добивается роли, а пианино перехватывает внимание.',turnPreparation:beatIndex===beats.length-1?'Подготовлено тем, что режиссёр слушает только пианино.':'Ещё не финальный поворот.'})),findings:[
 {role:'dramaturg',classification:'INTERPRETIVE_WEAKNESS',beatIndex:2,issue:'Не проявлена новая цель.',evidence:'Пианино отвечает без изменения обстоятельств.',proposal:'Герой пробует перехватить инициативу и терпит неудачу.'},
 {role:'comedy',classification:'INTERPRETIVE_WEAKNESS',beatIndex:3,issue:'Панчлайн известен заранее.',evidence:'Финальная реплика буквально повторяет ожидаемую ситуацию.',proposal:'Пусть режиссёр зовёт пианино на следующую пробу, а герой становится аккомпаниатором.'}]};
const candidate={patches:[
 {beatIndex:2,line:'Я играю громче, но режиссёр обращается только к клавишам.',action:'Захлопываю партитуру и беззвучно показываю жест «я здесь».',durationSec:7},
 {beatIndex:3,line:'Меня взяли. Аккомпанировать пианино.',action:'Убираю стул и торжественно уступаю место инструменту.',durationSec:4}],
 changeSummary:'Финал теперь вытекает из двух конкретных действий.'};
function fakeLocal({foundModels=['qwen2.5-coder:7b'],notes=diagnosis,revision=candidate}={}){
 const calls=[];const fetchImpl=async(url,options)=>{calls.push({url:String(url),options});
  if(String(url).endsWith('/api/tags'))return {ok:true,json:async()=>({models:foundModels.map(name=>({name}))})};
  if(String(url).endsWith('/api/chat'))return {ok:true,json:async()=>({message:{content:JSON.stringify(calls.filter(x=>x.url.endsWith('/api/chat')).length===1?notes:revision)}})};
  throw Error('Unexpected remote call');
 };return {fetchImpl,calls};
}
test('local two-pass editor returns meaningful scene-specific critique and unapproved targeted diff',async()=>{
 const {fetchImpl,calls}=fakeLocal();const out=await runLocalScriptDoctor(task,{fetchImpl});
 assert.equal(out.status,'SUGGESTION_NOT_APPROVED');assert.equal(out.sourceRevisionId,'scenario-r3');assert.equal(out.sourceIdeaId,'idea-audition-01');assert.deepEqual(out.sourceBeats,beats);
 assert.equal(out.revisedBeats[0].line,beats[0].line);assert.equal(out.revisedBeats[1].action,beats[1].action);
 assert.deepEqual(out.diff.map(x=>x.beatIndex),[2,3]);assert.equal(out.diagnosis.findings.length,2);assert.equal(out.diagnosis.storyMap.length,beats.length);assert.equal(out.diagnosis.findings[0].classification,'INTERPRETIVE_WEAKNESS');
 assert.equal(out.totalDurationSec,19);assert.equal(out.approval,undefined);assert.equal(out.editorialDecision,undefined);
 assert.equal(calls.length,3);assert.deepEqual(calls.map(c=>new URL(c.url).pathname),['/api/tags','/api/chat','/api/chat']);
 const first=JSON.parse(calls[1].options.body);assert.equal(first.format.type,'object');assert.deepEqual(first.format.required,['summary','findings']);
 const second=JSON.parse(calls[2].options.body);assert.equal(second.stream,false);assert.equal(second.model,'qwen2.5-coder:7b');
 assert.equal(second.format.type,'object');assert.deepEqual(second.format.required,['patches','changeSummary']);
 assert.equal(second.messages[1].content.includes('Финальный поворот не подготовлен.'),true);
 assert.equal(first.think,false);assert.equal(second.think,false);
 assert.equal(second.messages[1].content.includes('targetIndices'),true);
});
test('explicitly rejects remote and cloud endpoints and missing models before an AI request',async()=>{
 const {fetchImpl,calls}=fakeLocal({foundModels:['different:3b']});
 await assert.rejects(runLocalScriptDoctor(task,{fetchImpl,model:'qwen3:cloud'}),/локальная модель|локальной модели|cloud/i);
 await assert.rejects(runLocalScriptDoctor(task,{fetchImpl,endpoint:'https://ollama.com/'}),/loopback/);
 await assert.rejects(runLocalScriptDoctor(task,{fetchImpl,endpoint:'http://127.0.0.1.evil.com:11434/'}),/loopback/);
 await assert.rejects(runLocalScriptDoctor(task,{fetchImpl}),/не установлена/);
 assert.equal(calls.length,1);
});
test('locked or invalid indices are blocked without any model query',async()=>{
 const {fetchImpl,calls}=fakeLocal();
 assert.throws(()=>validateDoctorTask({...task,targetIndices:[0,2]}),/закрепил/);
 await assert.rejects(runLocalScriptDoctor({...task,targetIndices:[2,100]},{fetchImpl}),/индексы/);
 await assert.rejects(runLocalScriptDoctor({...task,script:{...task.script,currentRevisionId:'wrong'}},{fetchImpl}),/сохранённый сценарий/);
 assert.equal(calls.length,0);
});
test('unrequested, locked, duplicate and structurally invalid patches are rejected',async()=>{
 for(const revision of [
  {...candidate,patches:[{...candidate.patches[0],beatIndex:0}]},
  {...candidate,patches:[{...candidate.patches[0],beatIndex:1}]},
  {...candidate,patches:[candidate.patches[0],candidate.patches[0]]},
  {...candidate,patches:[{...candidate.patches[0],purpose:'ending'}]},
  {...candidate,patches:[{...candidate.patches[0],durationSec:0}]}
 ]){
  await assert.rejects(runLocalScriptDoctor(task,{fetchImpl:fakeLocal({revision}).fetchImpl}));
 }
});
test('no changes, duplicated dialogue and uniform mechanical timing are rejected',async()=>{
 const cases=[
  {...candidate,patches:[{beatIndex:2,line:beats[2].line,action:beats[2].action,durationSec:beats[2].durationSec}]},
  {...candidate,patches:[{...candidate.patches[0],line:beats[1].line}]}
 ];
 for(const revision of cases)
  await assert.rejects(runLocalScriptDoctor(task,{fetchImpl:fakeLocal({revision}).fetchImpl}));
 const wide={...task,targetIndices:[1,2,3]};
 const uniform={...candidate,patches:[1,2,3].map(beatIndex=>({
  beatIndex,line:'Изменённый кадр '+beatIndex,
  action:'Герой делает новое действие '+beatIndex,durationSec:3}))};
 await assert.rejects(runLocalScriptDoctor(wide,{fetchImpl:fakeLocal({revision:uniform}).fetchImpl}),/uniform/);
});
test('a minimal diagnosis without full story map is accepted for patch-only rewrite',async()=>{
 const minimal={summary:'Два финальных кадра слабы.',findings:diagnosis.findings};
 const out=await runLocalScriptDoctor(task,{fetchImpl:fakeLocal({notes:minimal}).fetchImpl});
 assert.equal(out.diagnosis.storyMap.length,0);
 assert.deepEqual(out.diff.map(x=>x.beatIndex),[2,3]);
});

test('model critique cannot address locked or irrelevant frames',async()=>{
 const wrong={...diagnosis,findings:[{...diagnosis.findings[0],beatIndex:0}]};
 await assert.rejects(runLocalScriptDoctor(task,{fetchImpl:fakeLocal({notes:wrong}).fetchImpl}),/неверная роль или кадр/);
});
test('nonexistent output does not become a fake draft; existing outputs cannot be overwritten',async(t)=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-local-doctor-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const input=join(dir,'task.json'),output=join(dir,'suggestion.json'),original=JSON.stringify(task);
 await writeFile(input,original);await runLocalScriptDoctorFiles(input,output,{fetchImpl:fakeLocal().fetchImpl});
 assert.equal(JSON.parse(await readFile(output,'utf8')).status,'SUGGESTION_NOT_APPROVED');
 assert.equal(await readFile(input,'utf8'),original);
 await assert.rejects(runLocalScriptDoctorFiles(input,output,{fetchImpl:fakeLocal().fetchImpl}),/EEXIST/);
 assert.deepEqual((await readdir(dir)).sort(),['suggestion.json','suggestion.json.artifacts','task.json']);
 const artifactDir=join(dir,'suggestion.json.artifacts');
 const stages=await readdir(artifactDir);
 for(const name of ['run.json','task.json','diagnosis.started.json','diagnosis.raw.txt','diagnosis.metrics.json','diagnosis.validated.json','revision.started.json','revision.raw.txt','revision.metrics.json','revision.validated.json','success.json'])assert.ok(stages.includes(name),name);
 const timings=JSON.parse(await readFile(join(artifactDir,'revision.metrics.json'),'utf8'));
 assert.equal(timings.status,'PARSED');assert.ok(timings.elapsedMs>=0);
});
test('a failed second pass leaves complete diagnostic artifacts without creating suggestion',async(t)=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-doctor-failed-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const input=join(dir,'task.json'),output=join(dir,'suggestion.json');
 await writeFile(input,JSON.stringify(task));
 let calls=0;const original=fakeLocal().fetchImpl;
 const corrupted=async(url,opts)=>{
  if(String(url).endsWith('/api/chat')&&++calls===2)
   return {ok:true,json:async()=>({message:{content:'broken-json'}})};
  return original(url,opts);
 };
 await assert.rejects(runLocalScriptDoctorFiles(input,output,{fetchImpl:corrupted}),/невалидный JSON/);
 const stages=await readdir(join(dir,'suggestion.json.artifacts'));
 for(const name of ['run.json','task.json','diagnosis.started.json','diagnosis.metrics.json','diagnosis.raw.txt','diagnosis.validated.json','revision.started.json','revision.metrics.json','revision.raw.txt','failure.json'])
  assert.ok(stages.includes(name),name);
 const failure=JSON.parse(await readFile(join(dir,'suggestion.json.artifacts','failure.json'),'utf8'));
 assert.equal(failure.state,'FAILED');assert.equal(failure.name,'Error');
 assert.equal(JSON.parse(await readFile(join(dir,'suggestion.json.artifacts','revision.metrics.json'),'utf8')).status,'FAILED');
 await assert.rejects(readFile(output),/ENOENT/);
});
test('resume after a failed second pass reuses validated critique and calls only the patch model',async(t)=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-doctor-resume-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const input=join(dir,'task.json'),failedOut=join(dir,'attempt-1.json'),resumedOut=join(dir,'attempt-2.json');
 await writeFile(input,JSON.stringify(task));
 let firstCalls=0;
 const original=async(url,opts)=>{
  if(String(url).endsWith('/api/tags'))return {ok:true,json:async()=>({models:[{name:'qwen2.5-coder:7b'}]})};
  firstCalls++;
  return {ok:true,json:async()=>({message:{content:firstCalls===1?JSON.stringify(diagnosis):'broken JSON'}})};
 };
 await assert.rejects(runLocalScriptDoctorFiles(input,failedOut,{fetchImpl:original}),/невалидный JSON/);
 const previous=failedOut+'.artifacts';
 assert.equal(JSON.parse(await readFile(join(previous,'failure.json'),'utf8')).state,'FAILED');
 let secondCalls=0;
 const patchOnly=async(url,opts)=>{
  if(String(url).endsWith('/api/tags'))return {ok:true,json:async()=>({models:[{name:'qwen2.5-coder:7b'}]})};
  secondCalls++;
  return {ok:true,json:async()=>({message:{content:JSON.stringify(candidate)}})};
 };
 await runLocalScriptDoctorFiles(input,resumedOut,{fetchImpl:patchOnly,resumeFrom:previous});
 assert.equal(secondCalls,1);
 const output=JSON.parse(await readFile(resumedOut,'utf8'));
 assert.deepEqual(output.diff.map(item=>item.beatIndex),[2,3]);
 assert.equal(output.status,'SUGGESTION_NOT_APPROVED');
 assert.equal(JSON.parse(await readFile(join(resumedOut+'.artifacts','diagnosis.reused.json'),'utf8')).revisionId,'scenario-r3');
 const files=await readdir(resumedOut+'.artifacts');
 assert.ok(files.includes('diagnosis.validated.json'));
 assert.ok(!files.includes('diagnosis.raw.txt'),'A resumed critique must not be falsely attributed to a new generation');
 assert.equal(await readFile(input,'utf8'),JSON.stringify(task));
});
test('resume refuses stale task, wrong model and edited diagnosis without producing an output',async(t)=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-doctor-resume-unsafe-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const input=join(dir,'task.json'),old=join(dir,'failed.json'),newOut=join(dir,'resumed.json');
 await writeFile(input,JSON.stringify(task));
 let calls=0;const fail=async(url)=>{
  if(String(url).endsWith('/api/tags'))return {ok:true,json:async()=>({models:[{name:'qwen2.5-coder:7b'}]})};
  calls++;return {ok:true,json:async()=>({message:{content:calls===1?JSON.stringify(diagnosis):'not-json'}})};
 };
 await assert.rejects(runLocalScriptDoctorFiles(input,old,{fetchImpl:fail}));
 const folder=old+'.artifacts';
 await assert.rejects(runLocalScriptDoctorFiles(input,newOut,{model:'qwen3:4b-instruct',resumeFrom:folder}),/model differs/);
 const changed={...task,instruction:'Новое совсем другое указание'};
 await writeFile(input,JSON.stringify(changed));
 await assert.rejects(runLocalScriptDoctorFiles(input,newOut,{resumeFrom:folder}),/task differs/);
 await writeFile(input,JSON.stringify(task));
 await writeFile(join(folder,'diagnosis.validated.json'),JSON.stringify({...diagnosis,findings:[]}));
 await assert.rejects(runLocalScriptDoctorFiles(input,newOut,{resumeFrom:folder}),/не содержит конкретных замечаний/);
 await assert.rejects(readFile(newOut),/ENOENT/);
});
test('bad JSON from local creative model fails rather than approving or writing anything',async()=>{
 const {fetchImpl}=fakeLocal();let seen=0;
 const corrupted=async(url,opts)=>{seen++;if(seen===3)return {ok:true,json:async()=>({message:{content:'not-json'}})};return fetchImpl(url,opts)};
 await assert.rejects(runLocalScriptDoctor(task,{fetchImpl:corrupted}),/невалидный JSON/);
});
