import {describe,it,expect} from 'vitest';
import {jobIdForAsset,processingRequest,safeOutputLink,validWorkerUrl} from './personaProcessingClient';
import type {CreativeMediaMetadata} from './personaMediaIntake';

const asset:CreativeMediaMetadata={id:'f'.repeat(32),projectId:'persona:owner:project:v1',
 contentItemId:'content:idea',ideaId:'idea',ideaVersion:2,sessionId:'shoot:one',
 filename:'clip.mp4',mime:'video/mp4',bytes:16384,kind:'take',
 role:'primary_take',roleConfidence:'low',storage:'device_local',state:'INTAKE_LOCAL',createdAt:'2026-10-11'};
describe('Persona desktop handoff is revision-bound and local-first',()=>{
 it('keeps stable asset lineage across reload and retry',()=>{
  expect(jobIdForAsset(asset.id)).toBe('job-'+asset.id);
  expect(processingRequest(asset)).toMatchObject({assetId:asset.id,ideaVersion:2,sessionId:'shoot:one'});
  expect(()=>jobIdForAsset('x/../')).toThrow();
 });
 it('never allows insecure LAN or cross-origin output links',()=>{
  expect(validWorkerUrl('http://192.168.1.5:8787')).toBeNull();
  expect(validWorkerUrl('https://workstation.lan:8787')).toBe('https://workstation.lan:8787');
  expect(validWorkerUrl('http://localhost:8787')).toBe('http://localhost:8787');
  const job={id:'job-'+asset.id,status:'review' as const,outputAvailable:true,
   outputUrl:'/v1/jobs/job-'+asset.id+'/output?token='+'a'.repeat(64)};
  expect(safeOutputLink('https://workstation.lan:8787',job as any)).toContain('/output?token=');
  expect(safeOutputLink('https://workstation.lan:8787',{...job,outputUrl:'https://evil.example/video.mp4'} as any)).toBeNull();
 });
});
