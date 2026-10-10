import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequest, newJob, transition, canClaim, retry, markInputReady, publicJob, JOB_STATES } from '../packages/core/src/persona-processing-contract.mjs';

const input={assetId:'a'.repeat(32),projectId:'persona:owner:project:v1',contentItemId:'content:idea',ideaId:'idea',ideaVersion:2,sessionId:'shoot:id',mime:'video/mp4',filename:'one.mp4',bytes:5500};

test('immutable deterministic key and full lineage',()=>{
 const request=createRequest(input);
 assert.equal(request.id,'job-'+input.assetId);
 assert.equal(request.ideaVersion,2);
 assert.deepEqual(createRequest({...input}),request);
 assert.throws(()=>createRequest({...input,assetId:'../oops'}));
 assert.throws(()=>createRequest({...input,mime:'image/jpeg'}));
});

test('five status contract with human review gate',()=>{
 assert.deepEqual(JOB_STATES,['queued','processing','review','ready','failed']);
 let job=newJob(createRequest(input));
 assert.equal(job.status,'queued');
 assert.equal(canClaim(job),false);
 job=markInputReady(job,5500);
 assert.equal(canClaim(job),true);
 job=transition(job,'processing');
 job=transition(job,'review',{instagramFile:'instagram.mp4'});
 assert.equal(job.status,'review');
 job=transition(job,'ready');
 assert.equal(job.status,'ready');
 assert.throws(()=>transition(job,'processing'));
});

test('failed processing keeps same ID, retry is explicit and idempotent in queue',()=>{
 let job=markInputReady(newJob(createRequest(input)),5500);
 job=transition(transition(job,'processing'),'failed',{error:'engine unavailable'});
 const next=retry(job);
 assert.equal(next.request.id,job.request.id);
 assert.equal(next.status,'queued');
 assert.equal(next.attempt,job.attempt+1);
 assert.throws(()=>retry(next));
 assert.throws(()=>transition(next,'ready'));
});

test('rejects unsafe output and immutable client input',()=>{
 let job=markInputReady(newJob(createRequest(input)),5500);
 job=transition(job,'processing');
 assert.throws(()=>transition(job,'review',{instagramFile:'../../private'}));
 assert.throws(()=>markInputReady(job,5500));
 assert.throws(()=>createRequest({...input,bytes:0}));
 assert.throws(()=>createRequest({...input,ideaVersion:0}));
 assert.equal(publicJob(job).request.assetId,input.assetId);
});

test('review output cannot attach another source or attempt',()=>{
 const request=createRequest(input);
 const processing=transition(markInputReady(newJob(request),input.bytes),'processing');
 assert.throws(()=>transition(processing,'review',{instagramFile:'instagram.mp4',processedAsset:{sourceAssetId:'wrong',processingRequestId:request.id}}));
});
