import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runEditorialPipeline} from './persona-carousel-editorial-pipeline.mjs';
import {carouselReviewFingerprint} from './persona-carousel-independent-review.mjs';
const env={PERPLEXITY_API_KEY:'test-only',PERSONA_CAROUSEL_RESEARCH_MODEL:'openai/gpt-test',PERSONA_CAROUSEL_REVIEW_MODEL:'anthropic/claude-test'};
const request={mode:'discover',history:[],maxCalls:4,consent:true};
const packet={title:'A distinct film story',angle:'An angle',caption:'Initial caption',slides:Array.from({length:5},(_,i)=>({text:'Slide '+i,visualDirection:'Specific image '+i,sources:[{title:'Source',url:'https://example.org/story'}],interpretation:false}))};
const draft=p=>({provider:'perplexity',model:env.PERSONA_CAROUSEL_RESEARCH_MODEL,status:'UNVERIFIED',modelVerified:true,packet:p,approved:false,published:false});
const report=(input,pass)=>({provider:'perplexity',model:env.PERSONA_CAROUSEL_REVIEW_MODEL,fingerprint:carouselReviewFingerprint(input),status:pass?'REVIEW_CANDIDATE':'NEEDS_REVISION',editorial:{verdict:pass?'PASS':'REVISE',revision:'Fix the caption'},approved:false,published:false});
test('passes in two calls, no automatic author approval or publication',async()=>{
 let charged=0;
 const r=await runEditorialPipeline({request,env,beforeCall:()=>charged++,research:async()=>draft(packet),review:async({input})=>report(input,true)});
 assert.equal(r.status,'AUTHOR_REVIEW_REQUIRED');assert.equal(r.calls,2);assert.equal(charged,2);assert.equal(r.approved,false);assert.equal(r.published,false);
});
test('negative critic triggers exactly one revised research and fresh independent review',async()=>{
 let researchCalls=0,reviewCalls=0;
 const r=await runEditorialPipeline({request,env,research:async input=>{
  researchCalls++;
  if(researchCalls===2){assert.equal(input.mode,'topic');assert.equal(input.revisionRequest.review.status,'NEEDS_REVISION');return draft({...packet,caption:'Revised caption'})}
  return draft(packet);
 },review:async({input})=>report(input,++reviewCalls===2)});
 assert.equal(r.status,'AUTHOR_REVIEW_REQUIRED');assert.equal(r.calls,4);assert.equal(r.attempts.length,2);
 assert.notEqual(r.attempts[0].report.fingerprint,r.attempts[1].report.fingerprint);
 assert.equal(r.draft.packet.caption,'Revised caption');
});
test('no silent retries for missing critic, budget, stale receipt or provider failure',async()=>{
 let calls=0;
 const research=async()=>{calls++;return draft(packet)},review=async()=>{calls++;throw Error('Unavailable')};
 await assert.rejects(runEditorialPipeline({request:{...request,consent:false},env,research,review}));
 await assert.rejects(runEditorialPipeline({request,env:{...env,PERSONA_CAROUSEL_REVIEW_MODEL:'openai/gpt-other'},research,review}));
 assert.equal(calls,0);
 const blocked=await runEditorialPipeline({request,env,research,review});assert.equal(blocked.status,'BLOCKED');assert.equal(blocked.calls,2);assert.equal(blocked.attempts[0].report,null);
 const limited=await runEditorialPipeline({request:{...request,maxCalls:2},env,research,review:async({input})=>report(input,false)});
 assert.equal(limited.status,'NEEDS_REVISION');assert.equal(limited.calls,2);
 const stale=await runEditorialPipeline({request,env,research,review:async({input})=>({...report(input,true),fingerprint:'0'.repeat(64)})});
 assert.equal(stale.status,'BLOCKED');assert.equal(stale.calls,2);
 const unchanged=await runEditorialPipeline({request,env,research,review:async({input})=>report(input,false)});
 assert.equal(unchanged.status,'NEEDS_REVISION');assert.equal(unchanged.calls,3);
});
