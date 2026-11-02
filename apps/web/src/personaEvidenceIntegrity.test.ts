import {describe,expect,it} from 'vitest';
import {parsePersonaVideoQuality,isPersonaVideoQualitySummary,readPersonaFinishedRenderRecord} from './personaFinishedRenderImport';
import {isPersonaDraftCurrentForApproval} from './personaLocalRenderImport';

const sha='a'.repeat(64);
const finding={id:'black_frames',status:'warning',title:'Black frames',detail:'Review',timecodes:[]};
function report(findings:unknown[]){
 return {version:1,kind:'persona-video-quality-v1',status:'awaiting-author-review',
  publicationApproved:false,distributionAllowed:false,analyzedAt:'2026-11-02T12:00:00Z',
  video:{sha256:sha},authorApproval:{approvedByAuthor:false,publicationApproved:false},findings};
}
describe('Persona quality evidence integrity',()=>{
 it('rejects duplicate finding IDs, even with different statuses',()=>{
  expect(parsePersonaVideoQuality(report([finding,{...finding,status:'measured'}]),sha)).toBeNull();
  expect(parsePersonaVideoQuality(report([finding,{...finding}]),sha)).toBeNull();
  expect(parsePersonaVideoQuality(report([finding]),sha)?.warningCount).toBe(1);
 });
 it('rejects malformed analysis dates and inconsistent human review counts',()=>{
  expect(parsePersonaVideoQuality({...report([finding]),analyzedAt:'not-a-date'},sha)).toBeNull();
  const review={...finding,id:'manual_color',status:'needs_human_review'};
  const parsed=parsePersonaVideoQuality(report([finding,review]),sha);
  expect(parsed?.humanReviewCount).toBe(1);
  expect(isPersonaVideoQualitySummary(parsed,sha)).toBe(true);
  expect(isPersonaVideoQualitySummary({...parsed,humanReviewCount:0},sha)).toBe(false);
 });
 it('validates saved contact-sheet metadata without claiming image review',()=>{
  const parsed=parsePersonaVideoQuality(report([finding]),sha);
  const valid={...parsed,visualEvidence:{contactSheetPath:'frames/contact-sheet.jpg',frameCount:7}};
  expect(isPersonaVideoQualitySummary(valid,sha)).toBe(true);
  expect(isPersonaVideoQualitySummary({...valid,visualEvidence:{...valid.visualEvidence,frameCount:0}},sha)).toBe(false);
  expect(isPersonaVideoQualitySummary({...valid,visualEvidence:{...valid.visualEvidence,frameCount:13}},sha)).toBe(false);
  expect(isPersonaVideoQualitySummary({...valid,visualEvidence:{...valid.visualEvidence,contactSheetPath:''}},sha)).toBe(false);
 });
 it('rejects falsified QA counts',()=>{
  const parsed=parsePersonaVideoQuality(report([finding]),sha);
  expect(isPersonaVideoQualitySummary(parsed,sha)).toBe(true);
  expect(isPersonaVideoQualitySummary({...parsed,warningCount:0},sha)).toBe(false);
 });
 it('rejects an impossible final author review timestamp',()=>{
  const finished={version:1,kind:'persona-finished-render-review-v1',
   sourceDraftSha256:sha,briefFingerprintSha256:sha,finishedSha256:sha,
   finishedBytes:400000,durationSec:31,width:1080,height:1920,fps:30,
   captionsBurnedIn:true,captionCount:7,color:{brightness:0,contrast:1,saturation:1},
   musicAdded:false,importedAt:'2026-11-02T12:00:00Z',status:'awaiting-author-review',
   publicationApproved:false,qaProvenance:'browser-sha256-matched-local-ffmpeg-report'};
  expect(readPersonaFinishedRenderRecord(finished)).not.toBeNull();
  const review={decision:'approved-final-cut',reviewer:'Author',notes:'',
   reviewedAt:'2026-11-02T11:00:00Z',watchedEntireVideo:true,
   criteria:{performance:true,framing:true,color:true,audio:true,captions:true,rhythm:true},
   videoSha256:sha,publicationApproved:false};
  expect(readPersonaFinishedRenderRecord({...finished,authorReview:review})).toBeNull();
  expect(readPersonaFinishedRenderRecord({...finished,authorReview:{...review,reviewedAt:'2026-11-02T13:00:00Z'}})).not.toBeNull();
 });
 it('never revives an old draft after a new approval decision',()=>{
  const record={projectId:'p1',briefSnapshot:'brief-v1',importedAt:'2026-11-02T12:00:00Z'} as Parameters<typeof isPersonaDraftCurrentForApproval>[0]['record'];
  const input={record,projectId:'p1',briefSnapshot:'brief-v1',handoffAllowed:true,approvalDecidedAt:'2026-11-02T11:00:00Z'};
  expect(isPersonaDraftCurrentForApproval(input)).toBe(true);
  expect(isPersonaDraftCurrentForApproval({...input,approvalDecidedAt:'2026-11-02T13:00:00Z'})).toBe(false);
  expect(isPersonaDraftCurrentForApproval({...input,briefSnapshot:'brief-v2'})).toBe(false);
  expect(isPersonaDraftCurrentForApproval({...input,handoffAllowed:false})).toBe(false);
  expect(isPersonaDraftCurrentForApproval({...input,projectId:'p2'})).toBe(false);
 });
});
