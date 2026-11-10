import {describe,expect,it} from 'vitest';
import {readPersonaAiMediaJob,planPersonaAiTakeUploads,isPersonaDirectorDecisionFresh,inferPersonaSceneOrder,validatePersonaTakeDuration} from './personaAiMediaWorker';

const job={version:1 as const,projectId:'project-1',createdAt:'2026-11-03T10:00:00.000Z',status:'awaiting-author-review' as const,
 model:'qwen3:4b-instruct',variation:'cinematic' as const,briefFingerprintSha256:'a'.repeat(64),briefSnapshot:'{"version":1}',
 outputPath:'C:\\Persona\\result',videoPath:'C:\\Persona\\result\\ai-edited-reel.mp4',qaPath:'C:\\Persona\\result\\ai-edited-qa.json',
 resultPath:'C:\\Persona\\result\\RESULT.json',sourceCount:2,distributionAllowed:false as const};

describe('Persona AI media job',()=>{
 it('maps numeric camera names without guessing unrelated names and rejects long short-takes',()=>{
  expect(inferPersonaSceneOrder('001.mp4',11)).toBe(1);expect(inferPersonaSceneOrder('011.MOV',11)).toBe(11);expect(inferPersonaSceneOrder('IMG_001.MOV',11)).toBeNull();
  expect(()=>validatePersonaTakeDuration(600,5,false)).toThrow(/15/);expect(()=>validatePersonaTakeDuration(5.1,5,false)).not.toThrow();expect(()=>validatePersonaTakeDuration(NaN,5,false)).toThrow();
 });
 it('explicit master-asset mode accepts one original while normal takes still require scene assignment',()=>{
  const files=[{name:'Master.MOV',size:2048}];
  expect(()=>planPersonaAiTakeUploads(files,[],2)).toThrow();
  expect(planPersonaAiTakeUploads(files,[],2,true)).toEqual([{originalName:'Master.MOV',sceneOrder:1,workerName:'S01_take01.MOV'}]);
  expect(()=>planPersonaAiTakeUploads([...files,...files],[],2,true)).toThrow();
  expect(readPersonaAiMediaJob({...job,sourceCount:1,masterAsset:true})?.sourceCount).toBe(1);
  expect(readPersonaAiMediaJob({...job,sourceCount:1})).toBeNull();
 });
 it('refreshes expired, missing or invalid director receipts before starting a render',()=>{
  const now=Date.parse('2026-11-09T10:30:00.000Z');
  expect(isPersonaDirectorDecisionFresh({createdAt:'2026-11-09T10:01:00.000Z'},now)).toBe(true);
  for(const createdAt of ['2026-11-09T10:00:00.000Z','2026-11-09T10:31:00.000Z','invalid',undefined])expect(isPersonaDirectorDecisionFresh({createdAt},now)).toBe(false);
  expect(isPersonaDirectorDecisionFresh(null,now)).toBe(false);
 });
 it('restores a directed result without accepting invented presets or model identities',()=>{
  const creativeDirection={mode:'auto' as const,selected_preset:'Cinematic' as const,model:'persona-qwen-cpu:latest'};
  expect(readPersonaAiMediaJob(JSON.parse(JSON.stringify({...job,creativeDirection})))?.creativeDirection).toEqual(creativeDirection);
  expect(readPersonaAiMediaJob({...job,creativeDirection:{...creativeDirection,selected_preset:'invented'}})).toBeNull();
  expect(readPersonaAiMediaJob({...job,creativeDirection:{...creativeDirection,model:42}})).toBeNull();
 });
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

