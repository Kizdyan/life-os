import {describe,it,expect} from 'vitest';
import {
 readPersonaScenarioDraft,matchingPersonaScenarioDraft,savePersonaScenarioDraft,clearPersonaScenarioDraft,personaDraftKey,personaScenarioDraftExists,resolvePersonaScenarioDraftStorage,
 type PersonaScenarioDraftJournal,
} from './personaScenarioDraftJournal';
const storage=()=>{
 const data=new Map<string,string>();
 return {data,getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v)},removeItem:(k:string)=>{data.delete(k)}};
};
const original:PersonaScenarioDraftJournal={
 version:1,projectId:'project-a',ideaId:'idea-a',sourceRevisionId:'idea-a-script-r2',
 beats:[
  {purpose:'hook',line:'A01',action:'Действие 1',durationSec:3},
  {purpose:'development',line:'B01',action:'Действие 2',durationSec:4},
  {purpose:'ending',line:'A04',action:'Действие 3',durationSec:4},
 ],
 reason:'Несохранённая авторская правка',savedAt:'2026-10-31T19:55:00.000Z',
};
describe('unsaved Persona scenario journal',()=>{
 it('does not crash on SSR when browser localStorage is absent',()=>{
  const browser=(globalThis as {window?:unknown}).window;
  if(browser!==undefined)return; // SSR-specific contract is tested in Node.
  const selected=resolvePersonaScenarioDraftStorage();
  expect(selected.getItem(personaDraftKey('absent'))).toBeNull();
  expect(()=>selected.setItem('key','value')).toThrow('persona_draft_storage_unavailable');
 });

 it('opens a new project with no script or saved journal without a crash',()=>{
  const s=storage();
  expect(matchingPersonaScenarioDraft(s,'new-project',undefined)).toBeNull();
  expect(matchingPersonaScenarioDraft(s,'new-project',{idea:{id:'i'},currentRevisionId:'r1'})).toBeNull();
 });
 it('never restores a draft for another idea even when revision identifiers collide',()=>{
  const s=storage();savePersonaScenarioDraft(s,original);
  expect(matchingPersonaScenarioDraft(s,'project-a',{idea:{id:'other-idea'},currentRevisionId:original.sourceRevisionId})).toBeNull();
  expect(matchingPersonaScenarioDraft(s,'project-a',{idea:{id:original.ideaId},currentRevisionId:'r3'})).toBeNull();
  expect(matchingPersonaScenarioDraft(s,'project-a',{idea:{id:original.ideaId},currentRevisionId:original.sourceRevisionId})).toEqual(original);
 });

 it('recovers exact unsaved text after remount without approving or changing script',()=>{
  const s=storage();savePersonaScenarioDraft(s,original);
  expect(readPersonaScenarioDraft(s,'project-a')).toEqual(original);
  expect(readPersonaScenarioDraft(s,'project-b')).toBeNull();
  expect(JSON.parse(s.getItem(personaDraftKey('project-a'))!).approved).toBeUndefined();
 });
 it('retains older revision draft for explicit recovery after an external import',()=>{
  const s=storage();savePersonaScenarioDraft(s,original);
  const newCurrentRevisionId='idea-a-script-r3';
  const journal=readPersonaScenarioDraft(s,'project-a')!;
  expect(journal.sourceRevisionId).not.toBe(newCurrentRevisionId);
  expect(journal.beats[0].line).toBe('A01');
 });
 it('explicit discard clears only that project and never changes saved script',()=>{
  const s=storage();savePersonaScenarioDraft(s,original);
  savePersonaScenarioDraft(s,{...original,projectId:'project-b'});
  clearPersonaScenarioDraft(s,'project-a');
  expect(readPersonaScenarioDraft(s,'project-a')).toBeNull();
  expect(readPersonaScenarioDraft(s,'project-b')).not.toBeNull();
 });
 it('corrupt or structurally invalid storage is kept for manual recovery, not loaded',()=>{
  const s=storage();s.setItem(personaDraftKey('project-a'),'{bad json');
  expect(readPersonaScenarioDraft(s,'project-a')).toBeNull();
  expect(s.getItem(personaDraftKey('project-a'))).toBe('{bad json');
  expect(personaScenarioDraftExists(s,'project-a')).toBe(true);
  expect(()=>savePersonaScenarioDraft(s,original)).toThrow('corrupt_persona_scenario_draft_preserved');
  expect(s.getItem(personaDraftKey('project-a'))).toBe('{bad json');
  s.setItem(personaDraftKey('project-a'),JSON.stringify({...original,beats:[{purpose:'hook'}]}));
  expect(readPersonaScenarioDraft(s,'project-a')).toBeNull();
  expect(personaScenarioDraftExists(s,'project-a')).toBe(true);
 });
 it('preserves an in-progress empty duration while the author types a valid number',()=>{
  const s=storage();
  const editing={...original,beats:original.beats.map((b,i)=>i===1?{...b,durationSec:0}:b)};
  savePersonaScenarioDraft(s,editing);
  expect(readPersonaScenarioDraft(s,'project-a')?.beats[1].durationSec).toBe(0);
  expect(()=>savePersonaScenarioDraft(s,{...editing,beats:[...editing.beats.slice(0,1),{...editing.beats[1],durationSec:-1},...editing.beats.slice(2)]})).toThrow('invalid_persona_scenario_draft');
 });
 it('rejects malformed writes and does not overwrite previously valid journal',()=>{
  const s=storage();savePersonaScenarioDraft(s,original);
  expect(()=>savePersonaScenarioDraft(s,{...original,beats:[]})).toThrow('invalid_persona_scenario_draft');
  expect(readPersonaScenarioDraft(s,'project-a')).toEqual(original);
 });
});
