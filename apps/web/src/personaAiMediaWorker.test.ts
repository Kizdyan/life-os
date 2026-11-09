import {describe,expect,it} from 'vitest';
import {readPersonaAiMediaJob} from './personaAiMediaWorker';

const job={version:1 as const,projectId:'project-1',createdAt:'2026-11-03T10:00:00.000Z',status:'awaiting-author-review' as const,
 model:'qwen3:4b-instruct',variation:'cinematic' as const,briefFingerprintSha256:'a'.repeat(64),briefSnapshot:'{"version":1}',
 outputPath:'C:\\Persona\\result',videoPath:'C:\\Persona\\result\\ai-edited-reel.mp4',qaPath:'C:\\Persona\\result\\ai-edited-qa.json',
 resultPath:'C:\\Persona\\result\\RESULT.json',sourceCount:2,distributionAllowed:false as const};

describe('Persona AI media job',()=>{
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

