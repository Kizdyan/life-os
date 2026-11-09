import {describe,expect,it} from 'vitest';
import {readPersonaAiMediaJob,planPersonaAiTakeUploads} from './personaAiMediaWorker';

const job={version:1 as const,projectId:'project-1',createdAt:'2026-11-03T10:00:00.000Z',status:'awaiting-author-review' as const,
 model:'qwen3:4b-instruct',variation:'cinematic' as const,briefFingerprintSha256:'a'.repeat(64),briefSnapshot:'{"version":1}',
 outputPath:'C:\\Persona\\result',videoPath:'C:\\Persona\\result\\ai-edited-reel.mp4',qaPath:'C:\\Persona\\result\\ai-edited-qa.json',
 resultPath:'C:\\Persona\\result\\RESULT.json',sourceCount:2,distributionAllowed:false as const};

describe('Persona AI media job',()=>{
 it('maps explicitly assigned camera files to copies without renaming originals or changing MOV extensions',()=>{
  const files=[{name:'IMG_9001.MOV',size:2048},{name:'Дубль 2.mp4',size:4096}];
  const plan=planPersonaAiTakeUploads(files,[2,2],3);
  expect(plan.map(x=>x.workerName)).toEqual(['S02_take01.MOV','S02_take02.mp4']);
  expect(plan.map(x=>x.originalName)).toEqual(['IMG_9001.MOV','Дубль 2.mp4']);
  expect(files[0].name).toBe('IMG_9001.MOV');
 });
 it('requires scene assignment and refuses unsupported or oversized user files before upload',()=>{
  const files=[{name:'IMG_1.MOV',size:2048},{name:'IMG_2.MOV',size:2048}];
  expect(()=>planPersonaAiTakeUploads(files,[null,2],2)).toThrow(/сцен/);
  expect(()=>planPersonaAiTakeUploads(files,[1,3],2)).toThrow(/сцен/);
  expect(()=>planPersonaAiTakeUploads([files[0],{name:'notes.txt',size:2048}],[1,2],2)).toThrow(/формат/);
  expect(()=>planPersonaAiTakeUploads([files[0],{name:'big.mp4',size:3*1024**3}],[1,2],2)).toThrow(/2 ГБ/);
 });
 it('restores only a valid local session identity, without storing an access token',()=>{
  const sessionId='11111111-1111-4111-8111-111111111111';
  expect(readPersonaAiMediaJob({...job,sessionId})?.sessionId).toBe(sessionId);
  expect(readPersonaAiMediaJob({...job,sessionId:'../other-project'})).toBeNull();
  expect(readPersonaAiMediaJob({...job,distributionAllowed:true})).toBeNull();
 });
 it('persists the exact approved-brief snapshot with metadata only',()=>{
  expect(readPersonaAiMediaJob(job)).toEqual(job);
  expect(readPersonaAiMediaJob({...job,briefSnapshot:''})).toBeNull();
  expect(readPersonaAiMediaJob({...job,briefSnapshot:'x'.repeat(100001)})).toBeNull();
 });
});

