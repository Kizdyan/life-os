import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectCarouselProviders} from './persona-carousel-provider-preflight.mjs';

test('uses only existing local GET routes and discards worker credentials',async()=>{
 const calls=[];
 const report=await inspectCarouselProviders({fetchImpl:async(url,opts)=>{
  calls.push(url);
  assert.equal(opts.method,undefined);
  assert.equal(opts.redirect,'error');
  if(url.endsWith('/health'))return {ok:true,json:async()=>({service:'persona-media-worker',token:'private-token',carouselResearch:{configured:true}})};
  assert.equal(opts.headers['X-Persona-Worker-Token'],'private-token');
  return {ok:true,json:async()=>({configured:true,model:'test-image-model',status:'NEEDS_CONSENT',secret:'private-key'})};
 }});
 assert.equal(calls.length,2);
 assert.equal(report.worker,'CONNECTED');
 assert.equal(report.research,'KEY_CONFIGURED');
 assert.equal(report.images.configured,true);
 assert.equal(report.paidRequests,0);
 assert.equal(report.liveProviderVerified,false);
 assert.doesNotMatch(JSON.stringify(report),/private-token|private-key/);
});
test('falls back to split local Worker and reports missing providers without inventing readiness',async()=>{
 const report=await inspectCarouselProviders({fetchImpl:async(url)=>{
  if(url.includes(':3000/'))throw Error('not running');
  if(url.endsWith('/health'))return {ok:true,json:async()=>({service:'persona-media-worker',token:'private-token',carouselResearch:{configured:false}})};
  return {ok:true,json:async()=>({configured:false,status:'BLOCKED'})};
 }});
 assert.equal(report.launcher,'split');
 assert.equal(report.research,'KEY_MISSING');
 assert.equal(report.images.status,'BLOCKED');
 assert.equal(report.liveProviderVerified,false);
});
test('unavailable worker produces UNKNOWN, not a false missing-key diagnosis',async()=>{
 const report=await inspectCarouselProviders({fetchImpl:async()=>{throw Error('offline')}});
 assert.equal(report.worker,'UNAVAILABLE');
 assert.equal(report.research,'UNKNOWN');
 assert.equal(report.paidRequests,0);
});
