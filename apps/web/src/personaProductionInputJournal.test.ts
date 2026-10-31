import {describe,it,expect} from 'vitest';
import {buildPersonaProductionBrief} from '../../../packages/core/src/persona-production-brief';
import {applyProductionInputField,productionBriefSnapshot,readProductionInputRaw,parseProductionInputDraft,saveProductionInputDraft,clearProductionInputDraft,productionInputDraftExists,productionInputKey} from './personaProductionInputJournal';
const b=buildPersonaProductionBrief({idea:{id:'idea',title:'Actor',angle:'Composer',format:'reel'}});
const mem=()=>{const m=new Map<string,string>();return {getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v)},removeItem:(k:string)=>{m.delete(k)}}};
const draft={version:1 as const,projectId:'p',ideaId:'idea',base:productionBriefSnapshot(b),field:'script:0:line',value:'Новый текст'};
describe('Production Brief crash journal',()=>{
 it('restores last keystroke while keeping the original brief unchanged',()=>{
  const s=mem();let raw=saveProductionInputDraft(s,draft,null);
  raw=saveProductionInputDraft(s,{...draft,value:'Новый текст!'},raw);
  expect(parseProductionInputDraft(readProductionInputRaw(s,'p'),'p')?.value).toBe('Новый текст!');
  expect(b.script[0].line).not.toBe('Новый текст!');
  clearProductionInputDraft(s,'p',raw);
  expect(productionInputDraftExists(s,'p')).toBe(false);
 });
 it('does not silently replace a draft from a different field or revision',()=>{
  const s=mem(),raw=saveProductionInputDraft(s,draft,null);
  expect(()=>saveProductionInputDraft(s,{...draft,field:'shot:0:lighting'},raw)).toThrow('unresolved');
  expect(()=>saveProductionInputDraft(s,{...draft,base:'new revision'},raw)).toThrow('unresolved');
 });
 it('rejects concurrent changes and deletion of newer draft',()=>{
  const s=mem(),raw=saveProductionInputDraft(s,draft,null);
  const newer=saveProductionInputDraft(s,{...draft,value:'latest'},raw);
  expect(()=>saveProductionInputDraft(s,{...draft,value:'stale'},raw)).toThrow('another_tab');
  expect(()=>clearProductionInputDraft(s,'p',raw)).toThrow('before_clear');
  expect(readProductionInputRaw(s,'p')).toBe(newer);
 });
 it('preserves malformed bytes and surfaces quota errors',()=>{
  const s=mem();s.setItem(productionInputKey('p'),'{invalid');
  expect(parseProductionInputDraft(readProductionInputRaw(s,'p'),'p')).toBeNull();
  expect(()=>saveProductionInputDraft(s,draft,'{invalid')).toThrow('corrupt');
  expect(readProductionInputRaw(s,'p')).toBe('{invalid');
  const fail={...mem(),setItem:()=>{throw Error('quota')}};
  expect(()=>saveProductionInputDraft(fail,draft,null)).toThrow('quota');
 });
 it('validates text and synchronized duration changes',()=>{
  const changed=applyProductionInputField(b,'script:0:line','Rewritten');
  expect(changed.script[0].line).toBe('Rewritten');
  expect(b.script[0].line).not.toBe('Rewritten');
  expect(applyProductionInputField(b,'shot:0:lighting','Soft key').shots[0].lighting).toBe('Soft key');
  expect(()=>applyProductionInputField(b,'script:0:line','')).toThrow('пустое');
  expect(()=>applyProductionInputField(b,'shot:0:durationSec','2')).toThrow('invalid_shot_field');
  const timed=applyProductionInputField(b,'script:0:durationSec','8');
  expect(timed.script[0].durationSec).toBe(8);
  expect(timed.shots[0].durationSec).toBe(8);
  const sum=timed.shots.reduce((s,x)=>s+x.durationSec,0);
  expect(timed.adaptations.reels.durationSec).toBe(sum);
  expect(timed.adaptations.shorts.durationSec).toBe(sum);
  expect(timed.adaptations.vkClips.durationSec).toBe(sum);
 });
});
