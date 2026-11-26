import {generatePersonaCarouselResearch,normalizeCarouselResearchInput} from './persona-carousel-research.mjs';
import {reviewPersonaCarousel,normalizeCarouselReviewInput,carouselReviewFingerprint} from './persona-carousel-independent-review.mjs';
import {independentCritic} from '../packages/core/src/persona-critic-independence.mjs';
export function normalizeEditorialPipelineRequest(raw){
 if(raw?.consent!==true||![2,4].includes(raw.maxCalls))throw Error('Нужно явное согласие на максимум 2 или 4 платных запроса');
 return {...normalizeCarouselResearchInput(raw),maxCalls:raw.maxCalls};
}
export function editorialPipelineModels(env){
 const creator=env.PERSONA_CAROUSEL_RESEARCH_MODEL||'openai/gpt-5.6-sol',critic=env.PERSONA_CAROUSEL_REVIEW_MODEL?.trim();
 if(!env.PERPLEXITY_API_KEY?.trim()||!independentCritic(creator,critic).eligible)throw Error('Не настроена независимая модель другого семейства или API-ключ');
 return {creator,critic};
}
function reviewInput(draft){
 return normalizeCarouselReviewInput({title:draft.packet.title,caption:draft.packet.caption,researchModel:draft.model,
  slides:draft.packet.slides.map(s=>({text:s.text,urls:s.sources.map(x=>x.url),interpretation:s.interpretation}))});
}
export async function runEditorialPipeline({request,env=process.env,research=generatePersonaCarouselResearch,review=reviewPersonaCarousel,beforeCall=()=>{}}){
 const input=normalizeEditorialPipelineRequest(request),models=editorialPipelineModels(env);
 const attempts=[];let calls=0,stage='research',draft=null;
 const result=(status,reason=null)=>({version:1,status,reason,calls,maxCalls:input.maxCalls,attempts,draft,approved:false,published:false});
 async function call(fn,params){
  if(calls>=input.maxCalls)throw Error('Лимит запросов исчерпан');
  await beforeCall();calls++;return fn({...params,consent:true,env});
 }
 try{
  for(let round=0;round<input.maxCalls/2;round++){
   stage=round?'revision':'research';
   const previous=draft;
   const proposal=await call(research,round?{mode:'topic',theme:previous.packet.title,revisionRequest:{packet:previous.packet,review:attempts.at(-1).report}}:input);
   if(proposal?.provider!=='perplexity'||proposal.status!=='UNVERIFIED'||proposal.approved!==false||proposal.published!==false||proposal.model!==models.creator||proposal.modelVerified!==true||!proposal.packet)throw Error('Модель автора или исследовательский результат не подтверждены');
   const checked=reviewInput(proposal);
   if(previous&&carouselReviewFingerprint(checked)===carouselReviewFingerprint(reviewInput(previous)))return result('NEEDS_REVISION','Исполнитель не изменил отклонённый текст');
   draft=proposal;
   const attempt={draft,report:null};attempts.push(attempt);
   stage='independent-review';
   const report=await call(review,{input:checked});
   if(report?.provider!=='perplexity'||report.model!==models.critic||report.fingerprint!==carouselReviewFingerprint(checked)||
    report.approved!==false||report.published!==false||!['REVIEW_CANDIDATE','NEEDS_REVISION'].includes(report.status)||
    !['PASS','REVISE'].includes(report.editorial?.verdict))throw Error('Независимое заключение не подтверждено');
   attempt.report=report;
   if(report.status==='REVIEW_CANDIDATE'&&report.editorial.verdict==='PASS')return result('AUTHOR_REVIEW_REQUIRED');
  }
  return result('NEEDS_REVISION','Лимит редакционных итераций исчерпан');
 }catch(error){return result('BLOCKED',stage+': '+String(error instanceof Error?error.message:error).slice(0,350))}
}
