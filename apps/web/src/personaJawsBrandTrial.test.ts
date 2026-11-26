import {describe,it,expect} from 'vitest';
import {createJawsBrandTrial,isLocalBrandTrialSlide,brandTrialArt,JAWS_BRAND_TRIAL_ID} from './personaJawsBrandTrial';
import {approveEditorialStep,editorialSourcesPass,reviseEditorialPost,validatePost} from './personaEditorialModel';

describe('Old Money local trial',()=>{
 it('opens the seven-slide prepared topic without granting source or publication approval',()=>{
  const p=createJawsBrandTrial('2026-11-26T00:00:00.000Z');
  validatePost(p);
  expect(p.id).toBe(JAWS_BRAND_TRIAL_ID);
  expect(p.slides).toHaveLength(7);
  expect(p.slides[0].text).toContain('Челюсти');
  expect(p.approvals.topic).toBe(false);
  expect(p.approvals.content).toBe(false);
  expect(p.approvals.design).toBe(false);
  expect(editorialSourcesPass(p)).toBe(false);
  expect(p.research?.sourceItems.every(s=>!s.reviewed)).toBe(true);
  expect(p.slides.every(s=>s.text.length<=260&&isLocalBrandTrialSlide(p,s))).toBe(true);
  expect(p.slides.map(s=>brandTrialArt(s.id).art)).toHaveLength(7);
 });
 it('does not bypass existing source gates and respects changed visual selection',()=>{
  const p=approveEditorialStep(createJawsBrandTrial(),'topic');
  expect(()=>approveEditorialStep(p,'content')).toThrow();
  const changed=reviseEditorialPost(p,{preset:'cream'});
  expect(isLocalBrandTrialSlide(changed,changed.slides[0])).toBe(false);
  expect(isLocalBrandTrialSlide({...p,id:'another-post'},p.slides[0])).toBe(false);
 });
});
