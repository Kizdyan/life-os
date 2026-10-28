import {describe,it,expect} from 'vitest';
import {buildReferenceManifest,safeReferenceFilename,suggestReferenceOrganization} from './referenceOrganization';
import {classifyReferenceFile,type ReferenceEntry} from './referenceLibraryBrowser';
const entry=(id:number,name:string,sha256:string|null=null):ReferenceEntry=>({
 id,name,kind:classifyReferenceFile(name),sizeBytes:100,
 sha256,hashStatus:sha256?'verified':'unavailable'
});
describe('read-only organization proposals',()=>{
 it('never emits actions which mutate source files',()=>{
  const manifest=buildReferenceManifest([entry(0,'take.mov')],'2026-10-28T12:00:00.000Z');
  expect(manifest.mode).toBe('preview_only');
  expect(manifest.requiresManualApproval).toBe(true);
  expect(Object.values(manifest.permissions).every(v=>v===false)).toBe(true);
  expect(manifest.items[0].proposedRelativePath).toBe('Референсы/Видео/take.mov');
 });
 it('keeps exact hash duplicates and marks only subsequent copies for review',()=>{
  const result=suggestReferenceOrganization([entry(0,'x.png','abc'),entry(1,'y.png','abc')]);
  expect(result).toHaveLength(2);
  expect(result[0].duplicateReviewRequired).toBe(false);
  expect(result[1].duplicateReviewRequired).toBe(true);
  expect(result[1].proposedRelativePath).toBe('Референсы/Фото/y.png');
 });
 it('does not mark same-named files as exact copies without SHA evidence',()=>{
  const result=suggestReferenceOrganization([entry(0,'scene.mov'),entry(1,'scene.mov')]);
  expect(result.map(x=>x.proposedRelativePath)).toEqual([
   'Референсы/Видео/scene.mov',
   'Референсы/Видео/scene (2).mov'
  ]);
  expect(result.every(x=>!x.duplicateReviewRequired)).toBe(true);
 });
 it('sanitizes path traversal and Windows reserved filenames',()=>{
  expect(safeReferenceFilename('../../docs/evil?.mov')).toBe('evil_.mov');
  expect(safeReferenceFilename('C:\\fake\\CON.txt')).toBe('_CON.txt');
  expect(safeReferenceFilename('..')).toBe('без-названия');
 });
 it('has deterministic order and rejects invalid manifest dates',()=>{
  const files=[entry(0,'a.mov'),entry(1,'b.jpg')];
  expect(suggestReferenceOrganization(files)).toEqual(suggestReferenceOrganization(files));
  expect(()=>buildReferenceManifest(files,'invalid')).toThrow();
 });
});
