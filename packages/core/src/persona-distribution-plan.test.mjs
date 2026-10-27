import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDistributionPlan,updateDelivery,distributionSummary} from './persona-distribution-plan.mjs';
const masterSha256='a'.repeat(64);
test('one approved reel targets four platforms without claiming publication',()=>{
 const plan=buildDistributionPlan({contentId:'clip-1',format:'reel',approved:true,masterSha256});
 assert.deepEqual(plan.deliveries.map(d=>d.channel),['instagram','youtube-shorts','vk-video','tiktok']);
 assert.equal(distributionSummary(plan).complete,false);
 assert.equal(distributionSummary(plan).published,0);
});
test('requires verified post ID and timestamp for each successful publication',()=>{
 const plan=buildDistributionPlan({contentId:'clip-2',format:'reel',approved:true,masterSha256});
 assert.throws(()=>updateDelivery(plan,{channel:'instagram',status:'published'}));
 const next=updateDelivery(plan,{channel:'instagram',status:'published',externalPostId:'post-123',verifiedAt:'2026-10-27T12:00:00Z'});
 assert.equal(distributionSummary(next).published,1);
 assert.equal(distributionSummary(next).complete,false);
 assert.throws(()=>updateDelivery(next,{channel:'instagram',status:'uploading'}));
});
test('does not allow upload before author approval',()=>{
 const plan=buildDistributionPlan({contentId:'clip-3',format:'reel',masterSha256});
 assert.throws(()=>updateDelivery(plan,{channel:'instagram',status:'uploading'}));
});
test('rejects invalid channels and exposes partial failure',()=>{
 assert.throws(()=>buildDistributionPlan({contentId:'clip-4',format:'photo',masterSha256,channels:['tiktok']}));
 const plan=buildDistributionPlan({contentId:'clip-5',format:'reel',approved:true,masterSha256});
 const failed=updateDelivery(plan,{channel:'tiktok',status:'manual_required',error:'provider unsupported'});
 assert.deepEqual(distributionSummary(failed).needsAttention,['tiktok']);
});
