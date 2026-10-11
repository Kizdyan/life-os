import {describe,it,expect,vi,afterEach} from 'vitest';
import {createHash} from 'node:crypto';
import {jobIdForAsset,jobBelongsToAsset,processingRequest,safeOutputLink,validWorkerUrl,videoMime,transferStatus,sendChunk} from './personaProcessingClient';
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
 it('accepts iPhone .MOV when Safari omitted MIME but never accepts an audio file',()=>{
  expect(videoMime({...asset,filename:'IMG_0030.MOV',mime:'application/octet-stream'})).toBe('video/quicktime');
  expect(processingRequest({...asset,filename:'IMG_0030.MOV',mime:'application/octet-stream'}).mime).toBe('video/quicktime');
  expect(videoMime({...asset,filename:'voice.m4a',mime:'audio/mp4'})).toBeNull();
 });
 it('rejects stale jobs after changing video, idea, revision or session',()=>{
  const job={id:'job-'+asset.id,status:'ready' as const,outputAvailable:true,
   request:{id:'job-'+asset.id,assetId:asset.id,projectId:asset.projectId,
    contentItemId:asset.contentItemId,ideaId:asset.ideaId,
    ideaVersion:asset.ideaVersion,sessionId:asset.sessionId}};
  expect(jobBelongsToAsset(job as any,asset)).toBe(true);
  expect(jobBelongsToAsset(job as any,{...asset,sessionId:'shoot:second'})).toBe(false);
  expect(jobBelongsToAsset(job as any,{...asset,ideaVersion:3})).toBe(false);
  expect(jobBelongsToAsset(job as any,{...asset,id:'a'.repeat(32)})).toBe(false);
  expect(jobBelongsToAsset({...job,request:{...job.request,contentItemId:'other'}} as any,asset)).toBe(false);
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

describe('resumable browser-to-desktop video transfer',()=>{
 afterEach(()=>vi.unstubAllGlobals());
 const settings={url:'https://desktop.example:8787',token:'x'.repeat(64)};
 const job='job-'+'f'.repeat(32);
 it('accepts durable remote chunks and resumes only missing indexes',async()=>{
  const remote={id:job,chunkBytes:2*1024*1024,totalParts:3,received:[0,2],inputReady:false};
  const mock=vi.fn().mockResolvedValue({ok:true,json:async()=>remote});
  vi.stubGlobal('fetch',mock);
  expect((await transferStatus(settings,job,5*1024*1024)).received).toEqual([0,2]);
  expect(mock.mock.calls[0][0]).toContain('/transfer');
 });
 it('rejects duplicate receipt indexes, wrong totals and other job IDs',async()=>{
  for(const remote of [
   {id:job,chunkBytes:2*1024*1024,totalParts:3,received:[0,0],inputReady:false},
   {id:job,chunkBytes:2*1024*1024,totalParts:4,received:[],inputReady:false},
   {id:'job-'+'a'.repeat(32),chunkBytes:2*1024*1024,totalParts:3,received:[],inputReady:false}
  ]){
   vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>remote}));
   await expect(transferStatus(settings,job,5*1024*1024)).rejects.toThrow();
  }
 });
 it('sends exactly one bounded Blob with SHA256, no base64 or whole video',async()=>{
  const input=new Blob([new Uint8Array([1,2,3])]);
  const mock=vi.fn().mockResolvedValue({ok:true,json:async()=>({id:job,index:0})});
  vi.stubGlobal('fetch',mock);
  await sendChunk(settings,job,0,3,input);
  const request=mock.mock.calls[0][1];
  expect(request.body).toBe(input);
  expect(request.headers['X-Chunk-SHA256']).toBe(createHash('sha256').update(Buffer.from([1,2,3])).digest('hex'));
  expect(request.method).toBe('PUT');
 });
});
