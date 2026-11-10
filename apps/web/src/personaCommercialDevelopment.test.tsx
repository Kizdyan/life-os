import React from 'react';import {renderToString} from 'react-dom/server';import {expect,it} from 'vitest';
import {PersonaCommercialIdeas} from './PersonaCommercialIdeas';import {readCommercialDevelopment,commercialCreativeSnapshot} from './personaCommercialDevelopment';
import {evaluateIdeaAudit} from '../../../packages/core/src/persona-idea-audit.mjs';
function auditedRecord(values=[7,9,7,10,8],version:1|2=1){
 const drafts=Array.from({length:5},(_,i)=>({id:'idea-'+(i+1),title:'Концепция '+(i+1),angle:'Полное описание черновика '+(i+1),hook:'Конкретный хук',music:'Переход от пиано к струнным',actingTask:'Скрыть ошибку от клиента',sellingEnding:'Сыграю, сниму и напишу музыку',skills:['actor','director','composer'].map(role=>({role,action:'Конкретное действие'}))}));
 const audit={...evaluateIdeaAudit(drafts,{reviews:drafts.map((idea,i)=>({ideaId:idea.id,scores:{visuality:values[i],actingRange:values[i],sellingPotential:values[i],...(version===1?{hook:values[i]}:{})},banal:false,showsActing:true,reason:'Конкретный довод критика о съёмке и актёрском действии.'}))},{version}),provider:{model:'qwen',id:'ollama-local'},sourceIdeasSha256:'a'.repeat(64)};
 return {version:1 as const,format:'comedy' as const,proposals:[{id:'11111111-1111-4111-8111-111111111111',contentFormat:'comedy' as const,ideas:audit.selectedIdeaIds.map(id=>drafts.find(i=>i.id===id)!),provider:{model:'qwen',id:'ollama-local'},examplesSha256:'a'.repeat(64),publicationApproved:false as const,audit}]};
}
it('Showcase v2 shows the complete production package with three scores and rejects damaged packages on reload',()=>{
 const record=auditedRecord([7,9,7,10,8],2);
 const pack={visualStyle:{lighting:'Боковой мягкий свет',colors:'Нейтральная кожа'},musicalLeitmotif:{instruments:'Фортепиано и струнные',climax:'На решении героя'},editingRhythm:{cuts:'По жестам и действию',pauses:'Перед неожиданным ответом'}};
 record.proposals[0].ideas.forEach(i=>Object.assign(i,{productionPackage:pack}));
 expect(readCommercialDevelopment(record)).toEqual(record);
 const html=renderToString(<PersonaCommercialIdeas projectId="test" record={record} creativeSnapshot="base" onSave={()=>true} onApplyBrief={()=>{}}/>);
 for(const text of ['Полный продакшн-пакет','Боковой мягкий свет','Фортепиано и струнные','Перед неожиданным ответом'])expect(html).toContain(text);
 expect(html).not.toContain('Хук: 10/10');
 const bad=JSON.parse(JSON.stringify(record));delete bad.proposals[0].ideas[0].productionPackage.editingRhythm.pauses;expect(readCommercialDevelopment(bad)).toBeNull();
});
it('renders only the audited top2, explains rejects, and restores the same result after JSON reload',()=>{
 const record=auditedRecord();expect(readCommercialDevelopment(JSON.parse(JSON.stringify(record)))).toEqual(record);
 const html=renderToString(<PersonaCommercialIdeas projectId="test" record={record} creativeSnapshot="base" onSave={()=>true} onApplyBrief={()=>{}}/>);
 expect((html.match(/Выбрать и создать сценарий/g)||[]).length).toBe(2);
 expect(html).toContain('Полное описание черновика 4');expect(html).toContain('Полное описание черновика 2');expect(html).not.toContain('Полное описание черновика 1');
 expect(html).toContain('Почему остальные отсеяны');expect(html).toContain('Конкретный довод критика');
 const bad=JSON.parse(JSON.stringify(record));bad.proposals[0].audit.reviews[0].average=10;expect(readCommercialDevelopment(bad)).toBeNull();
});
it('shows an honest empty result when all five fail; legacy proposals remain saved but cannot bypass the audit UI',()=>{
 const record=auditedRecord([7,7,7,7,7]);expect(readCommercialDevelopment(record)).toEqual(record);
 const html=renderToString(<PersonaCommercialIdeas projectId="test" record={record} creativeSnapshot="base" onSave={()=>true} onApplyBrief={()=>{}}/>);
 expect(html).toContain('Все 5 идей отсеяны');expect(html).not.toContain('Выбрать и создать сценарий');
});
it('shows three real selectable formats and never pretends a model already generated an idea',()=>{
 const html=renderToString(<PersonaCommercialIdeas projectId="test" record={null} creativeSnapshot="base" onSave={()=>true} onApplyBrief={()=>{}}/>);
 for(const label of ['Commercial Showcase','Acting Range','Self-Irony / Comedy','Создать качественную идею'])expect(html).toContain(label);
 expect(html).not.toContain('Выбрать и создать сценарий');
});
it('preserves format and proposals after JSON reload and rejects foreign selected IDs',()=>{
 const saved={version:1,format:'comedy',proposals:[]};expect(readCommercialDevelopment(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
 expect(readCommercialDevelopment({...saved,selected:{proposalId:'other',ideaId:'idea-1'}})).toBeNull();
 const p={title:'Идея',sourceIdea:'Смысл',shootingPlan:null};expect(commercialCreativeSnapshot(p)).not.toEqual(commercialCreativeSnapshot({...p,sourceIdea:'Изменён'}));
});
it('rejects damaged rendering fields rather than crashing the whole project on reload',()=>{
 const idea={id:'idea-1',title:'Одна сцена',angle:'Конкретный замысел',hook:'Неожиданный хук',music:'Собственная музыка',actingTask:'Убедить героя',sellingEnding:'Три навыка для вашего фильма',skills:['actor','director','composer'].map(role=>({role,action:'Конкретное действие'}))};
 const record={version:1,format:'comedy',proposals:[{id:'11111111-1111-4111-8111-111111111111',contentFormat:'comedy',ideas:[idea],provider:{model:'qwen',id:'ollama-local'},examplesSha256:'a'.repeat(64),publicationApproved:false}]};
 expect(readCommercialDevelopment(record)).toEqual(record);
 const damaged=JSON.parse(JSON.stringify(record));damaged.proposals[0].ideas[0].music={invalid:true};expect(readCommercialDevelopment(damaged)).toBeNull();
});
