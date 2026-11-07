import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildBrief,renderBrief} from './persona-production-brief.mjs';
const idea={id:'A01',title:'Я актёр. И ещё пишу музыку.',hook:'Что общего у роли и мелодии?',angle:'Контраст двух творческих процессов',format:'reel'};
test('turns an approved idea into a practical one-page filming brief',()=>{
 const b=buildBrief({idea,authorApproved:true,goal:'Запросы на актёрские роли',durationSec:35});
 assert.equal(b.status,'READY_FOR_SHOOT_REVIEW');
 assert.equal(b.shots.length,4);
 assert.equal(b.authorApproval.publicationApproved,false);
 assert.match(renderBrief(b),/Съёмочный лист/);
 assert.match(renderBrief(b),/Звук/);
});
test('without idea approval produces a non-shootable draft',()=>{
 const b=buildBrief({idea,authorApproved:false});
 assert.equal(b.status,'AWAITING_AUTHOR_IDEA_SELECTION');
 assert.equal(b.authorApproval.publicationApproved,false);
});
test('rejects missing or unsafe inputs',()=>{
 assert.throws(()=>buildBrief({idea:{...idea,hook:''},authorApproved:true}),/hook/);
 assert.throws(()=>buildBrief({idea,authorApproved:true,durationSec:1000}),/duration/);
});
