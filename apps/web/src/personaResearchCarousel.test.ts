import {describe,it,expect} from 'vitest';
import {importResearchCarousel,parseResearchPacket,RESEARCH_CAROUSEL_EXAMPLE} from './personaResearchCarousel';
import {
 approveEditorialStep,editorialContentHash,editorialSourcesPass,editorialStage,
 reviseEditorialPost,setEditorialSourceReviewed,createBaselinePauseCarousel,
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
