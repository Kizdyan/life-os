import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchBriefToLibrary,shootGapMarkdown} from './persona-library-shot-match.mjs';
const sha='a'.repeat(64);
const brief={version:1,ideaId:'idea-train-1',script:[
 {order:1,line:'Поезд уходит, а я остаюсь',action:'Герой стоит на платформе'},
 {order:2,line:'Мне пора начинать свою историю',action:'Актёр смотрит прямо в объектив'},
],shots:[
 {order:1,action:'Крупный план проезжающего поезда у платформы'},
 {order:2,action:'Портрет актёра, который смотрит в камеру'},
]};
function catalog(segmentSource='author_annotation'){
 return {kind:'persona-local-library-v1',generatedAt:'2026-11-03T18:00:00Z',assets:[
  {id:'sha256:'+sha,sourcePath:'C:/Persona/asset-library/inbox/train.mp4',
   sha256:sha,kind:'video',availability:'local',metadata:{durationSec:9},
   annotation:{description:'',tags:[],segments:segmentSource==='author_annotation'?[{
    startSec:2,endSec:5,description:'Поезд едет по железной дороге возле платформы',
    tags:['поезд','платформа'],source:'author_annotation'}]:[]},
   frames:segmentSource==='local_vision_model'?[{
    timeSec:3,description:'Поезд у платформы',tags:['поезд','платформа'],
    source:'local_vision_model',model:'vision-local'}]:[],
  },
 ]};
}
test('real annotated catalog matches train as candidate, NEVER marks shot as fully captured',()=>{
 const plan=matchBriefToLibrary({brief,catalog:catalog()});
 assert.equal(plan.kind,'persona-brief-local-asset-matches-v1');
 assert.equal(plan.totalShots,2);
 assert.equal(plan.matchedShots,1);
 assert.equal(plan.missingOrUnapprovedShots,2);
 assert.equal(plan.shots[0].status,'CANDIDATES_NEED_AUTHOR_REVIEW');
 assert.equal(plan.shots[0].candidates[0].startSec,2);
 assert.equal(plan.shots[0].candidates[0].endSec,5);
 assert.equal(plan.shots[0].candidates[0].evidence,'author_annotation');
 assert.equal(plan.shots[0].stillNeedsCaptureOrApproval,true);
 assert.equal(plan.shots[1].status,'NO_MATCH');
 assert.match(shootGapMarkdown(plan),/Нужна новая съёмка/);
 assert.equal(plan.publicationApproved,false);
});
test('vision-origin match displays actual local vision model and preserved frame timestamp',()=>{
 const plan=matchBriefToLibrary({brief,catalog:catalog('local_vision_model')});
 assert.equal(plan.matchedShots,1);
 assert.equal(plan.shots[0].candidates[0].visionModel,'vision-local');
 assert.equal(plan.shots[0].candidates[0].startSec,3);
 assert.equal(plan.shots[0].candidates[0].evidence,'local_vision_model');
});
test('missing assets never appear as ready-to-reuse; malformed brief blocked',()=>{
 const c=catalog();c.assets[0].availability='missing';
 assert.equal(matchBriefToLibrary({brief,catalog:c}).matchedShots,0);
 assert.throws(()=>matchBriefToLibrary({brief:{...brief,shots:[]},catalog:c}),/Valid canonical/);
 assert.throws(()=>matchBriefToLibrary({brief:{...brief,shots:[{...brief.shots[0],order:5},brief.shots[1]]},catalog:c}),/order mismatch/);
});
