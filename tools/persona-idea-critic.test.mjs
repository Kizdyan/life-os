import {test} from 'node:test';import assert from 'node:assert/strict';
import {evaluateIdeaAudit,verifyIdeaAudit,auditCriteria} from '../packages/core/src/persona-idea-audit.mjs';
const ideas=Array.from({length:5},(_,i)=>({id:'idea-'+(i+1),title:'Концепция номер '+(i+1)}));
const scores=(a,b=a,c=a,d=a)=>({visuality:a,actingRange:b,sellingPotential:c,hook:d});
const reply=values=>({reviews:values.map((s,i)=>({ideaId:ideas[i].id,scores:s,banal:false,showsActing:true,reason:'Конкретный аргумент о сцене и демонстрации навыков.'}))});
test('Showcase v2 uses three criteria without changing historical four-criterion audits',()=>{
 const raw=reply([8,9,7,10,8].map(n=>({visuality:n,actingRange:n,sellingPotential:n})));
 const audit=evaluateIdeaAudit(ideas,raw,{version:2});
 assert.equal(audit.version,2);assert.equal(audit.kind,'persona-generator-critic-v2');
 assert.deepEqual(auditCriteria(2),['visuality','actingRange','sellingPotential']);
 assert.deepEqual(audit.selectedIdeaIds,['idea-4','idea-2']);assert.equal(audit.reviews[0].average,8);
 assert.deepEqual(verifyIdeaAudit(JSON.parse(JSON.stringify(audit))),audit);
 const legacy=evaluateIdeaAudit(ideas,reply(ideas.map(()=>scores(8))));assert.equal(legacy.version,1);assert.equal(verifyIdeaAudit(legacy).reviews[0].scores.hook,8);
 raw.reviews[0].scores.hook=10;assert.throws(()=>evaluateIdeaAudit(ideas,raw,{version:2}));
 delete raw.reviews[0].scores.hook;raw.reviews[0].banal=true;raw.reviews[1].showsActing=false;
 const strict=evaluateIdeaAudit(ideas,raw,{version:2});assert.equal(strict.reviews[0].scores.sellingPotential,1);assert.equal(strict.reviews[1].scores.actingRange,1);
 assert.throws(()=>auditCriteria(3));
});
test('exact means, stable ties and top-two limit are calculated in code, never supplied by the critic',()=>{
 const raw=reply([scores(8),scores(10),scores(7,8,8,8),scores(9),scores(9)]),audit=evaluateIdeaAudit(ideas,raw);
 assert.deepEqual(audit.selectedIdeaIds,['idea-2','idea-4']);
 assert.equal(audit.reviews[0].average,8);assert.equal(audit.reviews[2].average,7.75);
 assert.equal(audit.reviews[2].decision,'below_threshold');assert.equal(audit.reviews[4].decision,'outside_top_two');
 assert.deepEqual(verifyIdeaAudit(audit).selectedIdeaIds,audit.selectedIdeaIds);
 assert.throws(()=>verifyIdeaAudit({...audit,selectedIdeaIds:['idea-3']}));
});
test('banality or absent acting forces a1 and cannot be compensated by three tens',()=>{
 const raw=reply(Array.from({length:5},()=>scores(10)));raw.reviews[0].banal=true;raw.reviews[1].showsActing=false;
 const audit=evaluateIdeaAudit(ideas,raw);assert.equal(audit.reviews[0].scores.hook,1);assert.equal(audit.reviews[1].scores.actingRange,1);
 assert.equal(audit.reviews[0].average,7.75);assert.equal(audit.reviews[1].average,7.75);
 assert.deepEqual(audit.reviews[0].modelScores,scores(10));assert.ok(audit.reviews[0].appliedRules.length);
});
test('zero or one winner stays zero or one, without fabricated praise or filler',()=>{
 assert.deepEqual(evaluateIdeaAudit(ideas,reply(ideas.map(()=>scores(7)))).selectedIdeaIds,[]);
 assert.deepEqual(evaluateIdeaAudit(ideas,reply([scores(8),scores(7),scores(7),scores(7),scores(7)])).selectedIdeaIds,['idea-1']);
});
test('every input needs exactly one valid review; decimals, missing criteria and unknown IDs fail closed',()=>{
 for(const mutate of [r=>r.reviews.pop(),r=>r.reviews[4].ideaId='invented',r=>r.reviews[4].ideaId='idea-1',r=>r.reviews[0].scores.hook=8.5,r=>r.reviews[0].scores.hook=11,r=>delete r.reviews[0].scores.hook,r=>r.reviews[0].reason='',r=>delete r.reviews[0].showsActing]){
  const raw=reply(ideas.map(()=>scores(8)));mutate(raw);assert.throws(()=>evaluateIdeaAudit(ideas,raw));
 }
});
