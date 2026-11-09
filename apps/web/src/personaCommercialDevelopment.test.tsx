import React from 'react';import {renderToString} from 'react-dom/server';import {expect,it} from 'vitest';
import {PersonaCommercialIdeas} from './PersonaCommercialIdeas';import {readCommercialDevelopment,commercialCreativeSnapshot} from './personaCommercialDevelopment';
it('shows three real selectable formats and never pretends a model already generated an idea',()=>{
 const html=renderToString(<PersonaCommercialIdeas projectId="test" record={null} creativeSnapshot="base" onSave={()=>true} onApplyBrief={()=>{}}/>);
 for(const label of ['Commercial Showcase','Acting Range','Self-Irony / Comedy','Создать идею с Qwen'])expect(html).toContain(label);
 expect(html).not.toContain('Выбрать и создать сценарий');
});
it('preserves format and proposals after JSON reload and rejects foreign selected IDs',()=>{
 const saved={version:1,format:'comedy',proposals:[]};expect(readCommercialDevelopment(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
 expect(readCommercialDevelopment({...saved,selected:{proposalId:'other',ideaId:'idea-1'}})).toBeNull();
 const p={title:'Идея',sourceIdea:'Смысл',shootingPlan:null};expect(commercialCreativeSnapshot(p)).not.toEqual(commercialCreativeSnapshot({...p,sourceIdea:'Изменён'}));
});
