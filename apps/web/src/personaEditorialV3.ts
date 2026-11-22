import content from '../../../config/carousel-fridge-hum-v3.json';
import finalPass from '../../../config/carousel-fridge-hum-editorial-pass.json';
import {createFridgeHumCarousel,prepareFridgeHumCarousel} from './personaProductionCarousel';
import {importResearchCarousel} from './personaResearchCarousel';
import originals from '../public/carousel-backgrounds/fridge-hum-v1/provenance.json';
import {composeEditorialByMeaning,reviseEditorialPost,setEditorialInterpretationReviewed,validatePost,editorialTextHash,type EditorialPost} from './personaEditorialModel';
export const FRIDGE_HUM_V3_ID=content.id;
export function createFridgeHumV3(now='2026-11-22T00:00:00Z'):EditorialPost{
 const p=importResearchCarousel(content.id,JSON.stringify(content.research),now),v1=createFridgeHumCarousel();
 return {...p,fontPreset:'literata-golos',compositionPreset:'fridge-hum-v3',
  approvals:{...p.approvals,textApproved:false,designApproved:false},
  slides:p.slides.map((s,i)=>({...s,kicker:'',...content.hierarchy[i],background:{...v1.slides[i].background!,
   generatedRef:p.id+'/'+v1.slides[i].background!.generatedRef!.split('/')[1]}}))};
}
export async function prepareFridgeHumV3(){return prepareFridgeHumCarousel(createFridgeHumV3())}
const signature=(p:EditorialPost)=>JSON.stringify([p.title,p.topic,p.caption,p.slides.map(s=>[s.id,s.text]),
  p.research?.sourceItems.map(s=>[s.slideId,s.title,s.url]),p.research?.interpretationSlides]);
function finalCopy(post:EditorialPost,now:string){
 const next=reviseEditorialPost(post,{caption:finalPass.caption,
  slides:post.slides.map((s,i)=>{const patch=finalPass.updates.find(p=>p.index===i);return patch?{...s,headline:patch.headline,body:patch.body}:s})},now);
 return setEditorialInterpretationReviewed(next,next.slides[6].id,true,now);
}
function previousCopy(post:EditorialPost,now:string){
 const previous=finalPass.previousPublicCopy;
 const next=reviseEditorialPost(post,{caption:previous.caption,slides:post.slides.map((s,i)=>{
  const old=previous.updates.find(p=>p.index===i);return old?{...s,headline:old.headline,body:old.body}:s;
 })},now);
 return setEditorialInterpretationReviewed(next,next.slides[6].id,true,now);
}
/** Historical copy fixture for replay/restore; never a new carousel or author approval. */
export function createPreviousFridgeHumFinalPass(){
 return previousCopy(finalCopy(composeEditorialByMeaning(createFridgeHumV3()),'2026-11-22T00:00:00Z'),'2026-11-22T00:00:00Z');
}
export function applyFridgeHumFinalPass(post:EditorialPost,now=new Date().toISOString()){
 const base=composeEditorialByMeaning(createFridgeHumV3()),expected=finalCopy(base,'2026-11-22T00:00:00Z');
 if(signature(post)===signature(expected))return post;
 const legacy=reviseEditorialPost(expected,{slides:expected.slides.map((s,i)=>i===4?{...s,headline:'Обмен звуками —\nдо сведения.'}:s)},'2026-11-22T00:00:00Z');
 if(post.id===FRIDGE_HUM_V3_ID&&post.compositionPreset==='semantic-editorial-v1'&&
  !post.approvals.content&&!post.approvals.design&&signature(post)===signature(legacy))
  return reviseEditorialPost(post,{slides:post.slides.map((s,i)=>i===4?{...s,headline:expected.slides[4].headline}:s)},now);
 const prior=previousCopy(expected,'2026-11-22T00:00:00Z');
 const priorTypo=reviseEditorialPost(prior,{slides:prior.slides.map((s,i)=>i===4?{...s,headline:'Обмен звуками —\nдо сведения.'}:s)},'2026-11-22T00:00:00Z');
 if(post.id===FRIDGE_HUM_V3_ID&&post.compositionPreset==='semantic-editorial-v1'&&!post.approvals.content&&!post.approvals.design&&
  [signature(prior),signature(priorTypo)].includes(signature(post)))return finalCopy(post,now);
 if(post.id!==FRIDGE_HUM_V3_ID||post.compositionPreset!=='semantic-editorial-v1'||
  post.approvals.content||post.approvals.design||signature(post)!==signature(base))
  throw Error('Финальная правка рассчитана на проверенную основу. Изменения сохранённой редакции не будут перезаписаны.');
 return finalCopy(post,now);
}
export const fridgeHumFinalSnapshotKey=(post:EditorialPost)=>'lifeos:persona:editorial-before-final:'+post.id+':'+finalPass.baseCommit;
export function preserveFridgeHumBeforeFinalPass(storage:Pick<Storage,'getItem'|'setItem'>,previous:EditorialPost,next:EditorialPost){
 const key=fridgeHumFinalSnapshotKey(next),raw=JSON.stringify(previous),existing=storage.getItem(key);
 if(existing!==null&&existing!==raw)throw Error('Архив предыдущей редакции уже существует и отличается; ничего не перезаписано.');
 if(existing===null)storage.setItem(key,raw);
 if(storage.getItem(key)!==raw)throw Error('Архив предыдущей редакции не подтвердился. Правка не применена.');
}
export function fridgeHumV3Evidence(post:EditorialPost,previousRevisionRaw?:string|null){
 const expectedFinal=finalCopy(composeEditorialByMeaning(createFridgeHumV3()),'2026-11-22T00:00:00Z');
 const finalMatches=signature(post)===signature(expectedFinal);
 let previousRevision:EditorialPost|undefined;
 if(previousRevisionRaw){previousRevision=JSON.parse(previousRevisionRaw);validatePost(previousRevision!)}
 return {status:finalMatches?'MATCHES_RECHECKED_COPY':signature(post)===signature(createFridgeHumV3())?'MATCHES_CHECKED_COPY':'NEEDS_RECHECK',
  sourceCheck:finalMatches?'PASS':'RECHECK_REQUIRED',
  sourceCheckScope:'Specific checked copy and cited passages; not the author source/content/design gate',
  checkedTextHash:finalMatches?editorialTextHash(post):undefined,
  audit:finalMatches?finalPass.sourceAudit:content.sourceAudit,parentRevision:content.parentRevision,previousRevision,authorApprovalGranted:false,
  artworkReview:'READY_FOR_AUTHOR_REVIEW',publicationAllowed:false,
  imageTreatment:post.slides.every((s,i)=>s.background?.sha256===originals[i]?.sha256&&s.background?.provenance?.provider==='codex-imagegen')?
   'Preserved V1 illustrations; no new generation':'Changed inputs; inspect per-slide provenance',
  treatments:post.compositionPreset==='fridge-hum-v3'?content.visuals:undefined,
  referenceStandardStatus:content.referenceStandardStatus};
}
