import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generatePersonaLocalScenario,runPersonaLocalScenario} from './persona-local-scenario.mjs';

const story={
 premise:'Герой входит в зал кастинга не в ту дверь и встречает грозного режиссёра',
 hook:'Он видит своё имя рядом с неизвестной ролью на двери',
 protagonistGoal:'Добиться настоящей кинопробы, пока кастинг не закрыли',
 obstacle:'Администратор считает, что его уже прослушали и не допускает',
 escalation:'Герой пытается сыграть пробу с человеком из очереди',
 turn:'Режиссёр неожиданно начинает давать ему задачи из коридора',
 payoff:'Оказывается, эта импровизация и была его пробой',
 actingAction:'Добиваться внимания, скрывая сильное волнение',
 visualMoment:'Герой репетирует перед закрытой дверью, зритель видит отражение'
};
const req={kind:'persona-scenario-local-input-v1',version:1,idea:{
 id:'project-1',title:'Оригинальные кинопробы',angle:'Ситуация: необычная кинопроба\nПоворот: дверь в зал всё время открыта',format:'reel'
},storyOutline:story,sourceReferenceUrl:'https://www.instagram.com/reel/abc123/'};
const modelOutput={
 review:{dramaturg:['Нужна более конкретная причина закрытой двери.'],
 director:['Покажи, как герой борется за пробу невербально.'],
 producer:['Начни с указателя на неправильную дверь.']},
 beats:[
  {line:'Меня не пустили на кастинг.',action:'Скрывает растерянность',durationSec:3,framing:'close-up',angle:'С уровня глаз',cameraMovement:'Статика',lighting:'Мягкий свет',shotAction:'Смотрит на закрытую дверь'},
  {line:'Но я всё равно решил сыграть.',action:'Пробует договориться',durationSec:4,framing:'medium',angle:'Профиль',cameraMovement:'Небольшой пан',lighting:'Коридорный свет',shotAction:'Говорит в сторону комнаты'},
  {line:'Вы, оказывается, меня уже посмотрели.',action:'Старается сохранить достоинство',durationSec:5,framing:'close-up',angle:'Фронтальный план',cameraMovement:'Статика',lighting:'Мягкий свет',shotAction:'Взгляд на режиссёра'}
 ]
};
function mocked(available=['qwen2.5:7b'],result=modelOutput){
 const calls=[];
 const fetchImpl=async(url,opt)=>{
  calls.push({url:String(url),opt});
  if(String(url).endsWith('/api/tags'))return {ok:true,json:async()=>({models:available.map(name=>({name}))})};
  if(String(url).endsWith('/api/chat'))return {ok:true,json:async()=>({message:{content:JSON.stringify(result)}})};
  throw Error('unexpected URL');
 };
 return {calls,fetchImpl};
}
test('local request creates exact importable brief, three review roles and no publication decision',async()=>{
 const {calls,fetchImpl}=mocked();
 const {brief,review}=await generatePersonaLocalScenario(req,{fetchImpl});
 assert.equal(calls.length,2);
 assert.equal(calls[0].url,'http://127.0.0.1:11434/api/tags');
 assert.equal(calls[1].url,'http://127.0.0.1:11434/api/chat');
 assert.equal(JSON.parse(calls[1].opt.body).stream,false);
 assert.equal(brief.ideaId,req.idea.id);
 assert.equal(brief.sourceAngle,req.idea.angle);
 assert.equal(brief.script[0].line,brief.hook.firstSeconds);
 assert.equal(brief.shots.length,3);
 assert.equal(brief.adaptations.reels.durationSec,12);
 assert.equal(brief.adaptations.shorts.durationSec,12);
 assert.equal(brief.factReferences.length,0);
 assert.equal(review.status,'DRAFT_REQUIRES_HUMAN_EDITORIAL_APPROVAL');
 assert.equal(review.referenceUrl,req.sourceReferenceUrl);
 assert.ok(review.notes.producer[0].includes('дверь'));
 assert.equal(brief.editorialDecision,undefined);
});
test('passes only explicitly rejected editorial feedback to local model, preserving notes for review',async()=>{
 const {calls,fetchImpl}=mocked();
 const input={...req,previousEditorialFeedback:'Финал примитивен; нет причинной эскалации и актёрской задачи.'};
 const result=await generatePersonaLocalScenario(input,{fetchImpl});
 const outbound=JSON.parse(calls[1].opt.body);
 const prompt=outbound.messages[1].content;
 const sentInput=JSON.parse(prompt.slice(prompt.indexOf('{')));
 assert.equal(sentInput.previousEditorialFeedback,input.previousEditorialFeedback);
 assert.equal(result.review.previousEditorialFeedback,input.previousEditorialFeedback);
});
test('rejects cloud model, remote endpoint and disallows even a tags request',async()=>{
 const {calls,fetchImpl}=mocked();
 await assert.rejects(generatePersonaLocalScenario(req,{fetchImpl,model:'qwen3:cloud'}),/локальные модели/);
 await assert.rejects(generatePersonaLocalScenario(req,{fetchImpl,endpoint:'https://ollama.com'}),/локальный Ollama/);
 await assert.rejects(generatePersonaLocalScenario(req,{fetchImpl,endpoint:'http://example.com:11434'}),/локальный Ollama/);
 await assert.rejects(generatePersonaLocalScenario(req,{fetchImpl,endpoint:'http://127.0.0.1:11434/@attacker'}),/локальный Ollama/);
 assert.equal(calls.length,0);
});
test('missing locally installed model is an explicit error and never downloads cloud model',async()=>{
 const {calls,fetchImpl}=mocked(['different:3b']);
 await assert.rejects(generatePersonaLocalScenario(req,{fetchImpl}),/не установлена локально/);
 assert.equal(calls.length,1);
});
test('does not produce a fake brief on hallucinated schema, inadequate criticism or unsupported claims',async()=>{
 for(const output of [{...modelOutput,beats:[]},{...modelOutput,review:{...modelOutput.review,producer:[]}},
  {...modelOutput,beats:[...modelOutput.beats.slice(0,2),{...modelOutput.beats[2],durationSec:-1}]}]){
  const {fetchImpl}=mocked(['qwen2.5:7b'],output);
  await assert.rejects(generatePersonaLocalScenario(req,{fetchImpl}));
 }
});
test('refuses malformed input or local-looking malicious URL, without network calls',async()=>{
 const {calls,fetchImpl}=mocked();
 await assert.rejects(generatePersonaLocalScenario({...req,kind:'x'},{fetchImpl}),/формат входного JSON/);
 await assert.rejects(generatePersonaLocalScenario({...req,storyOutline:{...story,obstacle:''}},{fetchImpl}),/storyOutline.obstacle/);
 await assert.rejects(generatePersonaLocalScenario({...req,sourceReferenceUrl:'http://instagram.com/a'},{fetchImpl}),/HTTPS/);
 assert.equal(calls.length,0);
});
test('writes two reviewable files, refuses overwrite and leaves original request intact',async(t)=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-zero-credits-'));
 t.after(async()=>rm(dir,{recursive:true,force:true}));
 const source=join(dir,'input.json'),output=join(dir,'brief.json');
 const input=JSON.stringify(req);
 await writeFile(source,input);
 const {fetchImpl}=mocked();
 await runPersonaLocalScenario(source,output,{fetchImpl});
 const brief=JSON.parse(await readFile(output,'utf8'));
 const review=JSON.parse(await readFile(output+'.review.json','utf8'));
 assert.equal(brief.sourceTitle,req.idea.title);
 assert.equal(review.status,'DRAFT_REQUIRES_HUMAN_EDITORIAL_APPROVAL');
 assert.equal(await readFile(source,'utf8'),input);
 await assert.rejects(runPersonaLocalScenario(source,output,{fetchImpl}),/EEXIST/);
 assert.deepEqual((await readdir(dir)).sort(),['brief.json','brief.json.review.json','input.json']);
});
