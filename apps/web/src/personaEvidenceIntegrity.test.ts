import {describe,expect,it} from 'vitest';
import {parsePersonaVideoQuality,isPersonaVideoQualitySummary} from './personaFinishedRenderImport';
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
 it('rejects falsified QA counts',()=>{
  const parsed=parsePersonaVideoQuality(report([finding]),sha);
  expect(isPersonaVideoQualitySummary(parsed,sha)).toBe(true);
  expect(isPersonaVideoQualitySummary({...parsed,warningCount:0},sha)).toBe(false);
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
