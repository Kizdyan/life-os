import {test} from 'node:test';import assert from 'node:assert/strict';
import {commercialPrompt,commercialExamplesSha256,readCommercialIdeaDetails} from './persona-commercial-prompt.mjs';
test('all author examples, music and acting goals enter each few-shot format without a success claim',()=>{
 for(const format of ['showcase','acting','comedy']){const prompt=commercialPrompt(format);for(const phrase of ['Это просто ручка','Три разных фильма','бюджет только на одного','Играть три разные цели','валторн','Хлопок режиссёра'])assert.ok(prompt.includes(phrase));}
 assert.match(commercialExamplesSha256,/^[a-f0-9]{64}$/);assert.throws(()=>commercialPrompt('invented'));
});
test('three distinct skills and musical/acting/selling intent are required',()=>{
 const idea={skills:['actor','director','composer'].map(role=>({role,action:'Конкретное действие'})),music:'Три ноты и струнные',actingTask:'Скрыть сомнение от клиента',sellingEnding:'Сыграю, сниму и напишу музыку для вашей истории.'};
 assert.deepEqual(readCommercialIdeaDetails(idea).skills,idea.skills);
 assert.throws(()=>readCommercialIdeaDetails({...idea,skills:[idea.skills[0],idea.skills[0],idea.skills[2]]}));
 assert.throws(()=>readCommercialIdeaDetails({...idea,music:''}));
});
