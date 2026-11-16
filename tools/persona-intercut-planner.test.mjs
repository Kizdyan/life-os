import {test} from 'node:test';
import assert from 'node:assert/strict';
import {likelyJumpCut,proposeIntercuts,applyReviewedZoomFallback} from './persona-intercut-planner.mjs';
const timeline={version:1,clips:[{path:'a.mp4',startSec:0,durationSec:2},{path:'a.mp4',startSec:3,durationSec:2}]};
test('detect a same-camera time jump, but not a continuous take',()=>{
 assert.equal(likelyJumpCut(timeline.clips[0],timeline.clips[1]),true);
 assert.equal(likelyJumpCut(timeline.clips[0],{...timeline.clips[1],startSec:2}),false);
});
test('suggest gentle zoom rather than invent a B-roll shot',()=>{
 const p=proposeIntercuts(timeline);assert.equal(p.suggestions[0].status,'ZOOM_FALLBACK_CANDIDATE');
 assert.equal(timeline.clips[0].intercutFallback,undefined);
 assert.equal(p.publicationApproved,false);
 const edited=applyReviewedZoomFallback(timeline,p,{reviewedAfterClips:[1]});
 assert.equal(edited.clips[0].intercutFallback.kind,'slow_push_in');
 assert.equal(timeline.clips[0].intercutFallback,undefined);
});
test('author-reviewed rights-cleared B-roll is delegated to existing renderer',()=>{
 const p=proposeIntercuts(timeline,{eligibleBroll:[{afterClip:1,isVerified:true,rightsConfirmed:true,authorReviewed:true,approvedForEdit:true,assetId:'sha256:'+'a'.repeat(64),durationSec:1.5}]});
 assert.equal(p.suggestions[0].status,'APPROVED_BROLL_AVAILABLE');
 assert.equal(p.suggestions[0].mode,'existing-approved-broll-renderer');
});
test('non-approved B-roll never passes',()=>{
 const p=proposeIntercuts(timeline,{eligibleBroll:[{afterClip:1,rightsConfirmed:false,authorReviewed:true,approvedForEdit:true,isVerified:true,durationSec:1.3}]});
 assert.equal(p.suggestions[0].status,'ZOOM_FALLBACK_CANDIDATE');
});
test('preserve original music when there is no suitable B-roll',()=>{
 const x={version:1,clips:[{...timeline.clips[0],preserveOriginalAudio:true},timeline.clips[1]]};
 assert.equal(proposeIntercuts(x).suggestions[0].status,'NEEDS_REVIEW');
});
