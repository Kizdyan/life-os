import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequest,newJob,markInputReady,transition} from '../packages/core/src/persona-processing-contract.mjs';
import {PINNED_VIDEO_ENGINE,makeProcessedAsset,validProcessedAsset} from '../packages/core/src/persona-processed-asset.mjs';
const request=createRequest({assetId:'d'.repeat(32),projectId:'persona:owner:project:v1',contentItemId:'content:idea',
 ideaId:'idea',ideaVersion:4,sessionId:'shoot:id',mime:'video/mp4',filename:'video.mp4',bytes:8192});
test('a processed video is pinned to exact original asset, session, version and attempt',()=>{
 const job=transition(markInputReady(newJob(request),8192),'processing');
 const meta=makeProcessedAsset(job,{bytes:2048,sha256:'f'.repeat(64),width:720,height:1280,codec:'h264'});
 assert.equal(meta.engineCommit,PINNED_VIDEO_ENGINE);
 assert.equal(meta.sourceAssetId,request.assetId);
 assert.equal(meta.processingRequestId,request.id);
 assert(validProcessedAsset(job,meta));
 for(const change of [{sourceAssetId:'a'.repeat(32)},{sessionId:'other'},
   {ideaVersion:5},{attempt:2},{sha256:'bad'},{engineCommit:'other'}]){
  assert.equal(validProcessedAsset(job,{...meta,...change}),false);
 }
 assert.equal(validProcessedAsset({...job,attempt:1},meta),false);
});
test('output manifest rejects fake video, wrong aspect, empty data and bad hash',()=>{
 const job=transition(markInputReady(newJob(request),8192),'processing');
 const info={bytes:2048,sha256:'f'.repeat(64),width:720,height:1280,codec:'h264'};
 assert.throws(()=>makeProcessedAsset(job,{...info,codec:'none'}));
 assert.throws(()=>makeProcessedAsset(job,{...info,width:1280,height:720}));
 assert.throws(()=>makeProcessedAsset(job,{...info,sha256:'NaN'}));
 assert.throws(()=>makeProcessedAsset(job,{...info,bytes:1}));
});
