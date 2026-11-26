import {describe,it,expect} from 'vitest';
import {createJawsBrandTrial} from './personaJawsBrandTrial';
import {improveCarouselDraft,betterVisualOpinion,proposeStyleCandidate} from './personaCarouselSelfImprove';
import type {VisualOpinion} from './personaCarouselVisualReview';
const opinion=(index:number,score:number,hash:string):VisualOpinion=>({version:1,provider:'ollama-local',model:'vision',scope:'single-rendered-slide',sha256:hash.repeat(64),index,status:score<=2?'REVISION_SUGGESTED':'AUTHOR_REVIEW_REQUIRED',approved:false,published:false,scores:{readability:score,hierarchy:4,composition:4,brandCoherence:4,imageRelevance:4},issues:[],summary:'Проверка'});
describe('bounded visual self-improvement',()=>{
 it('accepts only distinct images from the same critic with no score regression',()=>{
  const before=opinion(1,2,'a'),after=opinion(1,3,'b');
  expect(betterVisualOpinion(before,after)).toBe(true);
  expect(betterVisualOpinion(before,{...after,model:'other'})).toBe(false);
  expect(betterVisualOpinion(before,{...after,sha256:before.sha256})).toBe(false);
  expect(betterVisualOpinion(before,{...after,scores:{...after.scores,composition:3}})).toBe(false);
  expect(betterVisualOpinion(before,opinion(1,2,'c'))).toBe(false);
 });
 it('preserves the source and copy, bounds calls, and keeps only improved candidates',async()=>{
  const source=createJawsBrandTrial(),snapshot=JSON.stringify(source);
  let calls=0;
  const r=await improveCarouselDraft(source,{signal:new AbortController().signal,maxAttempts:2,review:async(post,i)=>{
   calls++;return post.slides[i].brandTrialStyle?opinion(i+1,i===0?3:1,'b'):opinion(i+1,2,'a');
  }});
  expect(calls).toBe(source.slides.length+2);
  expect(r.attempts.map(a=>a.accepted)).toEqual([true,false]);
  expect(r.remaining).toContain(2);
  expect(JSON.stringify(source)).toBe(snapshot);
  expect(r.candidate?.slides.map(s=>s.text)).toEqual(source.slides.map(s=>s.text));
  expect(r.candidate?.caption).toBe(source.caption);
  expect(r.candidate?.research?.sourceItems).toEqual(source.research?.sourceItems);
  expect(r.candidate?.slides[1]).toEqual(source.slides[1]);
  expect(r.approved).toBe(false);
 });
 it('does not invent new imagery for relevance-only problems',()=>{
  const source=createJawsBrandTrial(),r=opinion(1,4,'a');
  expect(proposeStyleCandidate(source,0,{...r,status:'REVISION_SUGGESTED',scores:{...r.scores,imageRelevance:2}})).toBeNull();
 });
 it('stops on cancellation without saving a partial candidate',async()=>{
  const controller=new AbortController(),source=createJawsBrandTrial();
  await expect(improveCarouselDraft(source,{signal:controller.signal,review:async(_,i)=>{controller.abort();return opinion(i+1,2,'a')}})).rejects.toThrow();
 });
});
