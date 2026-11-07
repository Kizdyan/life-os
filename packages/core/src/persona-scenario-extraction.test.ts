import {describe,expect,it} from 'vitest';
import {buildPersonaProductionBrief} from './persona-production-brief';
import {comparePersonaScenarioRevisions} from './persona-scenario-version-history';

describe('extracted scenario core safety gates',()=>{
 it('never invents source facts for a reel',()=>{
  const brief=buildPersonaProductionBrief({idea:{id:'r1',title:'Как я работаю',angle:'Репетиция',format:'reel'}});
  expect(brief.factReferences).toEqual([]);
  expect(brief.sourceTitle).toBe('Как я работаю');
  expect(brief.script.length).toBeGreaterThan(0);
 });
 it('does not invent spoken audio for a carousel',()=>{
  const brief=buildPersonaProductionBrief({idea:{id:'c1',title:'Три наблюдения',angle:'Практика',format:'carousel'}});
  expect(brief.script).toEqual([]);
  expect(brief.shots).toEqual([]);
 });
 it('detects exact changed fields without mutating saved revisions',()=>{
  const before={beats:[{purpose:'hook',line:'Один',action:'В кадре',durationSec:2}]};
  const after={beats:[{purpose:'hook',line:'Два',action:'В кадре',durationSec:2}]};
  const result=comparePersonaScenarioRevisions(before as never,after as never);
  expect(result).toHaveLength(1);
  expect(result[0].changedFields).toEqual(['line']);
  expect(before.beats[0].line).toBe('Один');
 });
 it('rejects incomplete revision evidence',()=>{
  expect(()=>comparePersonaScenarioRevisions({} as never,{} as never)).toThrow();
 });
});
