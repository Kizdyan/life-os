import {describe,it,expect} from 'vitest';
import {validateVisualReceipt,summarizeVisualPackage} from './personaCarouselVisualReview';
const hash='a'.repeat(64);
const receipt={version:1,provider:'ollama-local',model:'vision',scope:'single-rendered-slide',sha256:hash,index:1,status:'AUTHOR_REVIEW_REQUIRED',approved:false,published:false,scores:{readability:4,hierarchy:4,composition:4,brandCoherence:4,imageRelevance:4},issues:[],summary:'Проверка автора обязательна'};
describe('visual opinion receipts',()=>{
 it('binds opinion to exact slide and never accepts model approval',()=>{
  expect(validateVisualReceipt(receipt,1,hash)).toEqual(receipt);
  expect(()=>validateVisualReceipt(receipt,2,hash)).toThrow();
  expect(()=>validateVisualReceipt(receipt,1,'b'.repeat(64))).toThrow();
  expect(()=>validateVisualReceipt({...receipt,approved:true},1,hash)).toThrow();
 });
 it('requires revision advice when a score is low or an issue is major',()=>{
  const low={...receipt,scores:{...receipt.scores,composition:2}};
  expect(()=>validateVisualReceipt(low,1,hash)).toThrow();
  expect(validateVisualReceipt({...low,status:'REVISION_SUGGESTED'},1,hash).status).toBe('REVISION_SUGGESTED');
 });
});

it('a partial package is blocked and a negative full package requires revision',()=>{
 const first=validateVisualReceipt(receipt,1,hash);
 const all=[first,{...first,index:2},{...first,index:3}];
 expect(summarizeVisualPackage([first],3,null).status).toBe('BLOCKED');
 expect(summarizeVisualPackage([first],3,'Worker unavailable').blocked).toBe('Worker unavailable');
 expect(summarizeVisualPackage(all,3,null).status).toBe('AUTHOR_REVIEW_REQUIRED');
 expect(summarizeVisualPackage([first,{...first,index:2,status:'REVISION_SUGGESTED'},all[2]],3,null).status).toBe('REVISION_SUGGESTED');
 expect(()=>summarizeVisualPackage([first,first],3,null)).toThrow();
 expect(summarizeVisualPackage(all,3,null).approved).toBe(false);
});
