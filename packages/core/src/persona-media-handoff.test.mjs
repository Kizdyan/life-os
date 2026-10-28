import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluatePersonaMediaHandoff,buildVerifiedPersonaDeliveryInput} from './persona-media-handoff.mjs';
import {buildDistributionPlan} from './persona-distribution-plan.mjs';
const sha256='b'.repeat(64);
const video={path:'exports/master.mp4',sha256,fileExists:true,probeVerified:true,bytes:1250000,durationSec:24,fps:30,width:1080,height:1920,videoCodec:'h264',audioCodec:'aac',blackFrameCheckPassed:true,audioCheckPassed:true};
test('verified author-approved render can enter per-platform delivery queue',()=>{
 const handoff=evaluatePersonaMediaHandoff({contentId:'reel-1',format:'reel',assets:[video],authorApproved:true});
 assert.equal(handoff.passed,true);
 const plan=buildDistributionPlan(buildVerifiedPersonaDeliveryInput({handoff}));
 assert.equal(plan.deliveries.length,4);
 assert.ok(plan.deliveries.every(d=>d.status==='awaiting_provider_check'));
});
test('missing render or absent approval cannot publish',()=>{
 const noApproval=evaluatePersonaMediaHandoff({contentId:'reel-1',format:'reel',assets:[video]});
 assert.equal(noApproval.passed,false);
 assert.throws(()=>buildVerifiedPersonaDeliveryInput({handoff:noApproval}));
 const noFile=evaluatePersonaMediaHandoff({contentId:'reel-1',format:'reel',assets:[{...video,fileExists:false}],authorApproved:true});
 assert.equal(noFile.passed,false);
});
test('reject missing technical QA evidence and invalid media',()=>{
 const bad=evaluatePersonaMediaHandoff({contentId:'reel-1',format:'reel',assets:[{...video,audioCheckPassed:false,sha256:'bad',fps:0}],authorApproved:true});
 assert.ok(bad.errors.some(e=>e.includes('SHA256')));
 assert.ok(bad.errors.some(e=>e.includes('fps')));
 assert.ok(bad.errors.some(e=>e.includes('audio check')));
});
test('verified still photo can pass without video-only fields',()=>{
 const photo=evaluatePersonaMediaHandoff({contentId:'photo-1',format:'photo',assets:[{path:'photo.png',sha256,fileExists:true,probeVerified:true,bytes:300000,width:1080,height:1350,imageFormat:'png'}],authorApproved:true});
 assert.equal(photo.passed,true);
});
