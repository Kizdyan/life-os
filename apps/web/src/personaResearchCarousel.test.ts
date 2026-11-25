import {describe,it,expect} from 'vitest';
import {importResearchCarousel,parseResearchPacket,RESEARCH_CAROUSEL_EXAMPLE} from './personaResearchCarousel';
import {
 approveEditorialStep,editorialContentHash,editorialSourcesPass,editorialStage,
 reviseEditorialPost,setEditorialSourceReviewed,createBaselinePauseCarousel,
 createResearchedEditorialPost,addEditorialSource,removeEditorialSource,
 setEditorialInterpretationReviewed,setEditorialPublicCopyReviewed,
 saveEditorialPost,loadEditorialStore,EDITORIAL_KEY
} from './personaEditorialModel';

const fixture=()=>JSON.stringify(RESEARCH_CAROUSEL_EXAMPLE);
describe('Persona research-backed carousel importer',()=>{
 it('rejects absent or dangerous source links and never invents facts',()=>{
  const noSources=structuredClone(RESEARCH_CAROUSEL_EXAMPLE);
  noSources.slides[0].sources=[];
  expect(()=>parseResearchPacket(JSON.stringify(noSources))).toThrow(/источник/i);
  const protocol=structuredClone(RESEARCH_CAROUSEL_EXAMPLE);
  protocol.slides[0].sources=[{title:'Bad',url:'javascript:alert(1)'}];
  expect(()=>parseResearchPacket(JSON.stringify(protocol))).toThrow(/URL/);
  expect(()=>parseResearchPacket('{bad json')).toThrow(/JSON/);
 });
 it('accepts eight sourced slides without auto-approving any facts or visuals',()=>{
  const p=structuredClone(RESEARCH_CAROUSEL_EXAMPLE);
  p.slides.push(...[0,1,2].map(i=>({text:'Дополнительная проверяемая мысль '+(i+1),sources:[{title:'Тестовый источник',url:'https://example.org/source-'+i}]})));
  const eight=importResearchCarousel('research-eight-slides',JSON.stringify(p));
  expect(eight.slides).toHaveLength(8);
  expect(eight.research?.sourceItems).toHaveLength(7);
  expect(editorialSourcesPass(eight)).toBe(false);
  expect(eight.approvals.design).toBe(false);
  expect(eight.approvals.content).toBe(false);
  p.slides.push({text:'Недопустимый девятый',sources:[{title:'Тест',url:'https://example.org/nine'}]});
  expect(()=>parseResearchPacket(JSON.stringify(p))).toThrow(/5.?8/);
 });
 it('imports 5 unapproved slide texts and preserves per-slide source evidence',()=>{
  const post=importResearchCarousel('editorial-test-212',fixture(),'2026-11-20T15:00:00Z');
  expect(post.slides).toHaveLength(5);
  expect(post.slides[0].text).toContain('Обложка');
  expect(post.preset).toBe('chocolate-graphite');
  expect(post.research?.provider).toBe('manual');
  expect(post.research?.sourceItems).toHaveLength(4);
  expect(post.research?.interpretationSlides).toEqual(['slide-5']);
  expect(editorialStage(post)).toBe('topic');
  expect(editorialSourcesPass(post)).toBe(false);
  expect(()=>approveEditorialStep(approveEditorialStep(post,'topic'),'content')).toThrow(/SOURCE_PASS/);
 });
 it('requires real human review of each citation and revokes stale approvals on edits',()=>{
  let post=importResearchCarousel('editorial-check-212',fixture());
  for(const item of post.research!.sourceItems){
   post=setEditorialSourceReviewed(post,item.slideId,item.url,true);
  }
  expect(editorialSourcesPass(post)).toBe(false);
  post=setEditorialPublicCopyReviewed(post,true);
  expect(editorialSourcesPass(post)).toBe(true);
  post=approveEditorialStep(approveEditorialStep(post,'topic'),'content');
  expect(editorialStage(post)).toBe('design');
  const hash=editorialContentHash(post);
  const editedSlides=post.slides.map((s,i)=>i===0?{...s,text:s.text+'!'}:s);
  const edited=reviseEditorialPost(post,{slides:editedSlides});
  expect(edited.approvals.content).toBe(false);
  expect(edited.approvals.design).toBe(false);
  expect(edited.research!.sourceItems.filter(x=>x.slideId==='slide-1').every(x=>!x.reviewed)).toBe(true);
  expect(edited.research!.sourceItems.filter(x=>x.slideId==='slide-2').every(x=>x.reviewed)).toBe(true);
  expect(editorialSourcesPass(edited)).toBe(false);
  expect(editorialContentHash(edited)).not.toBe(hash);
 });

 it('closes the unverified alternative draft path without rewriting older saved projects',()=>{
  let draft=createResearchedEditorialPost('new-factual-213','Две ноты в кино',
   'Интересный факт из истории кинопроизводства',{caption:'Подпись',slides:[
    {title:'Факт про музыку',body:''},{title:'История режиссёра',body:''},
    {title:'Мнение о драматургии',body:''},{title:'Неожиданный эффект',body:''},
    {title:'Вывод о выразительности',body:''}
   ]});
  expect(draft.research?.sourceItems).toEqual([]);
  expect(editorialSourcesPass(draft)).toBe(false);
  draft=approveEditorialStep(draft,'topic');
  expect(()=>approveEditorialStep(draft,'content')).toThrow(/SOURCE_PASS/);
  draft=addEditorialSource(draft,'slide-1','Интервью','https://example.com/interview');
  expect(draft.research?.sourceItems[0].reviewed).toBe(false);
  draft=setEditorialSourceReviewed(draft,'slide-1','https://example.com/interview',true);
  for(const id of ['slide-2','slide-3','slide-4','slide-5'])
   draft=setEditorialInterpretationReviewed(draft,id,true);
  expect(editorialSourcesPass(draft)).toBe(false,'public caption is not checked yet');
  draft=setEditorialPublicCopyReviewed(draft,true);
  expect(editorialSourcesPass(draft)).toBe(true);
  draft=approveEditorialStep(draft,'content');
  expect(editorialStage(draft)).toBe('design');
  const edited=reviseEditorialPost(draft,{slides:draft.slides.map((s,i)=>
   i===1?{...s,text:'Совершенно новое утверждение'}:s)});
  expect(edited.research?.interpretationSlides).not.toContain('slide-2');
  expect(editorialSourcesPass(edited)).toBe(false);
  expect(edited.approvals.content).toBe(false);
  expect(edited.research?.sourceItems.find(x=>x.slideId==='slide-1')?.reviewed).toBe(true);
  const captionEdit=reviseEditorialPost(draft,{caption:'В подписи новое утверждение'});
  expect(captionEdit.research?.copyReviewed).toBe(false);
  expect(editorialSourcesPass(captionEdit)).toBe(false);
 });
 it('disallows source/interpretation mixing and dangerous URLs',()=>{
  const initial=createResearchedEditorialPost('source-check-213','Тема','Задача',{caption:'Подпись',slides:[
   {title:'Первый',body:''},{title:'Второй',body:''},{title:'Третий',body:''}
  ]});
  expect(()=>addEditorialSource(initial,'slide-1','Local','http://127.0.0.1/private')).toThrow(/URL/);
  expect(()=>addEditorialSource(initial,'slide-1','JS','javascript:alert(1)')).toThrow(/URL/);
  const cited=addEditorialSource(initial,'slide-1','Статья','https://example.org/film');
  expect(()=>setEditorialInterpretationReviewed(cited,'slide-1',true)).toThrow(/источники/);
  const removed=removeEditorialSource(cited,'slide-1','https://example.org/film');
  expect(removed.research?.sourceItems).toHaveLength(0);
  const personal=setEditorialInterpretationReviewed(removed,'slide-1',true);
  expect(personal.research?.interpretationSlides).toContain('slide-1');
  expect(()=>addEditorialSource(personal,'slide-1','Статья','https://example.org/new')).toThrow(/Сначала/);
 });


 it('preserves a tampered or old researched draft while revoking stale publication approval on reload',()=>{
  let draft=importResearchCarousel('review-persistence-213',fixture());
  for(const source of draft.research!.sourceItems)
   draft=setEditorialSourceReviewed(draft,source.slideId,source.url,true);
  draft=setEditorialPublicCopyReviewed(draft,true);
  draft=approveEditorialStep(approveEditorialStep(draft,'topic'),'content');
  const store=new Map<string,string>();
  const memory={
   getItem:(key:string)=>store.get(key)??null,
   setItem:(key:string,v:string)=>{store.set(key,v)}
  };
  saveEditorialPost(memory,draft);
  const modified=JSON.parse(store.get(EDITORIAL_KEY)!);
  modified.posts[0].research.copyReviewed=false;
  store.set(EDITORIAL_KEY,JSON.stringify(modified));
  const recovered=loadEditorialStore(memory);
  expect(recovered.posts).toHaveLength(1);
  expect(recovered.posts[0].id).toBe(draft.id);
  expect(recovered.posts[0].slides[0].text).toBe(draft.slides[0].text);
  expect(recovered.posts[0].approvals.topic).toBe(true);
  expect(recovered.posts[0].approvals.content).toBe(false);
  expect(editorialSourcesPass(recovered.posts[0])).toBe(false);
 });
 it('keeps existing legacy carousels and approval hashes unaffected',()=>{
  const old=createBaselinePauseCarousel();
  expect(old.research).toBeUndefined();
  expect(editorialSourcesPass(old)).toBe(true);
  const local=new Map<string,string>();
  const storage={
   getItem:(key:string)=>local.get(key)??null,
   setItem:(key:string,value:string)=>{local.set(key,value)}
  };
  saveEditorialPost(storage,old);
  expect(local.has(EDITORIAL_KEY)).toBe(true);
  expect(loadEditorialStore(storage).posts[0].research).toBeUndefined();
 });
});

describe('autonomous research provenance',()=>{
 it('preserves Perplexity receipt through existing editorial storage without advancing source gates',()=>{
  const receivedAt='2026-11-25T02:00:00.000Z';
  const receipt={mode:'discover' as const,model:'test-model',receivedAt};
  const post=importResearchCarousel('research-discovery-226',fixture(),receivedAt,receipt);
  expect(post.research?.provider).toBe('perplexity');
  expect(post.research?.discovery).toEqual(receipt);
  expect(editorialSourcesPass(post)).toBe(false);
  expect(post.approvals).toMatchObject({topic:false,content:false,design:false});
  const data=new Map<string,string>();
  const storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v)}};
  saveEditorialPost(storage,post);
  expect(loadEditorialStore(storage).posts.find(p=>p.id===post.id)?.research?.discovery).toEqual(receipt);
  expect(()=>importResearchCarousel('research-invalid-226',fixture(),receivedAt,{...receipt,model:''})).toThrow(/research evidence/);
 });
});
