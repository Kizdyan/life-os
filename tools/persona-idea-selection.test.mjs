import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {proposePersonaIdeas,selectPersonaIdea} from './persona-idea-selection.mjs';
import {preparePersonaFlow} from './persona-flow.mjs';

const ideas={ideas:[
 {title:'Музыка меняет эмоцию',angle:'Один и тот же взгляд меняет смысл под разные музыкальные акценты.',hook:'Музыка обманывает зрителя'},
 {title:'Театральная репетиция',angle:'Режиссёр выбирает жанр, а исполнитель неожиданно превращает монолог в комедию.',hook:'Кто здесь действительно режиссёр?'},
 {title:'Клавиши и актёр',angle:'Небольшой скетч про актёра, который пытается сыграть мелодию глазами.',hook:'Эта музыка звучит совсем не так'},
]};
const director={hook:'Кто здесь действительно режиссёр?',setup:{
 location:'Тихая домашняя репетиционная комната',camera:'Смартфон вертикально на штативе',
 lighting:'Мягкий боковой свет от окна',sound:'Близкий микрофон с комнатным тоном',
 wardrobe:'Однотонная рубашка и пиджак',arrangement:'Стол и пианино рядом друг с другом',
},scenes:[
 {durationSec:4,line:'Сегодня я режиссёр',action:'Герой раскрывает сценарий на столе',
  framing:'medium',camera:'Статичный средний план',lighting:'Мягкий свет сбоку',
  performance:'Уверенно и спокойно',edit:'Взгляд в сторону'},
 {durationSec:4,line:'Тогда сыграй комедию',action:'Персонаж указывает на раскрытые ноты',
  framing:'close-up',camera:'Крупный план с штатива',lighting:'Нейтральный мягкий свет',
  performance:'Иронично и доброжелательно',edit:'Резкая склейка по жесту'},
 {durationSec:4,line:'Но я хотел трагедию',action:'Герой медленно закрывает сценарий',
  framing:'close-up',camera:'Крупный план лица',lighting:'Мягкий боковой свет',
  performance:'Настоящее недоумение',edit:'Короткая пауза'},
 {durationSec:4,line:'А музыка решила иначе',action:'Композитор играет последний аккорд',
  framing:'detail',camera:'Детальный план на клавиатуру',lighting:'Нейтральный заполняющий свет',
  performance:'Сдержанная улыбка',edit:'Финальная склейка на аккорд'},
 ],editingIntent:'Драматические паузы переходят в комедийные музыкальные акценты',
 colorIntent:'Натуральные цвета кожи без жёлтого тона и сохранённые очки'};
const server=[{id:'local',baseUrl:'http://127.0.0.1:11434',model:'installed-real-model'}];
function fiveDrafts(){return {ideas:Array.from({length:5},(_,i)=>({...ideas.ideas[i%3],title:'Новая концепция номер '+(i+1),skills:['actor','director','composer'].map(role=>({role,action:'Конкретное экранное действие'})),music:'Фортепиано и контраст струнных',actingTask:'Скрыть намерение от собеседника',sellingEnding:'Сыграю, сниму и напишу музыку для вашего фильма.'}))}}
function criticReply(values=[7,9,6,10,8]){return {reviews:values.map((v,i)=>({ideaId:'idea-'+(i+1),scores:{visuality:v,actingRange:v,sellingPotential:v,hook:v},banal:false,showsActing:true,reason:'Конкретный разбор действия, конфликта и демонстрации трёх навыков.'}))}}
function answerResponse(answer,streaming){const content=JSON.stringify(answer);return streaming?{ok:true,body:new Response(JSON.stringify({message:{content},done:true,done_reason:'stop'})+'\n').body}:{ok:true,json:async()=>({message:{content}})}}
test('two separate same-model passes expose only top2 and preserve filtered IDs into the director',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-generator-critic-')),calls=[];
 const fetchImpl=async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);const system=body.messages[0].content;const answer=system.includes('строгий кастинг-директор')?criticReply():system.includes('<author_examples>')?fiveDrafts():director;return answerResponse(answer,body.stream)};
 try{
  const result=await proposePersonaIdeas({theme:'Три навыка через оригинальную экранную историю',outputDir:join(root,'proposal'),servers:server,contentFormat:'acting',ideaCount:5,audit:true,fetchImpl});
  assert.equal(calls.length,2);assert.equal(calls[0].model,calls[1].model);assert.notEqual(calls[0].messages[0].content,calls[1].messages[0].content);
  assert.equal(JSON.parse(calls[1].messages[1].content).ideas.length,5);
  const saved=JSON.parse(await readFile(result.ideasPath,'utf8'));assert.deepEqual(saved.ideas.map(i=>i.id),['idea-4','idea-2']);assert.equal(saved.draftIdeas.length,5);
  await assert.rejects(selectPersonaIdea({proposalPath:result.ideasPath,ideaId:'idea-1',outputDir:join(root,'rejected'),servers:server,fetchImpl}),/No such candidate/);assert.equal(calls.length,2);
  await selectPersonaIdea({proposalPath:result.ideasPath,ideaId:'idea-4',outputDir:join(root,'selected'),servers:server,fetchImpl});
  assert.equal(JSON.parse(calls[2].messages[1].content).idea.id,'idea-4');
  const plan=JSON.parse(await readFile(join(root,'selected','PRODUCTION-BRIEF.json'),'utf8'));assert.equal(plan.ideaId,'idea-4');
  saved.ideas[0]=saved.draftIdeas[0];await writeFile(result.ideasPath,JSON.stringify(saved));
  await assert.rejects(selectPersonaIdea({proposalPath:result.ideasPath,ideaId:'idea-1',outputDir:join(root,'forged'),servers:server,fetchImpl}),/audit|Audit/);assert.equal(calls.length,3);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('failed critic retains draft evidence but cannot produce a selectable proposal',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-critic-failed-'));let calls=0;
 try{
  await assert.rejects(proposePersonaIdeas({theme:'Реальная идея без фальшивого аудита',outputDir:join(root,'proposal'),servers:server,contentFormat:'comedy',ideaCount:5,audit:true,fetchImpl:async()=>++calls===1?answerResponse(fiveDrafts(),true):{ok:false,status:503}}),/critic|Critic/);
  assert.equal(calls,2);assert.equal(JSON.parse(await readFile(join(root,'proposal','DRAFTS.json'),'utf8')).ideas.length,5);
  await assert.rejects(stat(join(root,'proposal','IDEAS.json')),/ENOENT/);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('a valid all-rejected audit is saved honestly and never auto-generates a screenplay',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-critic-empty-'));let calls=0;
 try{
  const result=await proposePersonaIdeas({theme:'Проверка честного отказа всем пяти идеям',outputDir:join(root,'proposal'),servers:server,contentFormat:'comedy',ideaCount:5,audit:true,fetchImpl:async()=>answerResponse(++calls===1?fiveDrafts():criticReply([7,7,7,7,7]),true)});
  const saved=JSON.parse(await readFile(result.ideasPath,'utf8'));assert.equal(saved.status,'NO_IDEAS_PASSED_AUDIT');assert.deepEqual(saved.ideas,[]);assert.equal(saved.audit.reviews.length,5);assert.equal(calls,2);
  await assert.rejects(selectPersonaIdea({proposalPath:result.ideasPath,ideaId:'idea-1',outputDir:join(root,'never'),servers:server,fetchImpl:async()=>{throw Error('Must not generate a screenplay')}}));
  await assert.rejects(stat(join(root,'never')),/ENOENT/);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('commercial examples and three-skill details survive proposal and chosen-idea director handoff',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-commercial-proposal-')),requests=[];
 const enriched={ideas:ideas.ideas.map(i=>({...i,skills:['actor','director','composer'].map(role=>({role,action:'Конкретное действие на экране'})),music:'Пиццикато переходит в оркестровый удар',actingTask:'Убедить сомневающегося клиента',sellingEnding:'Сыграю, сниму и напишу музыку для вашего проекта.'}))};
 const fetchImpl=async(url,options)=>{const request=JSON.parse(options.body);requests.push(request);return {ok:true,json:async()=>({message:{content:JSON.stringify(request.messages[0].content.includes('<author_examples>')?enriched:director)}})}};
 try{
  const result=await proposePersonaIdeas({theme:'Самоирония актёра, режиссёра и композитора',contentFormat:'comedy',servers:server,outputDir:join(root,'ideas'),fetchImpl});
  const proposal=JSON.parse(await readFile(result.ideasPath,'utf8'));
  assert.equal(proposal.contentFormat,'comedy');assert.equal(proposal.ideas[0].skills.length,3);
  assert.equal(requests[0].options.num_ctx,8192);assert.equal(requests[0].think,false);assert.match(requests[0].messages[0].content,/Играть три разные цели/);
  await selectPersonaIdea({proposalPath:result.ideasPath,ideaId:'idea-2',outputDir:join(root,'plan'),servers:server,fetchImpl});
  const payload=JSON.parse(requests[1].messages[1].content);
  assert.equal(payload.idea.music,enriched.ideas[1].music,'Music intent cannot be lost during director handoff');
  const brief=JSON.parse(await readFile(join(root,'plan','PRODUCTION-BRIEF.json'),'utf8'));
  assert.equal(brief.commercialIntent.sellingEnding,enriched.ideas[1].sellingEnding);
 }finally{await rm(root,{recursive:true,force:true})}
});
const mock=(history)=>async(url,options)=>{
 history.push({url,body:JSON.parse(options.body)});
 const sys=history.at(-1).body.messages[0].content;
 const answer=sys.includes('Ты предлагаешь')?ideas:director;
 return {ok:true,json:async()=>({message:{content:JSON.stringify(answer)}})};
};
test('real model proposes 3 ideas, stops without screenplay, and only explicit idea-3 gets director',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-idea-choose-'));const calls=[];
 try{
  const proposalPath=join(root,'proposal'),planPath=join(root,'selected-plan');
  const proposed=await proposePersonaIdeas({
   theme:'Музыка и режиссура в коротком актёрском скетче',
   style:'humor',outputDir:proposalPath,servers:server,fetchImpl:mock(calls)});
  assert.equal(proposed.status,'AWAITING_AUTHOR_IDEA_SELECTION');
  assert.equal(proposed.ideas,3);
  assert.equal(calls.length,1,'Proposal calls model once, no director');
  assert.match(calls[0].body.messages[0].content,/Ты предлагаешь/);
  await assert.rejects(stat(join(proposalPath,'PRODUCTION-BRIEF.json')),/ENOENT/);
  const stored=JSON.parse(await readFile(proposed.ideasPath,'utf8'));
  assert.equal(stored.selectedIdeaId,null);
  assert.equal(stored.publicationApproved,false);
  assert.equal(stored.provider.id,'local');
  assert.match(await readFile(proposed.readableIdeas,'utf8'),/idea-3/);
  const completed=await selectPersonaIdea({
   proposalPath:proposed.ideasPath,ideaId:'idea-3',outputDir:planPath,
   servers:server,fetchImpl:mock(calls)});
  assert.equal(calls.length,2,'Selecting an existing idea calls ONLY director, not generator again');
  assert.match(calls[1].body.messages[0].content,/Ты ИИ-режиссёр/);
  assert.equal(calls[1].body.messages[1].content.includes('Клавиши и актёр'),true);
  assert.equal(calls[1].body.messages[1].content.includes('Театральная репетиция'),false);
  assert.equal(completed.selectedIdeaId,'idea-3');
  assert.equal(completed.ideaSelectionMode,'explicit_saved_candidate');
  assert.equal(completed.publicationApproved,false);
  const result=JSON.parse(await readFile(join(planPath,'FLOW.json'),'utf8'));
  const brief=JSON.parse(await readFile(join(planPath,'PRODUCTION-BRIEF.json'),'utf8'));
  assert.equal(result.selectedIdeaId,'idea-3');
  assert.equal(result.ideaSelectionMode,'explicit_saved_candidate');
  assert.equal(result.status,'WAITING_FOR_FOOTAGE');
  assert.match(result.sourceProposalSha256,/^[a-f0-9]{64}$/);
  assert.equal(result.providers.ideas.id,'local');
  assert.equal(result.publicationApproved,false);
  assert.equal(brief.ideaId,'idea-3');
  assert.equal(brief.sourceTitle,'Клавиши и актёр');
  assert.equal(brief.script.length,4);
  assert.match(await readFile(join(planPath,'SHOOT.md'),'utf8'),/Клавиши и актёр/);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('missing or forged idea ID, tampered format, and existing directory fail without model calls',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-idea-blocked-'));const calls=[];
 try{
  const proposed=await proposePersonaIdeas({
   theme:'Режиссёрская и музыкальная сцена для Reels',
   outputDir:join(root,'proposal'),servers:server,fetchImpl:mock(calls)});
  assert.equal(calls.length,1);
  await assert.rejects(selectPersonaIdea({proposalPath:proposed.ideasPath,
   ideaId:'idea-99',outputDir:join(root,'missing'),servers:server,fetchImpl:mock(calls)}),
   /No such candidate/);
  assert.equal(calls.length,1);
  await assert.rejects(stat(join(root,'missing')),/ENOENT/);
  const source=JSON.parse(await readFile(proposed.ideasPath,'utf8'));
  source.ideas[1].format='photo';
  const forged=join(root,'forged.json');
  await writeFile(forged,JSON.stringify(source));
  await assert.rejects(selectPersonaIdea({proposalPath:forged,
   ideaId:'idea-2',outputDir:join(root,'forged-plan'),servers:server,fetchImpl:mock(calls)}),
   /formats were changed/);
  assert.equal(calls.length,1);
  await assert.rejects(stat(join(root,'forged-plan')),/ENOENT/);
  await assert.rejects(proposePersonaIdeas({theme:'Режиссёрская и музыкальная сцена для Reels',
   outputDir:join(root,'proposal'),servers:server,fetchImpl:mock(calls)}),/Output exists/);
  assert.equal(calls.length,1);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('legacy prepare preserves explicit warning that first idea was automatic, not human-approved',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-ideas-legacy-'));const calls=[];
 try{
  const result=await preparePersonaFlow({
   theme:'Кино и режиссура в коротком музыкальном скетче',outputDir:join(root,'plan'),
   servers:server,fetchImpl:mock(calls)});
  assert.equal(result.selectedIdeaId,'idea-1');
  assert.equal(result.ideaSelectionMode,'legacy_automatic_first');
  assert.equal(calls.length,2);
  const meta=JSON.parse(await readFile(join(root,'plan','FLOW.json'),'utf8'));
  assert.equal(meta.ideaSelectionMode,'legacy_automatic_first');
  assert.equal(meta.publicationApproved,false);
 }finally{await rm(root,{recursive:true,force:true})}
});
