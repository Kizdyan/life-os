import {describe,it,expect} from 'vitest';
import {createQuietHorrorCarousel,createBaselinePauseCarousel,editorialContentHash,reviseEditorialPost,approveEditorialStep,setEditorialChecklistItem,loadEditorialStore,EDITORIAL_KEY} from './personaEditorialModel';
import {libraryBackground,validCinematicBackground,backgroundAssetUrl} from './personaEditorialBackgrounds';
describe('cinematic backgrounds in existing editorial posts',()=>{
 it('adds eight deterministic local backgrounds without changing older fixtures',()=>{
  const p=createQuietHorrorCarousel();
  expect(p.slides.every(s=>validCinematicBackground(s.background))).toBe(true);
  expect(new Set(p.slides.map(s=>s.background?.libraryId)).size).toBe(5);
  expect(createBaselinePauseCarousel().slides.every(s=>s.background===undefined)).toBe(true);
  expect(backgroundAssetUrl(libraryBackground(0))).toBe('/carousel-backgrounds/v1/empty-stage.jpg');
 });
 it('persists backgrounds and invalidates the existing approval hash when an image changes',()=>{
  let p=approveEditorialStep(approveEditorialStep(createQuietHorrorCarousel(),'topic'),'content');
  for(let i=0;i<6;i++)p=setEditorialChecklistItem(p,i,true);
  p=approveEditorialStep(p,'design');
  const next=reviseEditorialPost(p,{slides:p.slides.map((s,i)=>i?s:{...s,background:libraryBackground(1)})});
  expect(editorialContentHash(next)).not.toBe(editorialContentHash(p));
  expect(next.approvals.designApproved).toBe(false);
  expect(next.approvals.content).toBe(true);
  const storage={getItem:(key:string)=>key===EDITORIAL_KEY?JSON.stringify({version:1,posts:[next]}):null};
  expect(loadEditorialStore(storage).posts.find(s=>s.id===next.id)?.slides[0].background).toEqual(libraryBackground(1));
 });
 it('rejects external URLs, partial generated metadata and invalid local library names',()=>{
  expect(validCinematicBackground({libraryId:'https://evil.invalid/image'})).toBe(false);
  expect(validCinematicBackground({libraryId:'empty-stage',generatedRef:'bad'})).toBe(false);
  expect(validCinematicBackground({libraryId:'empty-stage',generatedRef:'carousel-quiet-horror/bg-123',sha256:'a'.repeat(64)})).toBe(true);
 });
});
