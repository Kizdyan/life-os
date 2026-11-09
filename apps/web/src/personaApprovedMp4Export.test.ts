import {describe,it,expect} from 'vitest';
import {approvedPersonaMp4DownloadName} from './personaApprovedMp4Export';

const sha='a'.repeat(64);
const accepted={finishedSha256:sha,authorReview:{decision:'approved-final-cut'}};
describe('Persona approved MP4 export',()=>{
 it('allows matching local bytes only after explicit final-cut approval',()=>{
  expect(approvedPersonaMp4DownloadName(accepted,sha,true))
   .toBe('persona-reel-approved-aaaaaaaaaaaa.mp4');
 });
 it('does not conflate approval with an available browser file',()=>{
  expect(approvedPersonaMp4DownloadName(accepted,sha,false)).toBeNull();
  expect(approvedPersonaMp4DownloadName(accepted,null,true)).toBeNull();
 });
 it('never allows a historical or rejected final cut to export',()=>{
  expect(approvedPersonaMp4DownloadName({finishedSha256:sha},sha,true)).toBeNull();
  expect(approvedPersonaMp4DownloadName(
   {finishedSha256:sha,authorReview:{decision:'needs-revision'}},sha,true)).toBeNull();
 });
 it('refuses mismatched or malformed SHA-256 evidence',()=>{
  expect(approvedPersonaMp4DownloadName(accepted,'b'.repeat(64),true)).toBeNull();
  expect(approvedPersonaMp4DownloadName(accepted,'invalid',true)).toBeNull();
  expect(approvedPersonaMp4DownloadName(
   {...accepted,finishedSha256:'unverified'},sha,true)).toBeNull();
 });
 it('treats SHA-256 hex case consistently',()=>{
  expect(approvedPersonaMp4DownloadName(
   {...accepted,finishedSha256:'ABCDEF'.repeat(10)+'abcd'},'abcdef'.repeat(10)+'abcd',true))
   .toBe('persona-reel-approved-abcdefabcdef.mp4');
 });
});
