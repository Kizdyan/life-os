import {describe,expect,it} from 'vitest';
import React from 'react';
import {renderToString} from 'react-dom/server';
import PersonaFinishedRenderReview from './PersonaFinishedRenderReview';
import {readPersonaLocalRenderRecord,type PersonaLocalRenderRecord} from './personaLocalRenderImport';
import {inspectPersonaFinishedRenderImport,makePersonaFinalAuthorReview,
 readPersonaFinishedRenderRecord,type PersonaFinalReviewChecks} from './personaFinishedRenderImport';

const draftSha='a'.repeat(64),finishedSha='b'.repeat(64),briefSha='c'.repeat(64);
const draft:PersonaLocalRenderRecord={
 version:1,kind:'persona-local-render-review-v1',projectId:'p-135',
 briefIdeaId:'reel-7-scenes',briefSnapshot:'{"version":1}',
 briefFingerprintSha256:briefSha,mp4Sha256:draftSha,mp4Bytes:280000,
 mp4Name:'draft-reel.mp4',durationSec:31,width:1080,height:1920,fps:30,
 timingStatus:'within-brief-tolerance',status:'awaiting-author-review',
 importedAt:'2026-11-01T09:00:00.000Z',
 qaProvenance:'locally-imported-report-not-independently-attested',publicationApproved:false
};
const path='D:\\Persona\\finished\\finished-candidate.mp4';
function fixture(){
 const evidence={path,bytes:390000,sha256:finishedSha,fileExists:true,
  probeVerified:true,durationSec:31,width:1080,height:1920,fps:30,
  videoCodec:'h264',audioCodec:'aac',
  blackFrameCheckPassed:true,audioCheckPassed:true};
 const qa={evidence,handoff:{passed:false,status:'blocked',
  errors:['author approval required'],assets:[{passed:true}]},distribution:null};
 const report={version:1,kind:'persona-finished-candidate-v1',
  status:'awaiting-author-review',publicationApproved:false,distributionAllowed:false,
  briefIdeaId:draft.briefIdeaId,briefFingerprintSha256:briefSha,
  originalDraft:'D:\\Persona\\draft\\draft-reel.mp4',originalSha256:draftSha,
  output:path,qaPath:'D:\\Persona\\finished\\finish-qa.json',outputSha256:finishedSha,
  captions:{path:'D:\\Persona\\finished\\captions.reviewed.srt',
   sourceSha256:'d'.repeat(64),cueCount:7,
   burnedIn:true,source:'explicit-human-reviewed-srt'},
  color:{brightness:0,contrast:1,saturation:1},music:null,
  stages:['reviewed-captions-copied-without-editing',
   'reviewed-srt-burned-into-new-mp4',
   'real-ffmpeg-technical-qa-passed-no-publication']};
 return {draft,qa,report,video:{name:'finished-candidate.mp4',size:390000,
  sha256:finishedSha,durationSec:31},importedAt:'2026-11-01T12:00:00.000Z'};
}
const allChecks:PersonaFinalReviewChecks={
 performance:true,framing:true,color:true,audio:true,captions:true,rhythm:true
};
describe('Persona final local render and author review',()=>{
 it('matches final MP4 to the unchanged original draft but never publishes',()=>{
  const final=inspectPersonaFinishedRenderImport(fixture());
  expect(final.status).toBe('awaiting-author-review');
  expect(final.publicationApproved).toBe(false);
  expect(final.finishedSha256).toBe(finishedSha);
  expect(final.sourceDraftSha256).toBe(draftSha);
  expect(final.captionsBurnedIn).toBe(true);
  expect(final.authorReview).toBeUndefined();
  expect(readPersonaFinishedRenderRecord(final)).toEqual(final);
  expect(readPersonaLocalRenderRecord({...draft,finished:final})?.finished).toEqual(final);
 });
 it('rejects wrong original, wrong version and mismatch in actual MP4 bytes',()=>{
  const changedDraft=fixture();changedDraft.report.originalSha256='0'.repeat(64);
  expect(()=>inspectPersonaFinishedRenderImport(changedDraft)).toThrow(/черновику/);
  const changedBrief=fixture();changedBrief.report.briefFingerprintSha256='0'.repeat(64);
  expect(()=>inspectPersonaFinishedRenderImport(changedBrief)).toThrow(/черновику/);
  const swapped=fixture();swapped.video.sha256='f'.repeat(64);
  expect(()=>inspectPersonaFinishedRenderImport(swapped)).toThrow(/MP4/);
  const alteredDuration=fixture();alteredDuration.video.durationSec=39;
  expect(()=>inspectPersonaFinishedRenderImport(alteredDuration)).toThrow(/MP4/);
 });
 it('rejects invented QA, unreviewed captions and unsafe music',()=>{
  const fakeQa=fixture();fakeQa.qa.evidence.blackFrameCheckPassed=false;
  expect(()=>inspectPersonaFinishedRenderImport(fakeQa)).toThrow(/QA|MP4/);
  const publish=fixture();publish.qa.handoff.passed=true;
  expect(()=>inspectPersonaFinishedRenderImport(publish)).toThrow(/публикации/);
  const noCaptions=fixture();noCaptions.report.captions.burnedIn=false;
  expect(()=>inspectPersonaFinishedRenderImport(noCaptions)).toThrow(/субтитров/);
  const badMusic=fixture();
  (badMusic.report as any).music={sha256:'e'.repeat(64),volume:0.3,originalVolume:0.8,
   rightsConfirmedByAuthor:false};
  expect(()=>inspectPersonaFinishedRenderImport(badMusic)).toThrow(/Музыкальная/);
 });
 it('binds the local video-quality report to the exact finished MP4 without treating it as approval',()=>{
  const input=fixture() as ReturnType<typeof fixture>&{quality:unknown};
  input.report.stages.push('local-video-quality-analysis-written');
  (input.report as Record<string,unknown>).qualityPath='D:\\Persona\\finished\\video-quality.json';
  input.quality={version:1,kind:'persona-video-quality-v1',status:'awaiting-author-review',
   publicationApproved:false,distributionAllowed:false,analyzedAt:'2026-11-01T12:00:00.000Z',
   video:{sha256:finishedSha,durationSec:31,width:1080,height:1920,fps:30},
   findings:[{id:'black_frames',status:'measured',title:'Чёрные кадры',detail:'Нет',timecodes:[]}],
   authorApproval:{approvedByAuthor:false,publicationApproved:false}};
  const finished=inspectPersonaFinishedRenderImport(input);
  expect(finished.quality?.videoSha256).toBe(finishedSha);
  expect(finished.quality?.warningCount).toBe(0);
  expect(finished.publicationApproved).toBe(false);
  (input.quality as any).video.sha256='f'.repeat(64);
  expect(()=>inspectPersonaFinishedRenderImport(input)).toThrow(/качества|SHA-256/);
 });
 it('does not approve a final cut without whole-video viewing and six positive checks',()=>{
  const finished=inspectPersonaFinishedRenderImport(fixture());
  const input={finished,decision:'approved-final-cut' as const,reviewer:'Автор',
   notes:'',criteria:allChecks,watchedEntireVideo:true,
   videoSha256:finishedSha,reviewedAt:'2026-11-01T12:30:00.000Z'};
  expect(()=>makePersonaFinalAuthorReview({...input,watchedEntireVideo:false})).toThrow();
  expect(()=>makePersonaFinalAuthorReview({...input,videoSha256:'f'.repeat(64)})).toThrow();
  expect(()=>makePersonaFinalAuthorReview({...input,criteria:{...allChecks,audio:false}})).toThrow();
  const accepted=makePersonaFinalAuthorReview(input);
  expect(accepted.publicationApproved).toBe(false);
  expect(readPersonaFinishedRenderRecord({...finished,authorReview:accepted})?.authorReview).toEqual(accepted);
  expect(readPersonaLocalRenderRecord({...draft,finished:{...finished,authorReview:accepted}})?.finished?.authorReview).toEqual(accepted);
 });
 it('requires concrete notes for a requested revision and binds it to this MP4',()=>{
  const finished=inspectPersonaFinishedRenderImport(fixture());
  const input={finished,decision:'needs-revision' as const,
   reviewer:'Автор',notes:'Слишком тёмный B03',criteria:{...allChecks,color:false},
   watchedEntireVideo:true,videoSha256:finishedSha,reviewedAt:'2026-11-01T13:00:00.000Z'};
  expect(()=>makePersonaFinalAuthorReview({...input,notes:'нет'})).toThrow(/изменения/);
  expect(makePersonaFinalAuthorReview(input).decision).toBe('needs-revision');
  expect(readPersonaLocalRenderRecord({...draft,finished:{...finished,
   sourceDraftSha256:'f'.repeat(64)}})).toBeNull();
  expect(readPersonaFinishedRenderRecord({...finished,authorReview:{
   ...makePersonaFinalAuthorReview(input),publicationApproved:true}})).toBeNull();
 });
 it('renders the final import and human checks with no browser globals on server',()=>{
  const html=renderToString(React.createElement(PersonaFinishedRenderReview,{
   draft,onSave:()=>false,canImport:false
  }));
  expect(html).toContain('Финишный Reels');
  expect(html).toContain('video-quality.json');
  expect(html).toContain('disabled');
  expect(html).toContain('FINISH-RESULT.json');
 });
});
