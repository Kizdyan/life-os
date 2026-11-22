import content from '../../../config/carousel-fridge-hum-v3.json';
import {createFridgeHumCarousel,prepareFridgeHumCarousel} from './personaProductionCarousel';
import {importResearchCarousel} from './personaResearchCarousel';
import originals from '../public/carousel-backgrounds/fridge-hum-v1/provenance.json';
import type {EditorialPost} from './personaEditorialModel';
export const FRIDGE_HUM_V3_ID=content.id;
export function createFridgeHumV3(now='2026-11-22T00:00:00Z'):EditorialPost{
 const p=importResearchCarousel(content.id,JSON.stringify(content.research),now),v1=createFridgeHumCarousel();
 return {...p,fontPreset:'literata-golos',compositionPreset:'fridge-hum-v3',
  approvals:{...p.approvals,textApproved:false,designApproved:false},
  slides:p.slides.map((s,i)=>({...s,kicker:'',...content.hierarchy[i],background:{...v1.slides[i].background!,
   generatedRef:p.id+'/'+v1.slides[i].background!.generatedRef!.split('/')[1]}}))};
}
export async function prepareFridgeHumV3(){return prepareFridgeHumCarousel(createFridgeHumV3())}
export function fridgeHumV3Evidence(post:EditorialPost){
 const signature=(p:EditorialPost)=>JSON.stringify([p.title,p.topic,p.caption,p.slides.map(s=>[s.id,s.text]),
  p.research?.sourceItems.map(s=>[s.slideId,s.title,s.url]),p.research?.interpretationSlides]);
 return {status:signature(post)===signature(createFridgeHumV3())?'MATCHES_CHECKED_COPY':'NEEDS_RECHECK',
  audit:content.sourceAudit,parentRevision:content.parentRevision,authorApprovalGranted:false,
  artworkReview:'READY_FOR_AUTHOR_REVIEW',publicationAllowed:false,
  imageTreatment:post.slides.every((s,i)=>s.background?.sha256===originals[i]?.sha256&&s.background?.provenance?.provider==='codex-imagegen')?
   'Preserved V1 illustrations; no new generation':'Changed inputs; inspect per-slide provenance',
  treatments:post.compositionPreset==='fridge-hum-v3'?content.visuals:undefined,
  referenceStandardStatus:content.referenceStandardStatus};
}
