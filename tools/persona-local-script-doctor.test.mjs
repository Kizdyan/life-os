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
const diagnosis={summary:'Финальный поворот не подготовлен.',findings:[
 {role:'dramaturg',beatIndex:2,issue:'Не проявлена новая цель.',evidence:'Пианино отвечает без изменения обстоятельств.',proposal:'Герой пробует перехватить инициативу и терпит неудачу.'},
 {role:'comedy',beatIndex:3,issue:'Панчлайн известен заранее.',evidence:'Финальная реплика буквально повторяет ожидаемую ситуацию.',proposal:'Пусть режиссёр зовёт пианино на следующую пробу, а герой становится аккомпаниатором.'}]};
const candidate={beats:[beats[0],beats[1],
 {...beats[2],line:'Я играю громче, но режиссёр обращается только к клавишам.',action:'Захлопываю партитуру и беззвучно показываю жест «я здесь».',durationSec:7},
 {...beats[3],line:'Меня взяли. Аккомпанировать пианино.',action:'Убираю стул и торжественно уступаю место инструменту.',durationSec:4}],
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
 assert.deepEqual(out.diff.map(x=>x.beatIndex),[2,3]);assert.equal(out.diagnosis.findings.length,2);
 assert.equal(out.totalDurationSec,19);assert.equal(out.approval,undefined);assert.equal(out.editorialDecision,undefined);
 assert.equal(calls.length,3);assert.deepEqual(calls.map(c=>new URL(c.url).pathname),['/api/tags','/api/chat','/api/chat']);
 const first=JSON.parse(calls[1].options.body);assert.equal(first.format.type,'object');assert.deepEqual(first.format.required,['summary','findings']);
 const second=JSON.parse(calls[2].options.body);assert.equal(second.stream,false);assert.equal(second.model,'qwen2.5-coder:7b');
 assert.equal(second.format.type,'object');assert.deepEqual(second.format.required,['beats','changeSummary']);
 assert.equal(second.messages[1].content.includes('Финальный поворот не подготовлен.'),true);
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
test('unrequested edits, removed beats and wrong narrative purpose are rejected',async()=>{
 for(const revision of [
  {...candidate,beats:[{...beats[0],line:'Новый хук'},...candidate.beats.slice(1)]},
  {...candidate,beats:candidate.beats.slice(0,3)},
  {...candidate,beats:candidate.beats.map((b,i)=>i===2?{...b,purpose:'ending'}:b)},
 ]){
  await assert.rejects(runLocalScriptDoctor(task,{fetchImpl:fakeLocal({revision}).fetchImpl}));
 }
});
test('no changes, duplicated dialogue and uniform mechanical timing are rejected',async()=>{
 const cases=[
  {...candidate,beats},
  {...candidate,beats:candidate.beats.map((b,i)=>i===2?{...b,line:beats[1].line}:b)},
  {...candidate,beats:candidate.beats.map((b,i)=>({...b,durationSec:5}))},
 ];
 for(const revision of cases)await assert.rejects(runLocalScriptDoctor(task,{fetchImpl:fakeLocal({revision}).fetchImpl}));
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
 assert.deepEqual((await readdir(dir)).sort(),['suggestion.json','task.json']);
});
test('bad JSON from local creative model fails rather than approving or writing anything',async()=>{
 const {fetchImpl}=fakeLocal();let seen=0;
 const corrupted=async(url,opts)=>{seen++;if(seen===3)return {ok:true,json:async()=>({message:{content:'not-json'}})};return fetchImpl(url,opts)};
 await assert.rejects(runLocalScriptDoctor(task,{fetchImpl:corrupted}),/невалидный JSON/);
});
