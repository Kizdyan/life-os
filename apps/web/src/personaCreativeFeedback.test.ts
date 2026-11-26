import {describe,it,expect} from 'vitest';
import {createJawsBrandTrial} from './personaJawsBrandTrial';
import {prepareCreativeFeedback,appendCreativeFeedback,loadCreativeFeedback,applyCreativeModelPatch} from './personaCreativeFeedback';
describe('creative feedback',()=>{
 it('only replaces requested heading, keeps other slides and does not grant approval',()=>{
  const p=createJawsBrandTrial(),s=p.slides[1];
  const r=prepareCreativeFeedback(p,s.id,'Заголовок: Неожиданная реакция режиссёра');
  expect(r.record.status).toBe('revision-prepared');
  expect(r.revised?.slides[1].text).toBe('Неожиданная реакция режиссёра\n\n'+s.text.split('\n\n')[1]);
  expect(r.revised?.slides[0]).toEqual(p.slides[0]);
  expect(r.revised?.approvals.design).toBe(false);
  expect(r.revised?.approvals.content).toBe(false);
 });
 it('records unsupported artistic feedback without pretending to apply it',()=>{
  const p=createJawsBrandTrial(),r=prepareCreativeFeedback(p,p.slides[0].id,'Сделай шрифт элегантнее');
  expect(r.revised).toBeNull();expect(r.record.status).toBe('pending');
  const m=new Map<string,string>();
  const storage={getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v)}};
  appendCreativeFeedback(storage,r.record);appendCreativeFeedback(storage,r.record);
  expect(loadCreativeFeedback(storage)).toEqual([r.record]);
 });
});

describe('local model creative patches',()=>{
 it('only changes targeted slide and invalidates visual approval',()=>{
  const p=createJawsBrandTrial();
  const next=applyCreativeModelPatch(p,p.slides[1].id,{palette:'light',font:'literary',layout:'image-middle',image:'smaller'});
  expect(next?.slides[1].brandTrialStyle).toEqual({palette:'light',font:'literary',layout:'image-middle',image:'smaller'});
  expect(next?.slides[1].text).toBe(p.slides[1].text);
  expect(next?.slides[0]).toEqual(p.slides[0]);
  expect(next?.research).toEqual(p.research);
  expect(next?.approvals.design).toBe(false);
 });
 it('rejects arbitrary actions and invalid visual tokens',()=>{
  const p=createJawsBrandTrial();
  for(const patch of [{publish:true},{font:'unknown'},{text:'Persona'}])expect(()=>applyCreativeModelPatch(p,p.slides[0].id,patch)).toThrow();
 });
});
