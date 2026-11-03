import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {judgePersonaIdeas,validateJudgeConfig,validateVerdicts,validateCrossReview} from './persona-idea-jury.mjs';

const ideas=[
 {id:'idea-1',title:'Актёрская пауза и фортепиано',angle:'Герой пытается играть трагедию, а музыка превращает сцену в комедию.',
  hook:'Музыка решила всё иначе',format:'reel'},
 {id:'idea-2',title:'Режиссёр на репетиции',angle:'Режиссёр меняет эмоциональный жанр сцены одним жестом.',
  hook:'Мой новый режиссёр — музыка',format:'reel'},
 {id:'idea-3',title:'Короткий этюд на вокзале',angle:'Ожидание героя оборачивается абсурдным музыкальным финалом.',
  hook:'Я ждал совсем другого',format:'reel'},
];
const config=[
 {role:'producer',server:{id:'producer-local',baseUrl:'http://127.0.0.1:11434',model:'independent-model-a'}},
 {role:'dramaturg',server:{id:'dramaturg-local',baseUrl:'http://127.0.0.1:11434',model:'independent-model-b'}},
];
const proposal={version:1,kind:'persona-idea-proposal-v1',
 status:'AWAITING_AUTHOR_IDEA_SELECTION',selectedIdeaId:null,
 screenplayGenerated:false,publicationApproved:false,
 theme:'Актёрство, музыка и режиссура в коротких роликах',style:'humor',ideas,
 provider:{id:'generator-local',model:'generator'}};
function mockJudge(calls,{badCross=false}={}){
 return async(url,opts)=>{
  const req=JSON.parse(opts.body),profile=JSON.parse(req.messages[1].content);
  const model=req.model,cross=req.messages[0].content.includes('ВТОРОЙ раунд');
  calls.push({model,cross,profile});
  assert.equal(url,'http://127.0.0.1:11434/api/chat');
  assert.equal(req.stream,false);
  assert.equal(req.format,'json');
  if(cross){
   assert.ok(Array.isArray(profile.independentPeerVerdicts));
   assert.equal(profile.independentPeerVerdicts.length,1);
   assert.notEqual(profile.independentPeerVerdicts[0].provider.model,model);
   assert.equal(profile.ownVerdicts.length,3);
   if(badCross&&model==='independent-model-b')
    return {ok:true,json:async()=>({message:{content:JSON.stringify({responses:[]})}})};
   return {ok:true,json:async()=>({message:{content:JSON.stringify({
    responses:ideas.map(item=>({ideaId:item.id,position:'partial',
     why:'Сомнения второго эксперта имеют значение, но драматургическая логика сохраняется.',
     nextEdit:'Уточнить хук и сократить длинное вступление.'})),
   })}})};
  }
  assert.equal(profile.independentPeerVerdicts,undefined,
   'First pass must be blind to other judges');
  assert.equal(profile.evidenceLimits.instagramInsights,false);
  return {ok:true,json:async()=>({message:{content:JSON.stringify({
   verdicts:ideas.map((item,i)=>({
    ideaId:item.id,
    decision:i===0?(model==='independent-model-a'?'advance':'reject'):'revise',
    score:i===0?(model==='independent-model-a'?5:1):3,
    reason:'Концепция имеет интересный актёрский конфликт и требует ясной мизансцены.',
    risk:'Риск предсказуемого монтажного финала и затянутого вступления.',
    improvement:'Сделать первую секунду конкретнее и усилить последний поворот.',
   })),
  })}})};
 };
}
test('real HTTP model call protocol: 2 independent first passes then 2 distinct peer critiques; no phantom trends',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-jury-test-'));const calls=[];
 try{
  const input=join(root,'IDEAS.json'),out=join(root,'jury');
  await writeFile(input,JSON.stringify(proposal,null,2));
  const result=await judgePersonaIdeas({proposalPath:input,outputDir:out,
   judges:config,fetchImpl:mockJudge(calls)});
  assert.equal(result.status,'AWAITING_AUTHOR_IDEA_SELECTION');
  assert.equal(result.modelCalls,4);
  assert.equal(result.distinctModels,2);
  assert.equal(result.authorDecisionRequired,true);
  assert.equal(result.publicationApproved,false);
  assert.equal(calls.length,4);
  assert.equal(calls.filter(x=>!x.cross).length,2);
  assert.equal(calls.filter(x=>x.cross).length,2);
  const report=JSON.parse(await readFile(result.report,'utf8'));
  assert.equal(report.kind,'persona-independent-idea-jury-v1');
  assert.equal(report.independence.differentModelIds,true);
  assert.equal(report.independence.firstPassBlindToPeers,true);
  assert.equal(report.independence.secondPassCrossExamination,true);
  assert.equal(report.independence.localOnly,true);
  assert.equal(report.evidenceLimits.instagramInsights,'NOT_SUPPLIED_TO_JURY');
  assert.equal(report.evidenceLimits.liveTrends,'NOT_VERIFIED');
  assert.equal(report.firstPass[0].verdicts.length,3);
  assert.equal(report.secondPass[1].responses.length,3);
  assert.equal(report.ideas.length,3);
  assert.equal(report.ideas[0].decisionDisagreement,true);
  assert.equal(report.ideas[0].scoreSpread,4);
  assert.equal(report.ideas[0].editorialMeanScore,3);
  assert.equal(report.selectionApproved,false);
  assert.equal(report.publicationApproved,false);
  assert.match(await readFile(result.readableReport,'utf8'),/Разногласия: ДА/);
  assert.match(report.proposalSha256,/^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(report).includes('tokenEnv'));
 }finally{await rm(root,{recursive:true,force:true})}
});
test('fail closed when judges use the same model, remote endpoint, or forged candidate verdicts',async()=>{
 assert.throws(()=>validateJudgeConfig([
  config[0],{...config[1],server:{...config[1].server,model:'independent-model-a'}},
 ]),/SAME model/);
 assert.throws(()=>validateJudgeConfig([
  config[0],{...config[1],server:{...config[1].server,baseUrl:'https://example.com'}},
 ]),/local loopback/);
 assert.throws(()=>validateVerdicts({verdicts:[
  {ideaId:'idea-1',score:5,decision:'advance',reason:'short',risk:'short',improvement:'short'},
 ]},ideas),/every candidate/);
 assert.throws(()=>validateCrossReview({responses:ideas.map(item=>({
  ideaId:item.id,position:'agree',why:'short',nextEdit:'short',
 }))},ideas),/Insufficient cross-examination/);
});
test('incomplete second model critique cannot produce fake reviewed board or partial success',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-jury-failed-'));const calls=[];
 try{
  const input=join(root,'IDEAS.json'),out=join(root,'jury');
  await writeFile(input,JSON.stringify(proposal));
  await assert.rejects(judgePersonaIdeas({proposalPath:input,outputDir:out,
   judges:config,fetchImpl:mockJudge(calls,{badCross:true})}),
   /Cross-examination must cover every candidate/);
  await assert.rejects(stat(out),/ENOENT/);
  assert.equal(calls.length,4);
 }finally{await rm(root,{recursive:true,force:true})}
});
