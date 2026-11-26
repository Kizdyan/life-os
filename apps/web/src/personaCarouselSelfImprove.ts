import {reviseEditorialPost,type EditorialPost,type BrandTrialStyle} from './personaEditorialModel';
import {brandTrialArt,isLocalBrandTrialSlide} from './personaJawsBrandTrial';
import {reviewRenderedSlide,type VisualOpinion} from './personaCarouselVisualReview';

export type ImprovementAttempt={index:number;before:VisualOpinion;after:VisualOpinion|null;accepted:boolean;reason:string};
export function betterVisualOpinion(before:VisualOpinion,after:VisualOpinion):boolean{
 if(JSON.stringify(before.referenceEvidence??[])!==JSON.stringify(after.referenceEvidence??[]))return false;
 if(before.model!==after.model||before.index!==after.index||before.sha256===after.sha256)return false;
 const keys=Object.keys(before.scores) as (keyof VisualOpinion['scores'])[];
 if(keys.some(k=>after.scores[k]<before.scores[k]))return false;
 const major=(o:VisualOpinion)=>o.issues.filter(x=>x.severity==='major').length;
 return major(after)<=major(before)&&after.issues.length<=before.issues.length&&
  (keys.some(k=>after.scores[k]>before.scores[k])||major(after)<major(before)||after.issues.length<before.issues.length);
}
/** Deterministic bounded candidate. Critic output selects a design dimension, not executable instructions. */
export function proposeStyleCandidate(post:EditorialPost,index:number,opinion:VisualOpinion):EditorialPost|null{
 const slide=post.slides[index];
 if(!slide||!isLocalBrandTrialSlide(post,slide)||post.approvals.design||opinion.index!==index+1||opinion.status!=='REVISION_SUGGESTED')return null;
 const spec=brandTrialArt(slide.id),style=slide.brandTrialStyle??{};
 const current:Required<BrandTrialStyle>={palette:spec.palette==='dark'?'dark':'light',layout:index===0?'image-bottom':index%2===1?'image-top':'image-middle',font:'classic',image:'normal',...style};
 const priority=(k:keyof VisualOpinion['scores'])=>opinion.scores[k]<=2||opinion.issues.some(x=>x.dimension===k&&x.severity==='major');
 let patch:BrandTrialStyle;
 if(priority('readability')||priority('hierarchy')){
  patch=current.image!=='smaller'?{image:'smaller'}:current.font==='classic'?{font:'literary'}:{layout:current.layout==='image-top'?'image-bottom':'image-top'};
 }else if(priority('composition')){
  patch={layout:current.layout==='image-top'?'image-bottom':'image-top'};
 }else if(priority('brandCoherence')){
  patch={palette:current.palette==='light'?'dark':'light'};
 }else if(priority('imageRelevance')){
  return null; // Cannot change subject matter without an authorized image source.
 }else return null;
 return reviseEditorialPost(post,{slides:post.slides.map((s,i)=>i===index?{...s,brandTrialStyle:{...style,...patch}}:s)});
}
export async function improveCarouselDraft(original:EditorialPost,options:{
 signal:AbortSignal;review?:(post:EditorialPost,index:number,signal:AbortSignal)=>Promise<VisualOpinion>;
 onBaseline?:(r:VisualOpinion)=>void;onAttempt?:(r:ImprovementAttempt)=>void;maxAttempts?:number;
}){
 if(original.approvals.design||!original.slides.every(s=>isLocalBrandTrialSlide(original,s)))throw Error('Автоправки пока доступны только для неутверждённого локального бренд-теста');
 const review=options.review??reviewRenderedSlide,signal=options.signal;
 const budget=Math.min(3,Math.max(0,Math.floor(options.maxAttempts??3)));
 const baseline:VisualOpinion[]=[],attempts:ImprovementAttempt[]=[];
 let current=original;
 for(const [i] of original.slides.entries()){
  signal.throwIfAborted();const r=await review(original,i,signal);signal.throwIfAborted();baseline.push(r);options.onBaseline?.(r);
 }
 const targets=baseline.filter(r=>r.status==='REVISION_SUGGESTED').sort((a,b)=>Math.min(...Object.values(a.scores))-Math.min(...Object.values(b.scores))||a.index-b.index);
 for(const before of targets){
  signal.throwIfAborted();if(attempts.length>=budget)break;
  const index=before.index-1,candidate=proposeStyleCandidate(current,index,before);
  if(!candidate)continue;
  let attempt:ImprovementAttempt;
  try{
   const after=await review(candidate,index,signal);signal.throwIfAborted();
   const accepted=betterVisualOpinion(before,after);
   attempt={index:before.index,before,after,accepted,reason:accepted?'Улучшение по оценке той же модели без снижения других баллов':'Нет доказанного улучшения без ухудшений'};
   if(accepted)current=candidate;
  }catch(e){
   signal.throwIfAborted();
   attempt={index:before.index,before,after:null,accepted:false,reason:e instanceof Error?e.message:String(e)};
  }
  attempts.push(attempt);options.onAttempt?.(attempt);
 }
 return {candidate:current===original?null:current,baseline,attempts,remaining:targets.filter(r=>!attempts.some(a=>a.index===r.index&&a.accepted&&a.after?.status==='AUTHOR_REVIEW_REQUIRED')).map(r=>r.index),approved:false as const};
}
