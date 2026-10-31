import { describe, expect, it } from 'vitest';
import { ideaForImportedBrief, selectedPersonaProjectSnapshot } from './PersonaFactory';
import { createPersonaProject, type PersonaProjectCollection } from './personaProjectStore';

const quick={id:'local-project',title:'Новый Reels',angle:'Создать материал из собственных исходников',format:'reel' as const,score:0,source:'quick-start'};
const candidate={sourceTitle:'Один день между театром и музыкой',sourceAngle:'Две профессии одной историей',sourceFormat:'reel'};

describe('brief import identity',()=>{
 it('lets an empty quick-start project adopt a validated candidate identity without changing its project ID',()=>{
  expect(ideaForImportedBrief(quick,candidate,true)).toMatchObject({id:'local-project',title:candidate.sourceTitle,angle:candidate.sourceAngle,format:'reel',source:'imported-brief'});
 });
 it('does not relabel a project that already contains work or malformed imported data',()=>{
  expect(ideaForImportedBrief(quick,candidate,false)).toBe(quick);
  expect(ideaForImportedBrief(quick,{sourceTitle:'Другой'},true)).toBe(quick);
 });
});

describe('persisted Persona project selection',()=>{
 it('uses the current stored revision even when a project card holds an older object',()=>{
  const stale=createPersonaProject({id:'p1',title:'Актёр и композитор',contentType:'reel',sourceIdea:'Музыка и театр',now:'2026-10-31T10:00:00.000Z'});
  const current={...stale,revision:stale.revision+2,title:'Новая версия',
   scenarioWorkspace:{version:1 as const,research:[],analyses:[],ideas:[],selectedIdeaId:'latest'}};
  const persisted:PersonaProjectCollection={schemaVersion:1,activeProjectId:'p1',projects:[current]};
  expect(stale.revision).toBeLessThan(current.revision);
  expect(selectedPersonaProjectSnapshot(persisted,stale.id)).toBe(current);
  expect(selectedPersonaProjectSnapshot(persisted,stale.id).scenarioWorkspace?.selectedIdeaId).toBe('latest');
 });
 it('rejects an id missing from the actual store instead of opening a stale card',()=>{
  const collection:PersonaProjectCollection={schemaVersion:1,activeProjectId:null,projects:[]};
  expect(()=>selectedPersonaProjectSnapshot(collection,'deleted-project')).toThrow('unknown_persona_project');
 });
});
