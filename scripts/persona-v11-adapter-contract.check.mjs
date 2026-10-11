import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequest,newJob} from '../packages/core/src/persona-processing-contract.mjs';
import {makeV11Invocation,verifiedAdapterReply,V11_PROFILE,V11_TIMEOUT_MS} from '../packages/core/src/persona-v11-adapter-contract.mjs';
test('the exact external engine receives immutable source/version/session, attempt and Instagram profile',()=>{
 const request=createRequest({assetId:'f'.repeat(32),projectId:'project',contentItemId:'content',
 ideaId:'idea',ideaVersion:2,sessionId:'shoot',mime:'video/mp4',filename:'take.mp4',bytes:8192});
 const job=newJob(request);
 const signal=new AbortController().signal;
 const input=makeV11Invocation(job,{inputPath:'/tmp/input.media',outputDir:'/tmp/output',signal});
 assert.equal(input.processingRequestId,request.id);
 assert.equal(input.mediaAssetId,request.assetId);
 assert.equal(input.ideaVersion,2);assert.equal(input.sessionId,'shoot');
 assert.equal(input.attempt,0);assert.equal(input.outputProfile,V11_PROFILE);
 assert.equal(input.timeoutMs,V11_TIMEOUT_MS);assert.equal(input.signal,signal);
});
test('adapter needs explicit success and output path; no fabricated success',()=>{
 assert.throws(()=>verifiedAdapterReply({instagramPath:'/tmp/test.mp4'}));
 assert.throws(()=>verifiedAdapterReply({success:false,instagramPath:'/tmp/test.mp4'}));
 assert.equal(verifiedAdapterReply({success:true,instagramPath:'/tmp/test.mp4'}).instagramPath,'/tmp/test.mp4');
});
