import {describe,it,expect} from 'vitest';
import {isAbandonedCapturePart,validCapturePart,MEDIA_CHUNK_BYTES} from './personaMediaIntake';
describe('Safari bounded capture chunk handling',()=>{
 const id='a'.repeat(32);
 it('rejects missing, corrupted, incorrectly keyed, duplicate-index chunks',()=>{
  const good={id:id+':0',assetId:id,index:0,bytes:new ArrayBuffer(MEDIA_CHUNK_BYTES),savedAt:Date.now()};
  expect(validCapturePart(good,id,0,MEDIA_CHUNK_BYTES)).toBe(true);
  expect(validCapturePart(null,id,0,MEDIA_CHUNK_BYTES)).toBe(false);
  expect(validCapturePart({...good,bytes:new ArrayBuffer(MEDIA_CHUNK_BYTES-1)},id,0,MEDIA_CHUNK_BYTES)).toBe(false);
  expect(validCapturePart({...good,index:1},id,0,MEDIA_CHUNK_BYTES)).toBe(false);
  expect(validCapturePart({...good,assetId:'b'.repeat(32)},id,0,MEDIA_CHUNK_BYTES)).toBe(false);
  expect(validCapturePart({...good,id:id+':1'},id,0,MEDIA_CHUNK_BYTES)).toBe(false);
 });
 it('cleans abandoned partial uploads but never active or committed sources',()=>{
  const now=Date.now(),complete=new Set([id]);
  const record={assetId:id,savedAt:now-48*60*60*1000};
  expect(isAbandonedCapturePart(record,complete,now)).toBe(false);
  expect(isAbandonedCapturePart(record,new Set(),now)).toBe(true);
  expect(isAbandonedCapturePart({...record,savedAt:now-1_000},new Set(),now)).toBe(false);
  expect(isAbandonedCapturePart({...record,savedAt:undefined},new Set(),now)).toBe(true);
 });
});
