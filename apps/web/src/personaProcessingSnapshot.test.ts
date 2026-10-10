import {describe,it,expect} from 'vitest';
import {readProcessingSnapshot,saveProcessingSnapshot,clearProcessingSnapshot} from './personaProcessingSnapshot';
import type {CreativeMediaMetadata} from './personaMediaIntake';
const asset:CreativeMediaMetadata={
 id:'d'.repeat(32),projectId:'project',contentItemId:'content',ideaId:'idea',ideaVersion:2,
 sessionId:'shoot:one',filename:'file.mp4',mime:'video/mp4',bytes:1000,
 kind:'take',storage:'device_local',state:'INTAKE_LOCAL',createdAt:'2026-10-11',
 role:'primary_take',roleConfidence:'low'
};
function fakeStorage(){
 const values=new Map<string,string>();
 return {getItem:(k:string)=>values.get(k)||null,
  setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
}
const job={id:'job-'+asset.id,status:'review',attempt:1,
 request:{id:'job-'+asset.id,assetId:asset.id,projectId:asset.projectId,
  contentItemId:asset.contentItemId,ideaId:asset.ideaId,ideaVersion:2,sessionId:asset.sessionId}};
describe('Persona non-authoritative offline processing status',()=>{
 it('survives reload for same session and preserves no output token',()=>{
  const storage=fakeStorage();
  expect(saveProcessingSnapshot(job as any,asset,storage)).not.toBeNull();
  expect(readProcessingSnapshot(asset,storage)?.status).toBe('review');
  expect(JSON.stringify(readProcessingSnapshot(asset,storage))).not.toContain('outputUrl');
  expect(readProcessingSnapshot({...asset,ideaVersion:3},storage)).toBeNull();
  clearProcessingSnapshot(asset,storage);
  expect(readProcessingSnapshot(asset,storage)).toBeNull();
 });
 it('never accepts another asset or different revision',()=>{
  const storage=fakeStorage();
  expect(saveProcessingSnapshot(job as any,{...asset,sessionId:'other'},storage)).toBeNull();
  expect(readProcessingSnapshot(asset,storage)).toBeNull();
 });
});
