import {describe,it,expect} from 'vitest';
import {archiveMatchesPost,validateReviewArchive,type ReviewArchiveEvidence} from './personaReviewArchive';
import {createSeedEditorialCarousel,editorialDesignHash,reviseEditorialPost} from './personaEditorialModel';
import {editorialReserve} from './personaEditorialReserve';
const post={...createSeedEditorialCarousel('PHOTO-001'),scheduledDate:'2026-11-28'};
const blob=new Blob([new Uint8Array(22)],{type:'application/zip'});
const evidence:ReviewArchiveEvidence={version:1,contentId:post.id,revision:post.revision,designHash:editorialDesignHash(post),zipSha256:'a'.repeat(64),bytes:blob.size,createdAt:'2026-11-27T00:00:00Z',technical:'TECHNICAL_CHECKS_PASS',visual:'BLOCKED',independence:'MODEL_FAMILY_NOT_VERIFIED',publicationAuthorized:false};
const record={key:JSON.stringify([post.id,post.revision]),evidence,blob};
describe('review archive evidence contract (metadata fixtures, not real ZIP/Worker tests)',()=>{
 it('rejects wrong identity, size and fake approval',()=>{
  expect(validateReviewArchive(record)).toEqual(record);
  expect(()=>validateReviewArchive({...record,key:'other'})).toThrow();
  expect(()=>validateReviewArchive({...record,evidence:{...evidence,bytes:23}})).toThrow();
  expect(()=>validateReviewArchive({...record,evidence:{...evidence,publicationAuthorized:true}})).toThrow();
 });
 it('does not reuse prior revision or changed design',()=>{
  expect(archiveMatchesPost(evidence,post)).toBe(true);
  expect(archiveMatchesPost(evidence,reviseEditorialPost(post,{caption:'Изменённый текст'}))).toBe(false);
  expect(archiveMatchesPost(evidence,{...post,caption:'Другой текст'})).toBe(false);
 });
 it('shows archived evidence without counting it as a ready publication',()=>{
  const result=editorialReserve([post],'2026-11-27',new Map([[post.id,evidence]]));
  expect(result.archivedDays).toBe(1);
  expect(result.verifiedPackages).toBeNull();
  expect(result.rows[1].materials[0].archive?.visual).toBe('BLOCKED');
  expect(result.publicationAuthorized).toBe(false);
  const stale=editorialReserve([reviseEditorialPost(post,{caption:'Другой текст'})],'2026-11-27',new Map([[post.id,evidence]]));
  expect(stale.archivedDays).toBe(0);
 });
});
