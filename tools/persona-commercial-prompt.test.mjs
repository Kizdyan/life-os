import {test} from 'node:test';import assert from 'node:assert/strict';
import {commercialPrompt,commercialExamplesSha256,readCommercialIdeaDetails,loadArchetype,readProductionPackage,productionIdeaSchema} from './persona-commercial-prompt.mjs';
test('editable archetype and complete pre-shoot package enter the five-idea prompt',()=>{
 const archetype=loadArchetype();assert.match(archetype.description,/Сдержанный/);
 const prompt=commercialPrompt('showcase',5,{productionPackage:true,archetype:{version:1,description:'Тихий минимализм и три навыка'}});
 assert.match(prompt,/Тихий минимализм/);for(const key of ['productionPackage','visualStyle','musicalLeitmotif','editingRhythm','0–3','Проблема'])assert.ok(prompt.includes(key));
 assert.ok(prompt.indexOf('angle — сюжетный замысел, НЕ ракурс камеры')>prompt.indexOf('</author_examples>'));assert.equal(productionIdeaSchema().properties.ideas.items.properties.angle.maxLength,300);
 const pack={visualStyle:{lighting:'Мягкий боковой свет',colors:'Нейтральная кожа и синий фон'},musicalLeitmotif:{instruments:'Фортепиано и струнные',climax:'Tutti на раскрытии результата'},editingRhythm:{cuts:'Склейка на действие и удар',pauses:'Пауза перед ответом героя'}};
 assert.deepEqual(readProductionPackage(pack),pack);assert.throws(()=>readProductionPackage({...pack,editingRhythm:{cuts:'cut'}}));
 assert.throws(()=>commercialPrompt('showcase',5,{archetype:{description:''}}));
});
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
