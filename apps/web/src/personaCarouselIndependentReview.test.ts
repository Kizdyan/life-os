import {describe,it,expect} from 'vitest';
import {importResearchCarousel,RESEARCH_CAROUSEL_EXAMPLE} from './personaResearchCarousel';
import {carouselReviewInput,currentCarouselReview,validStoredCarouselReview,type StoredCarouselReview} from './personaCarouselIndependentReview';
import {attachEditorialIndependentReview,editorialSourcesPass,reviseEditorialPost,setEditorialPublicCopyReviewed,setEditorialSourceReviewed,loadEditorialStore,saveEditorialPost} from './personaEditorialModel';
const now='2026-11-25T02:00:00.000Z';
function draft(){return importResearchCarousel('review-draft-226',JSON.stringify(RESEARCH_CAROUSEL_EXAMPLE),now,{mode:'discover',model:'research/model',receivedAt:now})}
function audit(post= draft(),negative=true):StoredCarouselReview{
 const input=carouselReviewInput(post);
 return {input,report:{status:negative?'NEEDS_REVISION':'REVIEW_CANDIDATE',provider:'perplexity',model:'review/model',fingerprint:'a'.repeat(64),reviewedAt:now,approved:false,published:false,
 checks:['title','caption',...input.slides.map((_,i)=>'slide-'+(i+1))].map((target,i)=>({target,verdict:i===0&&negative?'INSUFFICIENT':i===6?'INTERPRETATION':'SUPPORTED',reason:'fixture',evidence:i===0&&negative||i===6?[]:[{url:(i>=2?input.slides[i-2].urls[0]:input.slides[0].urls[0]),quote:'Fixture text from an extracted page.'}]})),
 editorial:{hook:'fixture',narrative:'fixture',positioning:'fixture',revision:'fixture'}}};
}
describe('independent review persistence and approval gate',()=>{
 it('blocks a known negative report even after all human checkboxes are marked',()=>{
  let post=draft();post=attachEditorialIndependentReview(post,audit(post));
  for(const x of post.research!.sourceItems)post=setEditorialSourceReviewed(post,x.slideId,x.url,true);
  post=setEditorialPublicCopyReviewed(post,true);
  expect(currentCarouselReview(post)?.status).toBe('NEEDS_REVISION');
  expect(editorialSourcesPass(post)).toBe(false);
  const changed=reviseEditorialPost(post,{caption:'Изменённый текст'});
  expect(currentCarouselReview(changed)).toBeUndefined();
  expect(editorialSourcesPass(changed)).toBe(false);
 });
 it('rejects a citation from a different slide even when the URL is present elsewhere in the research',()=>{
  const review=audit(draft(),false);
  const check=review.report.checks.find(c=>c.target==='slide-4')!;
  check.evidence[0].url=review.input.slides[0].urls[0];
  expect(validStoredCarouselReview(review)).toBe(false);
 });
 it('persists a candidate without granting author approval',()=>{
  const p=draft(),review=audit(p,false);
  expect(validStoredCarouselReview(review)).toBe(true);
  const post=attachEditorialIndependentReview(p,review);
  expect(editorialSourcesPass(post)).toBe(false);
  expect(post.approvals).toMatchObject({topic:false,content:false,design:false});
  const values=new Map<string,string>(),storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v)}};
  saveEditorialPost(storage,post);
  expect(currentCarouselReview(loadEditorialStore(storage).posts[0])).toEqual(review.report);
  expect(()=>attachEditorialIndependentReview(reviseEditorialPost(p,{caption:'Другой текст'}),review)).toThrow();
 });
});
