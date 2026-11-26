import {describe,it,expect} from 'vitest';
import {applyCreamEditorial,createResearchedEditorialPost,editorialDesignHash,type EditorialPost} from './personaEditorialModel';
import {applyCreativeStyle,loadCreativeStyle,rememberCreativeStyle,mergeCreativeStyle,CREATIVE_STYLE_KEY} from './personaCreativeMemory';
const make=(id:string)=>createResearchedEditorialPost(id,'Кино и музыка','Новая история',{caption:'Текст',slides:[{title:'Первый',body:''},{title:'Второй',body:''},{title:'Третий',body:''},{title:'Четвёртый',body:''},{title:'Пятый',body:''}]});
describe('approved creative style',()=>{
 it('rejects drafts, applies only author-selected settings to a new draft without approvals',()=>{
  const m=new Map<string,string>(),storage={getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v)}};
  const p:EditorialPost={...make('source-style'),preset:'chocolate-graphite',fontPreset:'literata-golos'};
  expect(()=>rememberCreativeStyle(storage,p)).toThrow();
  const signed:EditorialPost={...p,approvals:{...p.approvals,topic:true,content:true,design:true,designApproved:true,contentHashAtDesignApproval:editorialDesignHash(p)}};
  const saved=rememberCreativeStyle(storage,signed,'2026-11-26T12:00:00Z');
  expect(loadCreativeStyle(storage)).toEqual(saved);
  const draft=make('new-style'),next=applyCreativeStyle(draft,saved);
  expect(next.preset).toBe('chocolate-graphite');expect(next.fontPreset).toBe('literata-golos');
  expect(next.slides).toEqual(draft.slides);expect(next.approvals.design).toBe(false);
  expect(applyCreativeStyle(signed,saved)).toBe(signed);
  expect(mergeCreativeStyle(saved,saved)).toEqual(saved);
  expect(()=>mergeCreativeStyle(saved,{...saved,preset:'cream'})).toThrow();
  m.set(CREATIVE_STYLE_KEY,'{}');expect(()=>loadCreativeStyle(storage)).toThrow();
 });
});

it('preserves exact copy and remembers the complete cream composition, not merely palette',()=>{
 const m=new Map<string,string>(),storage={getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v)}};
 const p=make('cream-source'),styled=applyCreamEditorial(p);
 expect(styled.slides).toEqual(p.slides);expect(styled.research).toEqual(p.research);expect(styled.caption).toEqual(p.caption);
 expect(styled.compositionPreset).toBe('cream-editorial-v1');
 expect(editorialDesignHash(styled)).not.toBe(editorialDesignHash(p));
 expect(()=>rememberCreativeStyle(storage,styled)).toThrow();
 const signed={...styled,approvals:{...styled.approvals,topic:true,content:true,design:true,designApproved:true,contentHashAtDesignApproval:editorialDesignHash(styled)}};
 const memory=rememberCreativeStyle(storage,signed);
 expect(memory.compositionPreset).toBe('cream-editorial-v1');
 const next=applyCreativeStyle(make('cream-next'),loadCreativeStyle(storage));
 expect(next.compositionPreset).toBe('cream-editorial-v1');expect(next.approvals.design).toBe(false);
 expect(applyCreativeStyle(signed,memory)).toBe(signed);
});
