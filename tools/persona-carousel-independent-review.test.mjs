import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reviewPersonaCarousel,carouselReviewFingerprint} from './persona-carousel-independent-review.mjs';
const url='https://example.org/interview';
const quote='The composer tuned the tone to match the refrigerator.';
const input={title:'Тестовый заголовок',caption:'Тестовая подпись',researchModel:'openai/gpt-test',slides:Array.from({length:5},(_,i)=>({text:'Тестовый слайд '+i,urls:[url],interpretation:false}))};
const env={PERPLEXITY_API_KEY:'private-test',PERSONA_CAROUSEL_REVIEW_MODEL:'anthropic/claude-test'};
function fixture(){
 return {checks:['title','caption',...input.slides.map((_,i)=>'slide-'+(i+1))].map(target=>({target,verdict:'SUPPORTED',reason:'Тестовый ответ',evidence:[{url,quote}]})),editorial:{hook:'Тест',narrative:'Тест',positioning:'Тест',revision:'Тест',verdict:'PASS'}};
}
function response(report=fixture(),contents=[{url,snippet:quote}],model='anthropic/claude-test'){
 return {status:'completed',model,output:[{type:'fetch_url_results',contents},{type:'message',content:[{type:'output_text',text:JSON.stringify(report)}]}]};
}
const run=(data)=>reviewPersonaCarousel({input,consent:true,env,fetchImpl:async()=>({ok:true,json:async()=>data})});
test('actual extracted snippets are required; passing review is not author approval',async()=>{
 const r=await run(response());
 assert.equal(r.status,'REVIEW_CANDIDATE');assert.equal(r.approved,false);assert.equal(r.published,false);
 assert.equal(r.fingerprint,carouselReviewFingerprint(input));assert.equal(r.checks.length,7);
 assert.notEqual(r.fingerprint,carouselReviewFingerprint({...input,caption:'Изменённый текст'}));
 const bad=fixture();bad.checks[0].verdict='CONTRADICTED';
 assert.equal((await run(response(bad))).status,'NEEDS_REVISION');
});
test('rejects invented quotations, unavailable sources, missing public copy and model mismatch',async()=>{
 const bad=fixture();bad.checks[0].evidence[0].quote='A quotation that was never found in any fetched page.';
 await assert.rejects(run(response(bad)),/Выдержка/);
 await assert.rejects(run(response(fixture(),[])),/Выдержка/);
 await assert.rejects(run(response(fixture(),[{url,snippet:'no_result_returned '+quote}])),/Выдержка/);
 const partial=fixture();partial.checks.pop();
 await assert.rejects(run(response(partial)),/охватывает/);
 await assert.rejects(run(response(fixture(),undefined,'openai/gpt-test')),/Модель/);
 const relabel=fixture();relabel.checks[2].verdict='INTERPRETATION';relabel.checks[2].evidence=[];
 await assert.rejects(run(response(relabel)),/интерпретацию/);
});
test('no consent, invalid URL or same model cannot trigger a paid call',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw Error('not expected')};
 for(const request of [{consent:false},{env:{...env,PERSONA_CAROUSEL_REVIEW_MODEL:'openai/gpt-test'}},{input:{...input,slides:input.slides.map(s=>({...s,urls:['https://127.0.0.1/admin']}))}}])
  await assert.rejects(reviewPersonaCarousel({input,consent:true,env,fetchImpl,...request}));
 assert.equal(calls,0);
});
test('request uses bounded URL extraction and does not put the key into model input',async()=>{
 let calls=0;
 const r=await reviewPersonaCarousel({input,consent:true,env,fetchImpl:async(url,opts)=>{
  calls++;assert.equal(url,'https://api.perplexity.ai/v1/agent');assert.equal(opts.headers.Authorization,'Bearer private-test');
  const body=JSON.parse(opts.body);assert.deepEqual(body.tools,[{type:'fetch_url',max_urls:10}]);assert.equal(body.store,false);
  assert.doesNotMatch(opts.body,/private-test/);return {ok:true,json:async()=>response()};
 }});
 assert.equal(calls,1);assert.equal(r.status,'REVIEW_CANDIDATE');
});

test('different OpenAI versions, same non-OpenAI family, and unknown alias are refused before spending',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw Error('not expected')};
 for(const [researchModel,model] of [['openai/gpt-test','openai/gpt-other'],['anthropic/claude-test','anthropic/claude-other'],['openai/gpt-test','router/auto']]){
  await assert.rejects(reviewPersonaCarousel({input:{...input,researchModel},consent:true,env:{...env,PERSONA_CAROUSEL_REVIEW_MODEL:model},fetchImpl}),/критик/);
 }
 assert.equal(calls,0);
});
test('editorial rejection blocks even when every factual check passes',async()=>{
 const bad=fixture();bad.editorial.verdict='REVISE';assert.equal((await run(response(bad))).status,'NEEDS_REVISION');
 delete bad.editorial.verdict;await assert.rejects(run(response(bad)),/вердикта/);
});
