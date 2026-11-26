import type {EditorialPost} from './personaEditorialModel';
import {independentCritic} from '../../../packages/core/src/persona-critic-independence.mjs';
export type CarouselReviewInput={title:string;caption:string;researchModel:string;slides:{text:string;urls:string[];interpretation:boolean}[]};
export type CarouselReviewReport={status:'NEEDS_REVISION'|'REVIEW_CANDIDATE';provider:'perplexity';model:string;fingerprint:string;reviewedAt:string;approved:false;published:false;checks:{target:string;verdict:'SUPPORTED'|'CONTRADICTED'|'INSUFFICIENT'|'INTERPRETATION';reason:string;evidence:{url:string;quote:string}[]}[];editorial:{hook:string;narrative:string;positioning:string;revision:string;verdict?:'PASS'|'REVISE'}};
export type StoredCarouselReview={input:CarouselReviewInput;report:CarouselReviewReport};
export function carouselReviewInput(post:EditorialPost):CarouselReviewInput{
 const r=post.research;
 if(r?.provider!=='perplexity'||!r.discovery)throw Error('Нет исследовательского пакета Perplexity');
 return {title:post.title,caption:post.caption,researchModel:r.discovery.model,
  slides:post.slides.map(s=>({text:s.text,urls:[...new Set(r.sourceItems.filter(x=>x.slideId===s.id).map(x=>x.url))],interpretation:r.interpretationSlides.includes(s.id)}))};
}
export function currentCarouselReview(post:EditorialPost):CarouselReviewReport|undefined{
 const audit=post.research?.independentReview;
 if(!audit)return;
 try{if(JSON.stringify(audit.input)===JSON.stringify(carouselReviewInput(post)))return audit.report}catch{}
}
const bounded=(v:unknown,n:number):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
export function validStoredCarouselReview(value:unknown):value is StoredCarouselReview{
 if(!value||typeof value!=='object')return false;
 const {input,report}=value as StoredCarouselReview;
 if(!input||!bounded(input.title,160)||!bounded(input.caption,4500)||!bounded(input.researchModel,120)||!Array.isArray(input.slides)||input.slides.length<5||input.slides.length>8||
  input.slides.some(s=>!s||!bounded(s.text,600)||!Array.isArray(s.urls)||s.urls.length>4||s.urls.some(u=>!bounded(u,2048))||typeof s.interpretation!=='boolean'))return false;
 if(!report||report.provider!=='perplexity'||report.approved!==false||report.published!==false||!bounded(report.model,120)||report.model===input.researchModel||
  !/^[a-f0-9]{64}$/.test(report.fingerprint)||!Number.isFinite(Date.parse(report.reviewedAt))||!['NEEDS_REVISION','REVIEW_CANDIDATE'].includes(report.status)||!Array.isArray(report.checks)||report.checks.length!==input.slides.length+2)return false;
 const targets=['title','caption',...input.slides.map((_,i)=>'slide-'+(i+1))];
 if(!targets.every(target=>report.checks.filter(c=>c?.target===target).length===1))return false;
 for(const c of report.checks){
  if(!['SUPPORTED','CONTRADICTED','INSUFFICIENT','INTERPRETATION'].includes(c.verdict)||!bounded(c.reason,800)||!Array.isArray(c.evidence)||c.evidence.length>3)return false;
  const index=c.target.startsWith('slide-')?Number(c.target.slice(6))-1:-1;
  const urls=index>=0?input.slides[index].urls:input.slides.flatMap(s=>s.urls);
  if(c.evidence.some(e=>!e||!urls.includes(e.url)||!bounded(e.quote,200)||e.quote.length<20))return false;
  if(['SUPPORTED','CONTRADICTED'].includes(c.verdict)&&!c.evidence.length)return false;
  if(index>=0&&c.verdict==='INTERPRETATION'&&!input.slides[index].interpretation)return false;
 }
 if(report.editorial?.verdict!==undefined&&!['PASS','REVISE'].includes(report.editorial.verdict))return false;
 if(report.status!==((report.editorial?.verdict==='REVISE'||report.checks.some(c=>['CONTRADICTED','INSUFFICIENT'].includes(c.verdict)))?'NEEDS_REVISION':'REVIEW_CANDIDATE'))return false;
 return Boolean(report.editorial&&(['hook','narrative','positioning','revision'] as const).every(k=>bounded(report.editorial[k],800)));
}
export async function validateCarouselReviewReceipt(input:CarouselReviewInput,report:unknown):Promise<StoredCarouselReview>{
 const audit={input,report};
 if(!validStoredCarouselReview(audit))throw Error('Некорректный отчёт независимой проверки');
 const bytes=new TextEncoder().encode(JSON.stringify(input));
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
 if(sha!==audit.report.fingerprint)throw Error('Отчёт относится к другому тексту');
 return audit;
}

/** Historical reports remain readable, but only a current cross-family verdict can
 * authorize the machine-researched publication package. Author approval is separate. */
export function independentEditorialGate(post:EditorialPost):boolean{
 if(post.research?.provider!=='perplexity')return true;
 const r=currentCarouselReview(post);
 return Boolean(r&&r.status==='REVIEW_CANDIDATE'&&r.editorial.verdict==='PASS'&&independentCritic(post.research.discovery?.model,r.model).eligible);
}
