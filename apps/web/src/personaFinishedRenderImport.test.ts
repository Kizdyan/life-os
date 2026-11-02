import {describe,expect,it} from 'vitest';
import React from 'react';
import {renderToString} from 'react-dom/server';
import PersonaFinishedRenderReview from './PersonaFinishedRenderReview';
import {readPersonaLocalRenderRecord,type PersonaLocalRenderRecord} from './personaLocalRenderImport';
import {inspectPersonaFinishedRenderImport,mergePersonaFinishedReimport,makePersonaFinalAuthorReview,
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
  sha256:finishedSha,durationSec:31,width:1080,height:1920},importedAt:'2026-11-01T12:00:00.000Z'};
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
 it('checks browser-parsed pixel dimensions instead of trusting local FFprobe reports alone',()=>{
  expect(inspectPersonaFinishedRenderImport(fixture()).width).toBe(1080);
  const width=fixture();width.video.width=720;
  expect(()=>inspectPersonaFinishedRenderImport(width)).toThrow(/Фактическое разрешение/);
  const height=fixture();height.video.height=1280;
  expect(()=>inspectPersonaFinishedRenderImport(height)).toThrow(/Фактическое разрешение/);
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
 it('shows a validated timed soundtrack but rejects a forged or out-of-range cue',()=>{
  const input=fixture();
  (input.report as any).music={sha256:'e'.repeat(64),volume:0.16,originalVolume:0.9,
   rightsConfirmedByAuthor:true,startSec:24.53,endSec:26.65,fadeInSec:0.04,fadeOutSec:0.18};
  const result=inspectPersonaFinishedRenderImport(input);
  expect(result.musicCue).toEqual({startSec:24.53,endSec:26.65,fadeInSec:0.04,fadeOutSec:0.18});
  expect(readPersonaFinishedRenderRecord(result)).not.toBeNull();
  expect(readPersonaLocalRenderRecord({...draft,finished:result})).not.toBeNull();
  expect(readPersonaFinishedRenderRecord({...result,musicCue:{...result.musicCue!,endSec:40}})).toBeNull();
  (input.report as any).music.fadeOutSec=4;
  expect(()=>inspectPersonaFinishedRenderImport(input)).toThrow(/музыкального/);
  delete (input.report as any).music.startSec;
  expect(()=>inspectPersonaFinishedRenderImport(input)).toThrow(/музыкального/);
 });
 it('rejects an undeclared final quality report instead of ignoring it',()=>{
  const input=fixture() as ReturnType<typeof fixture>&{quality:unknown};
  input.quality={version:1};
  expect(()=>inspectPersonaFinishedRenderImport(input)).toThrow(/не подтверждает/);
 });
 it('binds the local video-quality report to the exact finished MP4 without treating it as approval',()=>{
  const input=fixture() as ReturnType<typeof fixture>&{quality:unknown};
  input.report.stages.push('local-video-quality-analysis-written');
  (input.report as Record<string,unknown>).qualityPath='D:\\Persona\\finished\\video-quality.json';
  input.quality={version:1,kind:'persona-video-quality-v1',status:'awaiting-author-review',
   publicationApproved:false,distributionAllowed:false,analyzedAt:'2026-11-01T12:00:00.000Z',
   video:{sha256:finishedSha,bytes:390000,durationSec:31,width:1080,height:1920,fps:30},
   findings:[{id:'black_frames',status:'measured',title:'Чёрные кадры',detail:'Нет',timecodes:[]}],
   authorApproval:{approvedByAuthor:false,publicationApproved:false}};
  const finished=inspectPersonaFinishedRenderImport(input);
  expect(finished.quality?.videoSha256).toBe(finishedSha);
  expect(finished.quality?.warningCount).toBe(0);
  expect(finished.publicationApproved).toBe(false);
  (input.quality as any).video.bytes=390001;
  expect(()=>inspectPersonaFinishedRenderImport(input)).toThrow(/качества/);
  (input.quality as any).video.bytes=390000;
  (input.quality as any).video.fps=25;
  expect(()=>inspectPersonaFinishedRenderImport(input)).toThrow(/качества/);
  (input.quality as any).video.fps=30;
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
 it('preserves an identical SHA final cut decision and previously verified quality on repeat import',()=>{
  const previous=inspectPersonaFinishedRenderImport(fixture());
  const review=makePersonaFinalAuthorReview({finished:previous,decision:'approved-final-cut',
   reviewer:'Автор',notes:'',criteria:allChecks,watchedEntireVideo:true,
   videoSha256:finishedSha,reviewedAt:'2026-11-01T13:00:00Z'});
  const withQuality={...previous,authorReview:review,quality:{
   version:1 as const,videoSha256:finishedSha,analyzedAt:'2026-11-01T14:00:00Z',
   warningCount:1,humanReviewCount:0,findings:[{id:'audio_loudness',
    status:'warning' as const,title:'Громкость',detail:'Проверить',timecodes:[]}]
  }};
  expect(readPersonaFinishedRenderRecord(withQuality)).not.toBeNull();
  const another=inspectPersonaFinishedRenderImport(fixture());
  const merged=mergePersonaFinishedReimport(withQuality,another);
  expect(merged.authorReview).toEqual(review);
  expect(merged.quality).toEqual(withQuality.quality);
  expect(merged.importedAt).toBe(withQuality.importedAt);
  expect(merged.publicationApproved).toBe(false);
  expect(readPersonaLocalRenderRecord({...draft,finished:merged})).not.toBeNull();
 });
 it('does not carry creative decisions to changed MP4 and detects contradictory same-file claims',()=>{
  const previous=inspectPersonaFinishedRenderImport(fixture());
  const next=inspectPersonaFinishedRenderImport(fixture());
  const changed={...next,finishedSha256:'f'.repeat(64)};
  expect(mergePersonaFinishedReimport(previous,changed)).toEqual(changed);
  const inconsistent={...next,color:{brightness:0.01,contrast:1,saturation:1}};
  expect(()=>mergePersonaFinishedReimport(previous,inconsistent)).toThrow(/противоречат/);
 });
 it('rejects same-file reimport when only one report contains a music cue',()=>{
  const previous=inspectPersonaFinishedRenderImport(fixture());
  const withCue={...previous,musicAdded:true,musicCue:{startSec:2,endSec:4,fadeInSec:0.1,fadeOutSec:0.1}};
  const withoutCue={...previous,musicAdded:true};
  expect(readPersonaFinishedRenderRecord(withCue)).not.toBeNull();
  expect(readPersonaFinishedRenderRecord(withoutCue)).not.toBeNull();
  expect(()=>mergePersonaFinishedReimport(withoutCue,withCue)).toThrow(/противоречат/);
  expect(()=>mergePersonaFinishedReimport(withCue,withoutCue)).toThrow(/противоречат/);
 });
 it('does not silently drop prior QA warnings on same-video reimport',()=>{
  const previous=inspectPersonaFinishedRenderImport(fixture());
  const flagged={...previous,quality:{version:1 as const,videoSha256:finishedSha,
   analyzedAt:'2026-11-01T14:00:00Z',warningCount:1,humanReviewCount:0,
   findings:[{id:'audio_loudness',status:'warning' as const,title:'Audio',detail:'Review',timecodes:[]}]}};
  const cleared={...flagged,quality:{...flagged.quality,warningCount:0,findings:[{id:'audio_loudness',status:'measured' as const,title:'Audio',detail:'Review',timecodes:[]}]}};
  expect(()=>mergePersonaFinishedReimport(flagged,cleared)).toThrow(/предупреждения/);
  expect(mergePersonaFinishedReimport(flagged,previous).quality).toEqual(flagged.quality);
 });
 it('does not silently erase contact-sheet evidence on same-video refresh',()=>{
  const base=inspectPersonaFinishedRenderImport(fixture());
  const quality={version:1 as const,videoSha256:finishedSha,analyzedAt:'2026-11-01T14:00:00Z',
   warningCount:0,humanReviewCount:0,findings:[{id:'black_frames',status:'measured' as const,
    title:'Frames',detail:'Measured',timecodes:[]}],
   visualEvidence:{contactSheetPath:'frames/contact-sheet.jpg',frameCount:7}};
  const old={...base,quality};
  const newer={...base,quality:{...quality,analyzedAt:'2026-11-01T15:00:00Z',visualEvidence:undefined}};
  expect(()=>mergePersonaFinishedReimport(old,newer)).toThrow(/кадры/);
  expect(mergePersonaFinishedReimport(old,base).quality?.visualEvidence).toEqual(quality.visualEvidence);
 });
 it('rejects rewritten QA descriptions for the same finding ID',()=>{
  const base=inspectPersonaFinishedRenderImport(fixture());
  const quality={version:1 as const,videoSha256:finishedSha,analyzedAt:'2026-11-01T14:00:00Z',
   warningCount:0,humanReviewCount:0,findings:[{id:'black_frames',status:'measured' as const,
    title:'Black frames',detail:'No black frames',timecodes:['00:00:05.000']}]};
  const previous={...base,quality};
  const rewritten={...base,quality:{...quality,analyzedAt:'2026-11-01T15:00:00Z',
   findings:[{...quality.findings[0],detail:'Altered after review'}]}};
  expect(()=>mergePersonaFinishedReimport(previous,rewritten)).toThrow(/содержание/);
 });
 it('rejects older final QA reports on the same MP4',()=>{
  const base=inspectPersonaFinishedRenderImport(fixture());
  const quality={version:1 as const,videoSha256:finishedSha,analyzedAt:'2026-11-01T14:00:00Z',
   warningCount:0,humanReviewCount:0,findings:[{id:'black_frames',status:'measured' as const,
    title:'Frames',detail:'No black frames',timecodes:[]}]};
  const newer={...base,quality};
  const older={...base,quality:{...quality,analyzedAt:'2026-11-01T13:00:00Z'}};
  expect(()=>mergePersonaFinishedReimport(newer,older)).toThrow(/старым анализом/);
  expect(mergePersonaFinishedReimport(older,newer).quality?.analyzedAt).toBe(quality.analyzedAt);
 });
 it('keeps earlier measured QA evidence when a later analysis of the same MP4 changes its finding set',()=>{
  const base=inspectPersonaFinishedRenderImport(fixture());
  const first={...base,quality:{version:1 as const,videoSha256:finishedSha,analyzedAt:'2026-11-01T14:00:00Z',
   warningCount:0,humanReviewCount:0,findings:[{id:'black_frames',status:'measured' as const,
    title:'Frames',detail:'No black frames',timecodes:[]}]}};
  const later={...base,quality:{version:1 as const,videoSha256:finishedSha,analyzedAt:'2026-11-01T15:00:00Z',
   warningCount:0,humanReviewCount:0,findings:[{id:'audio_loudness',status:'measured' as const,
    title:'Audio',detail:'Measured again',timecodes:[]}]}};
  const merged=mergePersonaFinishedReimport(first,later);
  expect(merged.quality).toEqual(later.quality);
  expect(merged.qualityHistory).toEqual([first.quality]);
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
 it('shows preserved earlier measurements separately from the current report',()=>{
  const current=inspectPersonaFinishedRenderImport(fixture());
  const earlier={version:1 as const,videoSha256:finishedSha,analyzedAt:'2026-11-01T11:00:00Z',
   warningCount:0,humanReviewCount:0,findings:[{id:'black_frames',status:'measured' as const,
    title:'Frames',detail:'No black frames',timecodes:[]}]};
  const html=renderToString(React.createElement(PersonaFinishedRenderReview,{
   draft:{...draft,finished:{...current,quality:{...earlier,analyzedAt:'2026-11-01T12:00:00Z'},qualityHistory:[earlier]}},
   onSave:()=>false,canImport:false
  }));
  expect(html).toContain('История технических измерений');
  expect(html).toContain('11:00');
 });
});
