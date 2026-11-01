import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {inspectPersonaLocalRenderImport,readPersonaLocalRenderRecord,buildPersonaFinishOptionsTemplate} from './personaLocalRenderImport';

const brief=JSON.parse(readFileSync(new URL('../../../docs/persona-delivery/editorial-candidate-production-brief.json',import.meta.url),'utf8'));
const fingerprint='a'.repeat(64),videoSha='b'.repeat(64),bytes=800_000;
const evidence={
 path:'D:\\Persona\\reel-draft\\draft-reel.mp4',bytes,sha256:videoSha,
 fileExists:true,probeVerified:true,durationSec:31,width:1080,height:1920,fps:30,
 videoCodec:'h264',audioCodec:'aac',blackFrameCheckPassed:true,audioCheckPassed:true,
};
function fixture(){
 const qa={evidence:{...evidence},handoff:{
  passed:false,status:'blocked',errors:['author approval required'],assets:[{passed:true}]},distribution:null};
 const result={version:1,status:'awaiting-author-review',briefIdeaId:brief.ideaId,
  briefFingerprintSha256:fingerprint,output:evidence.path,qaPath:'D:\\Persona\\reel-draft\\qa.json',
  distributionAllowed:false,events:['real_mp4_rendered','technical_qa_passed'],
  technicalChecks:{...evidence},timing:{status:'within-brief-tolerance'}};
 return {projectId:'p1',brief,briefFingerprintSha256:fingerprint,result,qa,
  video:{name:'draft-reel.mp4',size:bytes,sha256:videoSha,durationSec:31},importedAt:'2026-11-01T12:00:00Z'};
}
describe('Persona local render evidence intake',()=>{
 it('exports only a disabled human-review template bound to the rendered MP4',()=>{
  const record=inspectPersonaLocalRenderImport(fixture());
  const options=buildPersonaFinishOptionsTemplate(record);
  expect(options.sourceSha256).toBe(record.mp4Sha256);
  expect(options.publicationApproved).toBe(false);
  expect(options.captionsReviewed).toBe(false);
  expect(options.captionsPath).toMatch(/REPLACE_WITH_ABSOLUTE_PATH/);
 });

 it('accepts a matching local report but preserves the human-only approval gate',()=>{
  const record=inspectPersonaLocalRenderImport(fixture());
  expect(record.status).toBe('awaiting-author-review');
  expect(record.publicationApproved).toBe(false);
  expect(record.qaProvenance).toMatch(/not-independently-attested/);
  expect(readPersonaLocalRenderRecord(record)).toEqual(record);
  expect(readPersonaLocalRenderRecord({kind:'other',publicationApproved:true})).toBeNull();
 });
 it('refuses a render from a different production brief',()=>{
  const a=fixture();a.result.briefFingerprintSha256='f'.repeat(64);
  expect(()=>inspectPersonaLocalRenderImport(a)).toThrow(/сценария|брифа/);
  const b=fixture();b.result.briefIdeaId='another-idea';
  expect(()=>inspectPersonaLocalRenderImport(b)).toThrow();
 });
 it('refuses a replaced MP4 even if the filename and reports appear correct',()=>{
  const a=fixture();a.video.sha256='f'.repeat(64);
  expect(()=>inspectPersonaLocalRenderImport(a)).toThrow(/MP4/);
  const b=fixture();b.video.size+=1;
  expect(()=>inspectPersonaLocalRenderImport(b)).toThrow(/MP4/);
  const c=fixture();c.video.durationSec=35;
  expect(()=>inspectPersonaLocalRenderImport(c)).toThrow(/Длительность/);
 });
 it('refuses conflicting report evidence, fake technical pass, or premature publication',()=>{
  const a=fixture();a.result.technicalChecks.sha256='f'.repeat(64);
  expect(()=>inspectPersonaLocalRenderImport(a)).toThrow(/разные/);
  const b=fixture();b.qa.evidence.blackFrameCheckPassed=false;
  expect(()=>inspectPersonaLocalRenderImport(b)).toThrow(/QA/);
  const c=fixture();c.qa.handoff.passed=true;
  expect(()=>inspectPersonaLocalRenderImport(c)).toThrow(/публикации/);
  const d=fixture();d.result.distributionAllowed=true;
  expect(()=>inspectPersonaLocalRenderImport(d)).toThrow();
 });
 it('accepts measured local video-quality with exact MP4 SHA, and preserves old three-file reports',()=>{
  const old=inspectPersonaLocalRenderImport(fixture());
  expect(old.quality).toBeUndefined();
  const a=fixture() as ReturnType<typeof fixture>&{quality:unknown};
  a.quality={version:1,kind:'persona-video-quality-v1',status:'awaiting-author-review',
   publicationApproved:false,distributionAllowed:false,analyzedAt:'2026-11-01T12:00:00Z',
   video:{sha256:videoSha,bytes,width:1080,height:1920,fps:30,durationSec:31},
   findings:[{id:'black_frames',status:'warning',title:'Чёрные кадры',
    detail:'Предупреждение на 00:00:03.000',timecodes:['00:00:03.000']}],
   authorApproval:{approvedByAuthor:false,publicationApproved:false}};
  const imported=inspectPersonaLocalRenderImport(a);
  expect(imported.quality?.videoSha256).toBe(videoSha);
  expect(imported.quality?.warningCount).toBe(1);
  expect(imported.publicationApproved).toBe(false);
  expect(readPersonaLocalRenderRecord(imported)?.quality).toEqual(imported.quality);
  (a.quality as any).video.sha256='f'.repeat(64);
  expect(()=>inspectPersonaLocalRenderImport(a)).toThrow(/video-quality.json/);
  (a.quality as any).video.sha256=videoSha;
  (a.quality as any).video.bytes=bytes+1;
  expect(()=>inspectPersonaLocalRenderImport(a)).toThrow(/video-quality.json/);
  (a.quality as any).video.bytes=bytes;
  (a.quality as any).publicationApproved=true;
  expect(()=>inspectPersonaLocalRenderImport(a)).toThrow(/video-quality.json/);
 });
 it('requires actual output and QA paths from the chosen runner directory',()=>{
  const a=fixture();a.result.output='D:\\another.mp4';
  expect(()=>inspectPersonaLocalRenderImport(a)).toThrow(/Выберите файлы/);
 });
});
